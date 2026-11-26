import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { v4 as uuidv4 } from "uuid";
import { GitSyncManager } from "./gitSyncManager";
import { SecureStorageManager } from "./secureStorageManager";
import { ConfigurationManager } from "./configurationManager";

export interface Learning {
  // Core identification
  id: string;
  timestamp: number;
  source: "interaction" | "legacy" | "markdown" | "codebase" | "manual";

  // Project metadata
  projectName: string;
  projectPath: string;

  // Content
  question: string;
  solution: string;
  notes: string;
  context: string;

  // Technical classification
  language: string;
  frameworks: string[];
  tools: string[];

  // Semantic tagging for AI agents
  tags: string[];
  category:
    | "pattern"
    | "solution"
    | "debugging"
    | "architecture"
    | "optimization"
    | "testing"
    | "deployment"
    | "security"
    | "performance"
    | "other";
  problemType: string[]; // e.g., ['async', 'error-handling', 'state-management']
  concepts: string[]; // e.g., ['promises', 'race-conditions', 'memory-leaks']

  // Quality indicators
  outcome: "success" | "partial" | "failed" | "unknown";
  reliability: number; // 0-100: confidence in solution
  difficulty: "beginner" | "intermediate" | "advanced" | "expert";
  usageCount: number; // How many times this learning was used/referenced

  // Indexing fields for AI agents
  keywords: string[]; // Search optimization keywords
  relatedLearningIds: string[]; // Links to related learnings
  versions: {
    framework?: string;
    language?: string;
    vscode?: string;
    os?: string;
  };

  // Source tracking
  sourceFile?: string; // File where learning came from
  sourceLine?: number; // Line number in source
  documentedBy?: string; // Who documented it

  // AI agent metadata
  vectorId?: string; // For vector DB integration (future)
  semanticTags?: string[]; // ML-generated semantic tags
  lastUsed?: number; // Last time this learning was injected/referenced
  usefulness?: number; // User rating or auto-calculated score

  // Archival metadata (NEW)
  archived?: boolean; // Is this learning archived?
  archivedDate?: number; // When was it archived?
  archivedReason?: string; // Why was it archived? ("user-request", "old", "cleanup", "low-value")
  archivedNotes?: string; // User notes about why archived
}

export class LearningManager {
  private context: vscode.ExtensionContext;
  private learningsDir: vscode.Uri;
  private learningsFile: vscode.Uri; // For backward compatibility
  private learnings: Learning[] = [];
  private autoCapture: boolean = true;
  private maxStorageSize: number = 1000;
  private customStorageLocation: string = "";
  private gitSyncManager: GitSyncManager;
  private secureStorage: SecureStorageManager;
  private migrationComplete: boolean = false;
  private readonly _onDidChangeLearnings = new vscode.EventEmitter<void>();
  public readonly onDidChangeLearnings: vscode.Event<void> =
    this._onDidChangeLearnings.event;

  // Learnings organized by language and category for efficient access
  private learningsByLanguage: Map<string, Learning[]> = new Map();
  private learningsByCategory: Map<string, Learning[]> = new Map();
  private lazyLoadEnabled: boolean = true;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.secureStorage = new SecureStorageManager(context.secrets);
    this.gitSyncManager = new GitSyncManager(context, this.secureStorage);
    this.learningsDir = this.getLearningsDirPath();
    this.learningsFile = this.getLearningsFilePath();
    this.initializeStorage();
    this.updateConfig(); // Load config first to get lazyLoad setting
    this.loadLearnings();
  }

  private getLearningsDirPath(): vscode.Uri {
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const customPath = config.get<string>("customStorageLocation", "");

    if (customPath && customPath.trim()) {
      return vscode.Uri.file(path.join(customPath, "learnings"));
    }

    return vscode.Uri.joinPath(this.context.globalStorageUri!, "learnings");
  }

  private getLearningsFilePath(): vscode.Uri {
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const customPath = config.get<string>("customStorageLocation", "");

    if (customPath && customPath.trim()) {
      return vscode.Uri.file(path.join(customPath, "learnings.json"));
    }

    return vscode.Uri.joinPath(
      this.context.globalStorageUri!,
      "learnings.json",
    );
  }

  private async initializeStorage(): Promise<void> {
    try {
      // Create base learnings directory
      await vscode.workspace.fs.stat(this.learningsDir);
    } catch {
      await vscode.workspace.fs.createDirectory(this.learningsDir);
    }

    // Create subdirectories
    const subdirs = [
      vscode.Uri.joinPath(this.learningsDir, "by-language"),
      vscode.Uri.joinPath(this.learningsDir, "by-category"),
    ];

    for (const dir of subdirs) {
      try {
        await vscode.workspace.fs.stat(dir);
      } catch {
        await vscode.workspace.fs.createDirectory(dir);
      }
    }

    // Check if global storage directory exists
    if (!this.context.globalStorageUri) return;
    try {
      await vscode.workspace.fs.stat(this.context.globalStorageUri);
    } catch {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri);
    }
  }

  private async loadLearnings(): Promise<void> {
    try {
      // First, check if we need to migrate from old single-file format
      await this.migrateFromLegacyFormat();

      // If lazy loading is enabled, only load the index
      if (this.lazyLoadEnabled) {
        console.log(
          "[loadLearnings] Lazy loading enabled - loading index only",
        );
        this.learnings = [];
        this.learningsByLanguage.clear();
        this.learningsByCategory.clear();
        // Index will be loaded on-demand when needed
        return;
      }

      // Eager loading - Load all learnings from the new hierarchical structure
      console.log(
        "[loadLearnings] Eager loading enabled - loading all learnings",
      );
      this.learnings = [];
      this.learningsByLanguage.clear();
      this.learningsByCategory.clear();

      // Load from by-language directory
      const languageDir = vscode.Uri.joinPath(this.learningsDir, "by-language");
      const languageFiles =
        await vscode.workspace.fs.readDirectory(languageDir);

      for (const [fileName, fileType] of languageFiles) {
        if (fileType === vscode.FileType.File && fileName.endsWith(".json")) {
          const filePath = vscode.Uri.joinPath(languageDir, fileName);
          const data = await vscode.workspace.fs.readFile(filePath);
          const content = new TextDecoder().decode(data);
          const learnings: Learning[] = JSON.parse(content);

          // Store organized by language
          const language = fileName.replace(".json", "");
          this.learningsByLanguage.set(language, learnings);
          this.learnings.push(...learnings);
        }
      }
    } catch (error) {
      console.log("[loadLearnings] Error loading hierarchical format:", error);
      // Fall back to empty learnings
      this.learnings = [];
    }
  }

  private async migrateFromLegacyFormat(): Promise<void> {
    if (this.migrationComplete) return;

    try {
      // Check if old single-file format exists
      const oldFileData = await vscode.workspace.fs.readFile(
        this.learningsFile,
      );
      const oldContent = new TextDecoder().decode(oldFileData);
      const oldLearnings: Learning[] = JSON.parse(oldContent);

      console.log(
        `[migration] Found ${oldLearnings.length} learnings in legacy format. Starting migration...`,
      );

      // Organize learnings by language and category
      const byLanguage: Map<string, Learning[]> = new Map();
      const byCategory: Map<string, Learning[]> = new Map();

      for (const learning of oldLearnings) {
        const lang = learning.language || "unknown";
        const category = learning.category || "other";

        // Add to by-language
        if (!byLanguage.has(lang)) {
          byLanguage.set(lang, []);
        }
        byLanguage.get(lang)!.push(learning);

        // Add to by-category
        if (!byCategory.has(category)) {
          byCategory.set(category, []);
        }
        byCategory.get(category)!.push(learning);
      }

      // Write migrated learnings to new structure
      const languageDir = vscode.Uri.joinPath(this.learningsDir, "by-language");
      const categoryDir = vscode.Uri.joinPath(this.learningsDir, "by-category");

      // Save by language
      for (const [language, learnings] of byLanguage.entries()) {
        const filePath = vscode.Uri.joinPath(languageDir, `${language}.json`);
        const data = new TextEncoder().encode(
          JSON.stringify(learnings, null, 2),
        );
        await vscode.workspace.fs.writeFile(filePath, data);
      }

      // Save by category
      for (const [category, learnings] of byCategory.entries()) {
        const filePath = vscode.Uri.joinPath(categoryDir, `${category}.json`);
        const data = new TextEncoder().encode(
          JSON.stringify(learnings, null, 2),
        );
        await vscode.workspace.fs.writeFile(filePath, data);
      }

      // Create index file with metadata
      const indexPath = vscode.Uri.joinPath(this.learningsDir, "index.json");
      const indexData = {
        migrationDate: new Date().toISOString(),
        totalLearnings: oldLearnings.length,
        languages: Array.from(byLanguage.keys()),
        categories: Array.from(byCategory.keys()),
      };
      const indexContent = new TextEncoder().encode(
        JSON.stringify(indexData, null, 2),
      );
      await vscode.workspace.fs.writeFile(indexPath, indexContent);

      // Keep backup of old file (rename it)
      try {
        const backupPath = vscode.Uri.file(
          this.learningsFile.fsPath + `.backup-${Date.now()}`,
        );
        await vscode.workspace.fs.copy(this.learningsFile, backupPath, {
          overwrite: true,
        });
        console.log(
          `[migration] Created backup of legacy format at ${backupPath.fsPath}`,
        );
      } catch (backupError) {
        console.log("[migration] Could not create backup:", backupError);
      }

      console.log(
        `[migration] Successfully migrated ${oldLearnings.length} learnings to hierarchical structure`,
      );
      this.migrationComplete = true;
    } catch (error: any) {
      // Old file doesn't exist or is empty - this is fine
      if (error.code !== "FileNotFound") {
        console.log(
          "[migration] Legacy file read error (expected if new):",
          error.code,
        );
      }
      this.migrationComplete = true;
    }
  }

  private async saveLearnings(): Promise<void> {
    try {
      // Organize learnings by language and category before saving
      const byLanguage: Map<string, Learning[]> = new Map();
      const byCategory: Map<string, Learning[]> = new Map();

      for (const learning of this.learnings) {
        const lang = learning.language || "unknown";
        const category = learning.category || "other";

        if (!byLanguage.has(lang)) {
          byLanguage.set(lang, []);
        }
        byLanguage.get(lang)!.push(learning);

        if (!byCategory.has(category)) {
          byCategory.set(category, []);
        }
        byCategory.get(category)!.push(learning);
      }

      // Save by language
      const languageDir = vscode.Uri.joinPath(this.learningsDir, "by-language");
      for (const [language, learnings] of byLanguage.entries()) {
        const filePath = vscode.Uri.joinPath(languageDir, `${language}.json`);
        const data = new TextEncoder().encode(
          JSON.stringify(learnings, null, 2),
        );
        await vscode.workspace.fs.writeFile(filePath, data);
      }

      // Save by category
      const categoryDir = vscode.Uri.joinPath(this.learningsDir, "by-category");
      for (const [category, learnings] of byCategory.entries()) {
        const filePath = vscode.Uri.joinPath(categoryDir, `${category}.json`);
        const data = new TextEncoder().encode(
          JSON.stringify(learnings, null, 2),
        );
        await vscode.workspace.fs.writeFile(filePath, data);
      }

      // Update index
      const indexPath = vscode.Uri.joinPath(this.learningsDir, "index.json");
      const indexData = {
        lastUpdated: new Date().toISOString(),
        totalLearnings: this.learnings.length,
        languages: Array.from(byLanguage.keys()).sort(),
        categories: Array.from(byCategory.keys()).sort(),
        byLanguageCount: Object.fromEntries(
          Array.from(byLanguage.entries()).map(([lang, learnings]) => [
            lang,
            learnings.length,
          ]),
        ),
      };
      const indexContent = new TextEncoder().encode(
        JSON.stringify(indexData, null, 2),
      );
      await vscode.workspace.fs.writeFile(indexPath, indexContent);
    } catch (error) {
      console.error("[saveLearnings] Error saving hierarchical format:", error);
      throw error;
    }

    this._onDidChangeLearnings.fire();

    // Trigger multi-destination sync after saving
    await this.syncToAllDestinations();
  }

  public updateConfig(): void {
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    this.autoCapture = config.get("autoCapture", true);
    this.maxStorageSize = config.get("maxStorageSize", 1000);
    this.customStorageLocation = config.get("customStorageLocation", "");
    this.lazyLoadEnabled = config.get("lazyLoadLearnings", true);

    // Update learnings file paths if custom location changed
    this.learningsDir = this.getLearningsDirPath();
    this.learningsFile = this.getLearningsFilePath();

    // Update git sync manager config
    this.gitSyncManager.updateConfig();
  }

  /**
   * Load learnings for a specific language efficiently
   * Only loads the language file, not all learnings
   * Excludes archived learnings unless explicitly requested
   */
  public async loadLearningsByLanguage(language: string): Promise<Learning[]> {
    try {
      const languageDir = vscode.Uri.joinPath(this.learningsDir, "by-language");
      const filePath = vscode.Uri.joinPath(languageDir, `${language}.json`);
      const data = await vscode.workspace.fs.readFile(filePath);
      const content = new TextDecoder().decode(data);
      const learnings: Learning[] = JSON.parse(content);
      // Exclude archived by default
      return learnings.filter((l) => !l.archived);
    } catch {
      return [];
    }
  }

  /**
   * Load learnings for a specific category efficiently
   * Only loads the category file, not all learnings
   * Excludes archived learnings unless explicitly requested
   */
  private async loadLearningsByCategory(category: string): Promise<Learning[]> {
    try {
      const categoryDir = vscode.Uri.joinPath(this.learningsDir, "by-category");
      const filePath = vscode.Uri.joinPath(categoryDir, `${category}.json`);
      const data = await vscode.workspace.fs.readFile(filePath);
      const content = new TextDecoder().decode(data);
      const learnings: Learning[] = JSON.parse(content);
      // Exclude archived by default
      return learnings.filter((l) => !l.archived);
    } catch {
      return [];
    }
  }

  /**
   * Get lightweight index of available languages and categories
   * Fast operation - no full learning data loaded
   */
  public async getStorageIndex(): Promise<{
    totalLearnings: number;
    languages: string[];
    categories: string[];
    byLanguageCount: { [key: string]: number };
  }> {
    try {
      const indexPath = vscode.Uri.joinPath(this.learningsDir, "index.json");
      const data = await vscode.workspace.fs.readFile(indexPath);
      const content = new TextDecoder().decode(data);
      return JSON.parse(content);
    } catch {
      return await this.rebuildIndexFromStorage();
    }
  }

  private async rebuildIndexFromStorage(): Promise<{
    totalLearnings: number;
    languages: string[];
    categories: string[];
    byLanguageCount: { [key: string]: number };
  }> {
    try {
      const languageDir = vscode.Uri.joinPath(this.learningsDir, "by-language");
      const languageFiles =
        await vscode.workspace.fs.readDirectory(languageDir);

      const byLanguageCount: { [key: string]: number } = {};
      let totalLearnings = 0;

      for (const [fileName, fileType] of languageFiles) {
        if (fileType !== vscode.FileType.File || !fileName.endsWith(".json")) {
          continue;
        }

        const filePath = vscode.Uri.joinPath(languageDir, fileName);
        const data = await vscode.workspace.fs.readFile(filePath);
        const content = new TextDecoder().decode(data);
        const learnings: Learning[] = JSON.parse(content);

        const language = fileName.replace(".json", "");
        byLanguageCount[language] = learnings.length;
        totalLearnings += learnings.length;
      }

      const languages = Object.keys(byLanguageCount).sort();
      return {
        totalLearnings,
        languages,
        categories: [],
        byLanguageCount,
      };
    } catch (error) {
      console.log("[rebuildIndexFromStorage] Error:", error);
      return {
        totalLearnings: 0,
        languages: [],
        categories: [],
        byLanguageCount: {},
      };
    }
  }

  public async addLearning(
    question: string,
    solution: string,
    language: string = "unknown",
    tags: string[] = [],
    context: string = "",
    outcome: "success" | "partial" | "failed" | "unknown" = "unknown",
    notes: string = "",
  ): Promise<Learning> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const projectPath = workspaceFolder?.uri.fsPath || "";
    const projectName = path.basename(projectPath) || "Unknown Project";

    const learning: Learning = {
      id: uuidv4(),
      timestamp: Date.now(),
      source: "manual",
      projectName,
      projectPath,
      question,
      solution,
      language,
      frameworks: [],
      tools: [],
      tags,
      category: "other",
      problemType: [],
      concepts: [],
      context,
      outcome,
      notes,
      reliability: 50,
      difficulty: "intermediate",
      usageCount: 0,
      keywords: [],
      relatedLearningIds: [],
      versions: {},
    };

    this.learnings.push(learning);

    // Check if approaching storage limit and warn user
    if (this.learnings.length > this.maxStorageSize * 0.9) {
      this.warnStorageLimitApproaching();
    }

    // NOTE: No automatic trimming. Data is precious.
    // Users must explicitly archive learnings if they want to free space.

    await this.saveLearnings();
    return learning;
  }

  public async getAllLearnings(): Promise<Learning[]> {
    // If lazy loading is enabled and learnings haven't been loaded yet, load them now
    if (this.lazyLoadEnabled && this.learnings.length === 0) {
      await this.loadAllLearningsFromDisk();
    }
    // Return only active learnings by default
    return [...this.learnings.filter((l) => !l.archived)];
  }

  /**
   * Force load all learnings from disk into memory
   * Used when lazy loading is enabled but we need all learnings
   */
  private async loadAllLearningsFromDisk(): Promise<void> {
    try {
      this.learnings = [];
      this.learningsByLanguage.clear();
      this.learningsByCategory.clear();

      const languageDir = vscode.Uri.joinPath(this.learningsDir, "by-language");
      const languageFiles =
        await vscode.workspace.fs.readDirectory(languageDir);

      for (const [fileName, fileType] of languageFiles) {
        if (fileType === vscode.FileType.File && fileName.endsWith(".json")) {
          const filePath = vscode.Uri.joinPath(languageDir, fileName);
          const data = await vscode.workspace.fs.readFile(filePath);
          const content = new TextDecoder().decode(data);
          const learnings: Learning[] = JSON.parse(content);

          const language = fileName.replace(".json", "");
          this.learningsByLanguage.set(language, learnings);
          this.learnings.push(...learnings);
        }
      }
    } catch (error) {
      console.log("[loadAllLearningsFromDisk] Error:", error);
    }
  }

  public async getLearningsByTag(tag: string): Promise<Learning[]> {
    return this.learnings.filter((l) => !l.archived && l.tags.includes(tag));
  }

  public async getLearningsByLanguage(language: string): Promise<Learning[]> {
    return this.learnings.filter(
      (l) => !l.archived && l.language.toLowerCase() === language.toLowerCase(),
    );
  }

  public async searchLearnings(query: string): Promise<Learning[]> {
    const lowerQuery = query.toLowerCase();
    return this.learnings.filter(
      (l) =>
        !l.archived &&
        (l.question.toLowerCase().includes(lowerQuery) ||
          l.solution.toLowerCase().includes(lowerQuery) ||
          l.tags.some((t) => t.toLowerCase().includes(lowerQuery)) ||
          l.context.toLowerCase().includes(lowerQuery)),
    );
  }

  public async getRecentLearnings(count: number = 10): Promise<Learning[]> {
    return this.learnings
      .filter((l) => !l.archived)
      .slice(-count)
      .reverse();
  }

  public async exportLearnings(): Promise<void> {
    const options = ["Export as Single JSON File", "Export Folder Structure"];
    const selection = await vscode.window.showQuickPick(options, {
      placeHolder: "Choose export format",
    });

    if (selection === "Export as Single JSON File") {
      // Export all learnings as a single flat array
      const exportPath = await vscode.window.showSaveDialog({
        filters: { "JSON Files": ["json"] },
        defaultUri: vscode.Uri.file(
          path.join(
            vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
            `learnings-flat-${Date.now()}.json`,
          ),
        ),
      });

      if (exportPath) {
        const data = new TextEncoder().encode(
          JSON.stringify(this.learnings, null, 2),
        );
        await vscode.workspace.fs.writeFile(exportPath, data);
        vscode.window.showInformationMessage(
          `Exported ${this.learnings.length} learnings to ${exportPath.fsPath}`,
        );
      }
    } else if (selection === "Export Folder Structure") {
      // Export hierarchical structure
      const exportDir = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: "Select Export Destination",
      });

      if (exportDir && exportDir[0]) {
        const destDir = vscode.Uri.joinPath(
          exportDir[0],
          `learnings-${Date.now()}`,
        );

        // Copy entire structure
        await vscode.workspace.fs.copy(this.learningsDir, destDir, {
          overwrite: false,
        });
        vscode.window.showInformationMessage(
          `Exported learnings structure to ${destDir.fsPath}`,
        );
      }
    }
  }

  public async importLearnings(filePath: vscode.Uri): Promise<void> {
    try {
      const data = await vscode.workspace.fs.readFile(filePath);
      const content = new TextDecoder().decode(data);

      // Handle both single-file format and hierarchical directory structure
      let imported: Learning[] = [];

      // Check if it's a JSON file with learnings array
      if (filePath.fsPath.endsWith(".json")) {
        const parsed = JSON.parse(content);

        // Check if it's a flat array of learnings or our structured export
        if (Array.isArray(parsed)) {
          imported = parsed;
        } else if (parsed.learnings && Array.isArray(parsed.learnings)) {
          imported = parsed.learnings;
        }
      }

      // Merge imported learnings with current ones
      this.learnings.push(...imported);

      // Remove duplicates by ID, preserving the latest version of each
      const uniqueMap = new Map<string, Learning>();
      this.learnings.forEach((l) => {
        const existing = uniqueMap.get(l.id);
        if (!existing || l.timestamp > existing.timestamp) {
          uniqueMap.set(l.id, l);
        }
      });
      this.learnings = Array.from(uniqueMap.values());

      // Check if approaching storage limit and warn user
      if (this.learnings.length > this.maxStorageSize * 0.9) {
        this.warnStorageLimitApproaching();
      }

      // NOTE: No automatic trimming. All imported learnings are preserved.
      // If user needs to free space, they can archive learnings manually.

      await this.saveLearnings();
      console.log(
        `[importLearnings] Successfully imported ${imported.length} learnings`,
      );
    } catch (error) {
      throw new Error(`Failed to import learnings: ${error}`);
    }
  }

  public async clearAll(): Promise<void> {
    this.learnings = [];
    await this.saveLearnings();
  }

  public async updateLearning(
    id: string,
    updates: Partial<Learning>,
  ): Promise<void> {
    const index = this.learnings.findIndex((l) => l.id === id);
    if (index !== -1) {
      this.learnings[index] = { ...this.learnings[index], ...updates };
      await this.saveLearnings();
    }
  }

  public async deleteLearning(id: string): Promise<void> {
    this.learnings = this.learnings.filter((l) => l.id !== id);
    await this.saveLearnings();
  }

  /**
   * Archive a learning (mark as archived, keep fully searchable and restorable)
   * Used for storing old learnings, low-value items, or completed topics
   */
  public async archiveLearning(
    id: string,
    reason: "user-request" | "old" | "cleanup" | "low-value" = "user-request",
    notes?: string,
  ): Promise<void> {
    const learning = this.learnings.find((l) => l.id === id);
    if (learning) {
      learning.archived = true;
      learning.archivedDate = Date.now();
      learning.archivedReason = reason;
      learning.archivedNotes = notes;
      await this.updateLearning(id, learning);
      console.log(`[archiveLearning] Archived learning ${id} (${reason})`);
    }
  }

  /**
   * Restore an archived learning
   */
  public async restoreLearning(id: string): Promise<void> {
    const learning = this.learnings.find((l) => l.id === id);
    if (learning && learning.archived) {
      learning.archived = false;
      learning.archivedDate = undefined;
      learning.archivedReason = undefined;
      learning.archivedNotes = undefined;
      await this.updateLearning(id, learning);
      console.log(`[restoreLearning] Restored learning ${id}`);
    }
  }

  /**
   * Get all archived learnings
   */
  public async getArchivedLearnings(): Promise<Learning[]> {
    return this.learnings.filter((l) => l.archived);
  }

  /**
   * Get active (non-archived) learnings
   */
  public async getActiveLearnings(): Promise<Learning[]> {
    return this.learnings.filter((l) => !l.archived);
  }

  /**
   * Archive learnings older than specified days
   * User must confirm before archiving
   */
  public async archiveOlderThanDays(days: number): Promise<{
    archived: number;
    skipped: number;
  }> {
    const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
    let archived = 0;
    let skipped = 0;

    const oldLearnings = this.learnings.filter(
      (l) => !l.archived && l.timestamp < cutoffTime,
    );

    for (const learning of oldLearnings) {
      await this.archiveLearning(learning.id, "old", `Older than ${days} days`);
      archived++;
    }

    skipped = this.learnings.length - archived;

    if (archived > 0) {
      vscode.window.showInformationMessage(
        `Archived ${archived} learnings older than ${days} days`,
      );
    }

    return { archived, skipped };
  }

  /**
   * Get storage statistics including archival info
   */
  public async getStorageStats(): Promise<{
    totalLearnings: number;
    activeLearnings: number;
    archivedLearnings: number;
    percentageArchived: number;
    approachingLimit: boolean;
    storageLimitPercentage: number;
  }> {
    const total = this.learnings.length;
    const archived = this.learnings.filter((l) => l.archived).length;
    const active = total - archived;
    const approaching = total > this.maxStorageSize * 0.9;
    const percentage =
      this.maxStorageSize > 0 ? (total / this.maxStorageSize) * 100 : 0;

    return {
      totalLearnings: total,
      activeLearnings: active,
      archivedLearnings: archived,
      percentageArchived: archived > 0 ? (archived / total) * 100 : 0,
      approachingLimit: approaching,
      storageLimitPercentage: percentage,
    };
  }

  /**
   * Warn user when approaching storage limit (called at 90%)
   * Suggest archival options instead of automatic deletion
   */
  private async warnStorageLimitApproaching(): Promise<void> {
    const stats = await this.getStorageStats();

    if (stats.approachingLimit) {
      const message = `You have ${stats.totalLearnings} learnings (${stats.storageLimitPercentage.toFixed(0)}% of ${this.maxStorageSize} limit). No automatic deletion will occur. Would you like to archive old learnings?`;

      const action = await vscode.window.showWarningMessage(
        message,
        "Archive Old (30+ days)",
        "Archive Old (60+ days)",
        "View Storage Stats",
      );

      if (action === "Archive Old (30+ days)") {
        await this.archiveOlderThanDays(30);
      } else if (action === "Archive Old (60+ days)") {
        await this.archiveOlderThanDays(60);
      } else if (action === "View Storage Stats") {
        vscode.window.showInformationMessage(
          `Storage Stats:\n` +
            `Total: ${stats.totalLearnings}\n` +
            `Active: ${stats.activeLearnings}\n` +
            `Archived: ${stats.archivedLearnings} (${stats.percentageArchived.toFixed(1)}%)\n` +
            `Limit: ${this.maxStorageSize} learnings`,
        );
      }
    }
  }

  public async syncLearningsToGit(): Promise<boolean> {
    return await this.gitSyncManager.syncLearningsToGit(
      this.learningsFile.fsPath,
    );
  }

  public async pullLatestLearnings(): Promise<boolean> {
    const workspacePath =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
    const success =
      await this.gitSyncManager.pullLatestLearnings(workspacePath);

    if (success) {
      // Reload learnings after pulling
      await this.loadLearnings();
    }

    return success;
  }

  public async getGitSyncStatus(): Promise<{
    enabledGitHubSync: boolean;
    isGitRepo: boolean;
    branch?: string;
    hasChanges: boolean;
    stagedChanges: number;
    unstagedChanges: number;
  }> {
    const workspacePath =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
    const status = await this.gitSyncManager.getGitStatus(workspacePath);

    return {
      enabledGitHubSync: this.gitSyncManager["enableGitHubSync"],
      ...status,
    };
  }

  public async setupPrivateGitHubRepository(token: string): Promise<{
    success: boolean;
    message: string;
    repoUrl?: string;
  }> {
    return await this.gitSyncManager.setupPrivateGitHubRepository(token);
  }

  public async checkPrivateGitHubStatus(): Promise<{
    configured: boolean;
    authenticated: boolean;
    hasAccess: boolean;
    repoUrl?: string;
  }> {
    return await this.gitSyncManager.checkPrivateRepoStatus();
  }

  /**
   * Sync learnings to all configured destinations with automatic conflict resolution
   * Strategy: Latest timestamp wins, but merges are intelligent to prevent data loss
   */
  public async syncToAllDestinations(): Promise<{
    success: boolean;
    synced: number;
    conflicts: number;
    destinations: any[];
  }> {
    try {
      const config = ConfigurationManager.loadConfig();
      const syncDestinations = config.syncDestinations || [];
      console.log(
        "[syncToAllDestinations] Config loaded, syncDestinations:",
        syncDestinations,
      );

      if (!syncDestinations || syncDestinations.length === 0) {
        console.log("[syncToAllDestinations] No sync destinations configured");
        return { success: false, synced: 0, conflicts: 0, destinations: [] };
      }

      const results = {
        success: true,
        synced: 0,
        conflicts: 0,
        destinations: [] as any[],
      };

      // Collect all learnings from all destinations
      const allLearningsMap = new Map<string, Learning>();

      // Start with current learnings
      this.learnings.forEach((learning) => {
        allLearningsMap.set(learning.id, learning);
      });

      // For each destination, pull learnings and merge
      for (const dest of syncDestinations) {
        if (!dest.enabled) continue;

        try {
          if (dest.type === "cloud-folder" && dest.path) {
            // Sync to cloud folder (OneDrive, Google Drive, Dropbox)
            // First copy the entire hierarchical structure
            const cloudLearningsPath = path.join(dest.path, "learnings");
            const cloudLearningsDir = vscode.Uri.file(cloudLearningsPath);

            // Create directory if it doesn't exist
            try {
              await vscode.workspace.fs.createDirectory(cloudLearningsDir);
              const subDirs = [
                vscode.Uri.joinPath(cloudLearningsDir, "by-language"),
                vscode.Uri.joinPath(cloudLearningsDir, "by-category"),
              ];
              for (const dir of subDirs) {
                try {
                  await vscode.workspace.fs.createDirectory(dir);
                } catch (e) {
                  // Directory already exists
                }
              }
            } catch (mkdirError) {
              console.log(
                `[syncToAllDestinations] Directory creation attempted: ${cloudLearningsPath}`,
              );
            }

            // Merge from cloud folder
            await this.mergeFromDestinationDir(
              cloudLearningsPath,
              allLearningsMap,
              results,
            );

            // Write merged learnings to cloud (hierarchical structure)
            const byLanguage: Map<string, Learning[]> = new Map();
            const byCategory: Map<string, Learning[]> = new Map();

            for (const learning of Array.from(allLearningsMap.values())) {
              const lang = learning.language || "unknown";
              const category = learning.category || "other";

              if (!byLanguage.has(lang)) {
                byLanguage.set(lang, []);
              }
              byLanguage.get(lang)!.push(learning);

              if (!byCategory.has(category)) {
                byCategory.set(category, []);
              }
              byCategory.get(category)!.push(learning);
            }

            // Write by-language files
            const langDir = vscode.Uri.joinPath(
              cloudLearningsDir,
              "by-language",
            );
            for (const [language, learnings] of byLanguage.entries()) {
              const filePath = vscode.Uri.joinPath(langDir, `${language}.json`);
              const data = new TextEncoder().encode(
                JSON.stringify(learnings, null, 2),
              );
              await vscode.workspace.fs.writeFile(filePath, data);
            }

            // Write by-category files
            const catDir = vscode.Uri.joinPath(
              cloudLearningsDir,
              "by-category",
            );
            for (const [category, learnings] of byCategory.entries()) {
              const filePath = vscode.Uri.joinPath(catDir, `${category}.json`);
              const data = new TextEncoder().encode(
                JSON.stringify(learnings, null, 2),
              );
              await vscode.workspace.fs.writeFile(filePath, data);
            }

            // Write index
            const indexData = {
              lastUpdated: new Date().toISOString(),
              totalLearnings: Array.from(allLearningsMap.values()).length,
              languages: Array.from(byLanguage.keys()).sort(),
              categories: Array.from(byCategory.keys()).sort(),
              byLanguageCount: Object.fromEntries(
                Array.from(byLanguage.entries()).map(([lang, learnings]) => [
                  lang,
                  learnings.length,
                ]),
              ),
            };
            const indexPath = vscode.Uri.joinPath(
              cloudLearningsDir,
              "index.json",
            );
            const indexContent = new TextEncoder().encode(
              JSON.stringify(indexData, null, 2),
            );
            await vscode.workspace.fs.writeFile(indexPath, indexContent);

            results.synced++;
            results.destinations.push({
              type: "cloud-folder",
              path: dest.path,
              status: "synced",
            });
          } else if (dest.type === "github") {
            // Sync to GitHub (the hierarchical structure)
            try {
              const gitSuccess = await this.gitSyncManager.syncLearningsToGit(
                this.learningsDir.fsPath,
              );
              if (gitSuccess) {
                results.synced++;
                results.destinations.push({
                  type: "github",
                  status: "synced",
                });
              } else {
                console.log(
                  "[syncToAllDestinations] GitHub sync returned false",
                );
                results.destinations.push({
                  type: "github",
                  status: "skipped",
                  error:
                    "Not a git repository or GitHub sync not fully configured",
                });
              }
            } catch (error) {
              console.error(`Failed to sync to GitHub: ${error}`);
              results.destinations.push({
                type: "github",
                status: "error",
                error: String(error),
              });
            }
          } else if (dest.type === "backup") {
            // Create local backup of hierarchical structure
            const backupDir = path.join(
              this.context.globalStorageUri?.fsPath || ".",
              "backups",
            );
            try {
              await vscode.workspace.fs.createDirectory(
                vscode.Uri.file(backupDir),
              );

              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const backupPath = path.join(
                backupDir,
                `learnings-backup-${timestamp}`,
              );

              // Copy entire hierarchical directory
              await vscode.workspace.fs.copy(
                this.learningsDir,
                vscode.Uri.file(backupPath),
                {
                  overwrite: false,
                },
              );

              results.synced++;
              results.destinations.push({
                type: "backup",
                path: backupPath,
                status: "synced",
              });
            } catch (error) {
              console.error(`Failed to create backup: ${error}`);
              results.destinations.push({
                type: "backup",
                status: "error",
                error: String(error),
              });
            }
          }
        } catch (error) {
          console.error(`Error syncing to ${dest.type}:`, error);
          results.destinations.push({
            type: dest.type,
            status: "error",
            error: String(error),
          });
        }
      }

      return results;
    } catch (error) {
      console.error("Error in syncToAllDestinations:", error);
      return {
        success: false,
        synced: 0,
        conflicts: 0,
        destinations: [],
      };
    }
  }

  /**
   * Merge learnings from a destination directory with current learnings
   */
  private async mergeFromDestinationDir(
    sourceDir: string,
    allLearningsMap: Map<string, Learning>,
    results: { conflicts: number },
  ): Promise<void> {
    try {
      const langDir = path.join(sourceDir, "by-language");
      const langDirUri = vscode.Uri.file(langDir);

      try {
        const files = await vscode.workspace.fs.readDirectory(langDirUri);
        for (const [fileName, fileType] of files) {
          if (fileType === vscode.FileType.File && fileName.endsWith(".json")) {
            const filePath = vscode.Uri.joinPath(langDirUri, fileName);
            const sourceData = await vscode.workspace.fs.readFile(filePath);
            const sourceContent = new TextDecoder().decode(sourceData);
            const sourceLearnings: Learning[] = JSON.parse(sourceContent);

            for (const sourceLearning of sourceLearnings) {
              const existingLearning = allLearningsMap.get(sourceLearning.id);

              if (!existingLearning) {
                allLearningsMap.set(sourceLearning.id, sourceLearning);
              } else if (
                sourceLearning.timestamp > existingLearning.timestamp
              ) {
                const merged = {
                  ...existingLearning,
                  ...sourceLearning,
                  _mergedFrom: existingLearning.source,
                  _lastMerged: Date.now(),
                };
                allLearningsMap.set(sourceLearning.id, merged);
                results.conflicts++;
              }
            }
          }
        }
      } catch (error) {
        console.log(
          `[mergeFromDestinationDir] Directory read error (expected if new):`,
          error,
        );
      }
    } catch (error) {
      console.error(`Failed to merge from destination: ${error}`);
    }
  }

  public getSecureStorage(): SecureStorageManager {
    return this.secureStorage;
  }

  public async searchByMultipleCriteria(query: {
    languages?: string[];
    frameworks?: string[];
    categories?: string[];
    problemTypes?: string[];
    concepts?: string[];
    keywords?: string[];
    minReliability?: number;
    difficulty?: string;
    outcome?: string;
    tags?: string[];
  }): Promise<Learning[]> {
    return this.learnings.filter((learning) => {
      if (query.languages && !query.languages.includes(learning.language))
        return false;
      if (
        query.frameworks?.length &&
        !learning.frameworks.some((f) => query.frameworks?.includes(f))
      )
        return false;
      if (query.categories && !query.categories.includes(learning.category))
        return false;
      if (
        query.problemTypes?.length &&
        !learning.problemType.some((p) => query.problemTypes?.includes(p))
      )
        return false;
      if (
        query.concepts?.length &&
        !learning.concepts.some((c) => query.concepts?.includes(c))
      )
        return false;
      if (query.minReliability && learning.reliability < query.minReliability)
        return false;
      if (query.difficulty && learning.difficulty !== query.difficulty)
        return false;
      if (query.outcome && learning.outcome !== query.outcome) return false;
      if (
        query.keywords?.length &&
        !query.keywords.some((k) => learning.keywords.includes(k.toLowerCase()))
      )
        return false;
      if (
        query.tags?.length &&
        !learning.tags.some((t) => query.tags?.includes(t))
      )
        return false;
      return true;
    });
  }

  public async searchByKeywords(keywords: string[]): Promise<Learning[]> {
    const lowerKeywords = keywords.map((k) => k.toLowerCase());
    return this.learnings.filter((l) =>
      lowerKeywords.some(
        (k) =>
          l.keywords.some((lk) => lk.includes(k)) ||
          l.question.toLowerCase().includes(k) ||
          l.solution.toLowerCase().includes(k) ||
          l.concepts.some((c) => c.toLowerCase().includes(k)) ||
          l.problemType.some((p) => p.toLowerCase().includes(k)),
      ),
    );
  }

  public async getRelatedLearnings(
    learningId: string,
    depth: number = 1,
  ): Promise<Learning[]> {
    const learning = this.learnings.find((l) => l.id === learningId);
    if (!learning) return [];

    const related = new Set<Learning>();
    const queue = [learning];
    const visited = new Set<string>([learningId]);

    for (let i = 0; i < depth && queue.length > 0; i++) {
      const current = queue.shift();
      if (!current) break;

      // Find by related IDs
      current.relatedLearningIds.forEach((id) => {
        if (!visited.has(id)) {
          const found = this.learnings.find((l) => l.id === id);
          if (found) {
            related.add(found);
            queue.push(found);
            visited.add(id);
          }
        }
      });

      // Find by shared concepts
      const sameLanguage = this.learnings.filter(
        (l) =>
          l.language === current.language &&
          l.concepts.some((c) => current.concepts.includes(c)) &&
          !visited.has(l.id),
      );
      sameLanguage.forEach((l) => {
        related.add(l);
        queue.push(l);
        visited.add(l.id);
      });

      // Find by shared frameworks
      const sameFramework = this.learnings.filter(
        (l) =>
          l.frameworks.some((f) => current.frameworks.includes(f)) &&
          !visited.has(l.id),
      );
      sameFramework.forEach((l) => {
        related.add(l);
        queue.push(l);
        visited.add(l.id);
      });
    }

    return Array.from(related);
  }

  public async getMetadataIndex(): Promise<{
    totalLearnings: number;
    languages: { [key: string]: number };
    frameworks: { [key: string]: number };
    categories: { [key: string]: number };
    problemTypes: { [key: string]: number };
    concepts: { [key: string]: number };
    tags: { [key: string]: number };
    averageReliability: number;
    difficultyDistribution: { [key: string]: number };
    outcomeDistribution: { [key: string]: number };
    sourceDistribution: { [key: string]: number };
  }> {
    const index = {
      totalLearnings: this.learnings.length,
      languages: {} as { [key: string]: number },
      frameworks: {} as { [key: string]: number },
      categories: {} as { [key: string]: number },
      problemTypes: {} as { [key: string]: number },
      concepts: {} as { [key: string]: number },
      tags: {} as { [key: string]: number },
      averageReliability: 0,
      difficultyDistribution: {} as { [key: string]: number },
      outcomeDistribution: {} as { [key: string]: number },
      sourceDistribution: {} as { [key: string]: number },
    };

    let totalReliability = 0;

    this.learnings.forEach((l) => {
      // Languages
      index.languages[l.language] = (index.languages[l.language] || 0) + 1;

      // Frameworks
      l.frameworks.forEach((f) => {
        index.frameworks[f] = (index.frameworks[f] || 0) + 1;
      });

      // Categories
      index.categories[l.category] = (index.categories[l.category] || 0) + 1;

      // Problem Types
      l.problemType.forEach((p) => {
        index.problemTypes[p] = (index.problemTypes[p] || 0) + 1;
      });

      // Concepts
      l.concepts.forEach((c) => {
        index.concepts[c] = (index.concepts[c] || 0) + 1;
      });

      // Tags
      l.tags.forEach((t) => {
        index.tags[t] = (index.tags[t] || 0) + 1;
      });

      // Difficulty
      index.difficultyDistribution[l.difficulty] =
        (index.difficultyDistribution[l.difficulty] || 0) + 1;

      // Outcome
      index.outcomeDistribution[l.outcome] =
        (index.outcomeDistribution[l.outcome] || 0) + 1;

      // Source
      index.sourceDistribution[l.source] =
        (index.sourceDistribution[l.source] || 0) + 1;

      // Reliability
      totalReliability += l.reliability;
    });

    index.averageReliability =
      this.learnings.length > 0 ? totalReliability / this.learnings.length : 0;

    return index;
  }

  public async findConceptMap(concept: string): Promise<{
    concept: string;
    relatedConcepts: { [key: string]: number };
    problemTypes: string[];
    frameworks: string[];
    languages: string[];
    learningCount: number;
  }> {
    const related = new Map<string, number>();
    let problemTypes = new Set<string>();
    let frameworks = new Set<string>();
    let languages = new Set<string>();

    this.learnings
      .filter((l) => l.concepts.includes(concept))
      .forEach((l) => {
        languages.add(l.language);
        l.frameworks.forEach((f) => frameworks.add(f));
        l.problemType.forEach((p) => problemTypes.add(p));
        l.concepts.forEach((c) => {
          if (c !== concept) {
            related.set(c, (related.get(c) || 0) + 1);
          }
        });
      });

    return {
      concept,
      relatedConcepts: Object.fromEntries(related),
      problemTypes: Array.from(problemTypes),
      frameworks: Array.from(frameworks),
      languages: Array.from(languages),
      learningCount: this.learnings.filter((l) => l.concepts.includes(concept))
        .length,
    };
  }

  public async getHighestValueLearnings(
    limit: number = 20,
  ): Promise<Learning[]> {
    return [...this.learnings]
      .sort((a, b) => {
        // Score = reliability + usage + usefulness - age factor
        const scoreA =
          a.reliability +
          a.usageCount * 5 +
          (a.usefulness || 0) -
          (Date.now() - a.timestamp) / (1000 * 60 * 60 * 24 * 30);
        const scoreB =
          b.reliability +
          b.usageCount * 5 +
          (b.usefulness || 0) -
          (Date.now() - b.timestamp) / (1000 * 60 * 60 * 24 * 30);
        return scoreB - scoreA;
      })
      .slice(0, limit);
  }

  public async recordLearningUsage(learningId: string): Promise<void> {
    const learning = this.learnings.find((l) => l.id === learningId);
    if (learning) {
      learning.usageCount = (learning.usageCount || 0) + 1;
      learning.lastUsed = Date.now();
      await this.updateLearning(learningId, learning);
    }
  }

  public async rateLearning(
    learningId: string,
    usefulness: number,
  ): Promise<void> {
    const learning = this.learnings.find((l) => l.id === learningId);
    if (learning) {
      learning.usefulness = Math.min(100, Math.max(0, usefulness));
      await this.updateLearning(learningId, learning);
    }
  }

  public async getAgentReadyExport(): Promise<{
    learnings: Learning[];
    metadata: {
      totalLearnings: number;
      languages: { [key: string]: number };
      frameworks: { [key: string]: number };
      categories: { [key: string]: number };
      problemTypes: { [key: string]: number };
      concepts: { [key: string]: number };
      tags: { [key: string]: number };
      averageReliability: number;
      difficultyDistribution: { [key: string]: number };
      outcomeDistribution: { [key: string]: number };
      sourceDistribution: { [key: string]: number };
    };
    index: {
      byLanguage: { [key: string]: number };
      byFramework: { [key: string]: number };
      byCategory: { [key: string]: number };
      byConcept: { [key: string]: number };
    };
    timestamp: number;
    version: string;
    storageInfo: {
      format: "hierarchical";
      basePath: string;
      subDirs: string[];
    };
  }> {
    const metadata = await this.getMetadataIndex();
    const byLanguageCount: { [key: string]: number } = {};
    const byFrameworkCount: { [key: string]: number } = {};
    const byCategoryCount: { [key: string]: number } = {};
    const byConceptCount: { [key: string]: number } = {};

    this.learnings.forEach((l) => {
      // By language
      byLanguageCount[l.language] = (byLanguageCount[l.language] || 0) + 1;

      // By framework
      l.frameworks.forEach((f) => {
        byFrameworkCount[f] = (byFrameworkCount[f] || 0) + 1;
      });

      // By category
      byCategoryCount[l.category] = (byCategoryCount[l.category] || 0) + 1;

      // By concept
      l.concepts.forEach((c) => {
        byConceptCount[c] = (byConceptCount[c] || 0) + 1;
      });
    });

    return {
      learnings: this.learnings,
      metadata,
      index: {
        byLanguage: byLanguageCount,
        byFramework: byFrameworkCount,
        byCategory: byCategoryCount,
        byConcept: byConceptCount,
      },
      timestamp: Date.now(),
      version: "2.0.0",
      storageInfo: {
        format: "hierarchical",
        basePath: this.learningsDir.fsPath,
        subDirs: ["by-language", "by-category"],
      },
    };
  }

  /**
   * Get analytics data for learnings grouped by project
   */
  public async getLearningsByProject(): Promise<{
    [project: string]: {
      count: number;
      learnings: Learning[];
      languages: Set<string>;
      firstLearning: number;
      lastLearning: number;
    };
  }> {
    const byProject: {
      [project: string]: {
        count: number;
        learnings: Learning[];
        languages: Set<string>;
        firstLearning: number;
        lastLearning: number;
      };
    } = {};

    this.learnings
      .filter((l) => !l.archived)
      .forEach((learning) => {
        const project = learning.projectName || "Unknown";
        if (!byProject[project]) {
          byProject[project] = {
            count: 0,
            learnings: [],
            languages: new Set(),
            firstLearning: learning.timestamp,
            lastLearning: learning.timestamp,
          };
        }

        byProject[project].count++;
        byProject[project].learnings.push(learning);
        byProject[project].languages.add(learning.language);
        byProject[project].firstLearning = Math.min(
          byProject[project].firstLearning,
          learning.timestamp,
        );
        byProject[project].lastLearning = Math.max(
          byProject[project].lastLearning,
          learning.timestamp,
        );
      });

    return byProject;
  }

  /**
   * Get time series data for learnings (grouped by day, week, or month)
   */
  public async getLearningsTimeSeries(
    groupBy: "day" | "week" | "month" = "day",
  ): Promise<{
    [date: string]: {
      count: number;
      cumulative: number;
      projects: Set<string>;
      languages: Set<string>;
    };
  }> {
    const timeSeries: {
      [date: string]: {
        count: number;
        cumulative: number;
        projects: Set<string>;
        languages: Set<string>;
      };
    } = {};

    const getDateKey = (timestamp: number): string => {
      const date = new Date(timestamp);
      switch (groupBy) {
        case "day":
          return date.toISOString().split("T")[0];
        case "week":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          return weekStart.toISOString().split("T")[0];
        case "month":
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        default:
          return date.toISOString().split("T")[0];
      }
    };

    const sortedLearnings = [...this.learnings]
      .filter((l) => !l.archived)
      .sort((a, b) => a.timestamp - b.timestamp);

    let cumulative = 0;
    sortedLearnings.forEach((learning) => {
      const dateKey = getDateKey(learning.timestamp);

      if (!timeSeries[dateKey]) {
        timeSeries[dateKey] = {
          count: 0,
          cumulative: 0,
          projects: new Set(),
          languages: new Set(),
        };
      }

      timeSeries[dateKey].count++;
      cumulative++;
      timeSeries[dateKey].cumulative = cumulative;
      timeSeries[dateKey].projects.add(learning.projectName || "Unknown");
      timeSeries[dateKey].languages.add(learning.language);
    });

    return timeSeries;
  }
}
