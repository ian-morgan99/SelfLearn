import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

/**
 * Handles storage migration from old publisher/extension ID to new one.
 * Preserves all learnings and user settings during rebranding.
 */
export class StorageMigrationManager {
  private static readonly OLD_PUBLISHER = "MorganTechnologyConsultingLtd";
  private static readonly NEW_PUBLISHER = "TheDynamicsFactory";
  private static readonly EXTENSION_NAME = "ai-learning-repo";

  /**
   * Perform storage migration if needed (i.e., publisher has changed)
   */
  public static async migrateIfNeeded(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    try {
      // Check if migration has already been performed
      const migrationMarker = context.globalState.get<boolean>(
        "storage-migration-completed-v2",
      );
      if (migrationMarker) {
        return; // Already migrated
      }

      // Get old and new storage locations
      const oldStorageUri = this.getOldStorageUri();
      const newStorageUri = context.globalStorageUri;

      if (!oldStorageUri || !newStorageUri) {
        return;
      }

      // Attempt to migrate file-based storage
      await this.migrateDirectory(oldStorageUri, newStorageUri);

      // Attempt to migrate globalState data
      await this.migrateGlobalState(context);

      // Mark migration as completed
      await context.globalState.update("storage-migration-completed-v2", true);

      console.log(
        "Storage migration completed successfully from old to new publisher",
      );
    } catch (error) {
      console.error("Storage migration error:", error);
      // Non-fatal: extension continues without migration
    }
  }

  /**
   * Migrate globalState data from old location to new context
   */
  private static async migrateGlobalState(
    context: vscode.ExtensionContext,
  ): Promise<void> {
    try {
      // Try to read globalState backup file from old storage
      const oldStorageDir = path.join(
        this.getGlobalStorageRoot(),
        `${this.OLD_PUBLISHER}.${this.EXTENSION_NAME}`,
      );

      const stateBackupFile = path.join(
        oldStorageDir,
        "globalState.backup.json",
      );
      const stateFile = path.join(oldStorageDir, "globalState.json");

      let stateData: Record<string, unknown> | null = null;

      // Try backup file first
      if (fs.existsSync(stateBackupFile)) {
        try {
          const content = fs.readFileSync(stateBackupFile, "utf-8");
          stateData = JSON.parse(content);
        } catch (e) {
          console.warn("Failed to parse globalState backup:", e);
        }
      }

      // If no backup, try direct state file
      if (!stateData && fs.existsSync(stateFile)) {
        try {
          const content = fs.readFileSync(stateFile, "utf-8");
          stateData = JSON.parse(content);
        } catch (e) {
          console.warn("Failed to parse globalState file:", e);
        }
      }

      // Migrate critical keys that should be preserved
      const criticalKeys = [
        // License information
        "license-status",
        "license-plan",
        "license-expires-at",
        "license-last-checked",
        "license-next-check",
        "license-error",
        // Analytics
        "analytics-user-id",
        "analytics-tracking-enabled",
        // Preferences
        "user-preferences",
        "last-updated-version",
        // Tool registry
        "agentFrameworkTools",
        // Git sync state
        "git-sync-last-commit",
        "git-sync-last-push",
        // Cloud sync
        "cloud-sync-destinations",
        "cloud-sync-last-sync",
      ];

      if (stateData && typeof stateData === "object") {
        // First, migrate all critical keys
        for (const key of criticalKeys) {
          if (key in stateData) {
            try {
              await context.globalState.update(key, stateData[key]);
            } catch (e) {
              console.warn(`Failed to migrate globalState key "${key}":`, e);
            }
          }
        }

        // Then migrate any other keys that exist (for completeness)
        for (const [key, value] of Object.entries(stateData)) {
          // Skip keys we already migrated
          if (!criticalKeys.includes(key)) {
            try {
              await context.globalState.update(key, value);
            } catch (e) {
              // Silently skip non-critical keys that fail
            }
          }
        }
      }

      console.log("GlobalState migration completed");
    } catch (error) {
      // Non-fatal: globalState migration is optional
      console.warn("GlobalState migration skipped:", error);
    }
  }

  /**
   * Recursively migrate all files from source to destination directory
   */
  private static async migrateDirectory(
    sourceUri: vscode.Uri,
    destUri: vscode.Uri,
  ): Promise<void> {
    try {
      // Check if source exists
      await vscode.workspace.fs.stat(sourceUri);
    } catch {
      // Source doesn't exist, nothing to migrate
      return;
    }

    try {
      // Ensure destination exists
      await vscode.workspace.fs.stat(destUri);
    } catch {
      // Create destination if it doesn't exist
      await vscode.workspace.fs.createDirectory(destUri);
    }

    // List all files and directories in source
    const sourceEntries = await vscode.workspace.fs.readDirectory(sourceUri);

    for (const [name, type] of sourceEntries) {
      const sourcePath = vscode.Uri.joinPath(sourceUri, name);
      const destPath = vscode.Uri.joinPath(destUri, name);

      if (type === vscode.FileType.Directory) {
        // Recursively migrate subdirectories
        await this.migrateDirectory(sourcePath, destPath);
      } else if (type === vscode.FileType.File) {
        try {
          // Check if destination file already exists
          await vscode.workspace.fs.stat(destPath);
          // File exists at destination, skip (preserve existing data)
          continue;
        } catch {
          // File doesn't exist at destination, copy it
          const content = await vscode.workspace.fs.readFile(sourcePath);
          await vscode.workspace.fs.writeFile(destPath, content);
        }
      }
    }
  }

  /**
   * Construct the old storage URI based on extension ID convention
   * This follows VS Code's storage path pattern: ~/.config/Code/User/globalStorage/publisher.extensionName/
   */
  private static getOldStorageUri(): vscode.Uri | null {
    try {
      // VS Code stores extensions in a predictable location
      // We need to construct the path for the old publisher
      const oldExtensionId = `${this.OLD_PUBLISHER}.${this.EXTENSION_NAME}`;

      // Get the base storage path from environment
      // VS Code globalStorageUri typically resolves to user's config directory
      const storageRoot = vscode.Uri.file(this.getGlobalStorageRoot());

      return vscode.Uri.joinPath(storageRoot, oldExtensionId);
    } catch {
      return null;
    }
  }

  /**
   * Get the platform-specific global storage root directory
   */
  private static getGlobalStorageRoot(): string {
    const platform = process.platform;
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";

    switch (platform) {
      case "win32":
        return path.join(
          homeDir,
          "AppData",
          "Roaming",
          "Code",
          "User",
          "globalStorage",
        );
      case "darwin": // macOS
        return path.join(
          homeDir,
          "Library",
          "Application Support",
          "Code",
          "User",
          "globalStorage",
        );
      case "linux":
      default:
        return path.join(homeDir, ".config", "Code", "User", "globalStorage");
    }
  }
}
