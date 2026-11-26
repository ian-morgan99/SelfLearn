import * as vscode from "vscode";

export interface ExtensionConfig {
  // Core capture settings
  autoCapture: boolean;
  captureCopilot: boolean;
  captureContinue: boolean;
  captureFoundry: boolean;
  captureCodex: boolean;
  captureClaude: boolean;
  captureGemini: boolean;
  captureLlama: boolean;
  captureBlackbox: boolean;
  minInteractionLength: number;
  captureComments: boolean;

  // Microsoft ecosystem
  enableMicrosoftStack: boolean;
  captureBusinessCentral: boolean;
  captureFinanceSupplyChain: boolean;
  capturePowerPlatform: boolean;
  captureAzure: boolean;

  // Storage settings
  maxStorageSize: number;
  autoBackupEnabled: boolean;
  autoBackupFrequencyDays: number;
  autoBackupRetentionDays: number;
  customStorageLocation?: string;

  // GitHub sync settings
  enableGitHubSync: boolean;
  gitHubAutoCommit: boolean;
  gitHubAutoPush: boolean;
  gitHubSyncBranch: string;

  // Private GitHub repo settings
  enablePrivateGitHubRepo: boolean;
  gitHubRepoUrl?: string;
  gitHubAutoCreateRepo: boolean;
  gitHubRepositoryDescription: string;

  // Context injection settings
  enableContextInjection: boolean;
  contextSensitivity: "low" | "medium" | "high";
  minContextConfidenceThreshold: number;
  maxContextResultsPerSearch: number;

  // Capture filters
  captureFilters: {
    languages?: string[];
    frameworks?: string[];
    excludePatterns?: string[];
  };

  // Data retention & cleanup
  enableAutoCleanup: boolean;
  autoCleanupIntervalDays: number;
  removeUnusedLearningsAfterDays: number;
  minReliabilityToKeep: number;

  // Advanced indexing
  enableVectorIndexing: boolean;
  enableSemanticTags: boolean;
  enableConceptMapping: boolean;

  // Performance tuning
  batchProcessingSize: number;
  enableIncrementalIndexing: boolean;
  indexingScheduleHour: number;

  // Analytics & telemetry
  enableAnonymousAnalytics: boolean;
  trackUsageMetrics: boolean;

  // Commercial features (for future licensing)
  licenseKey?: string;
  licenseStatus: "free" | "trial" | "licensed";
  trialExpirationDate?: number;
  featureTier: "free" | "pro" | "enterprise";

  // Multi-destination sync
  syncDestinations?: Array<{
    type: "cloud-folder" | "github" | "backup";
    path?: string;
    enabled: boolean;
    lastSync: number;
    frequency?: number;
    error?: string;
  }>;
}

export type ConfigPreset = "lightweight" | "balanced" | "comprehensive";

export class ConfigurationManager {
  private static readonly DEFAULTS: ExtensionConfig = {
    // Core capture
    autoCapture: true,
    captureCopilot: true,
    captureContinue: true,
    captureFoundry: true,
    captureCodex: false,
    captureClaude: false,
    captureGemini: false,
    captureLlama: false,
    captureBlackbox: false,
    minInteractionLength: 10,
    captureComments: true,

    // Microsoft ecosystem
    enableMicrosoftStack: false,
    captureBusinessCentral: false,
    captureFinanceSupplyChain: false,
    capturePowerPlatform: false,
    captureAzure: false,

    // Storage
    maxStorageSize: 1000,
    autoBackupEnabled: true,
    autoBackupFrequencyDays: 7,
    autoBackupRetentionDays: 30,
    customStorageLocation: "",

    // GitHub sync
    enableGitHubSync: false,
    gitHubAutoCommit: true,
    gitHubAutoPush: false,
    gitHubSyncBranch: "main",

    // Private GitHub repo
    enablePrivateGitHubRepo: false,
    gitHubAutoCreateRepo: false,
    gitHubRepositoryDescription:
      "AI Learning Repository - Private learnings and insights from AI-assisted development",

    // Context injection
    enableContextInjection: true,
    contextSensitivity: "medium",
    minContextConfidenceThreshold: 60,
    maxContextResultsPerSearch: 10,

    // Capture filters
    captureFilters: {},

    // Data retention
    enableAutoCleanup: false,
    autoCleanupIntervalDays: 30,
    removeUnusedLearningsAfterDays: 90,
    minReliabilityToKeep: 30,

    // Advanced indexing
    enableVectorIndexing: false,
    enableSemanticTags: false,
    enableConceptMapping: true,

    // Performance
    batchProcessingSize: 50,
    enableIncrementalIndexing: true,
    indexingScheduleHour: 2,

    // Analytics
    enableAnonymousAnalytics: false,
    trackUsageMetrics: true,

    // Commercial
    licenseStatus: "free",
    featureTier: "free",

    // Multi-destination sync
    syncDestinations: [],
  };

  private static readonly PRESETS: {
    [key in ConfigPreset]: Partial<ExtensionConfig>;
  } = {
    lightweight: {
      autoCapture: true,
      captureCopilot: true,
      captureContinue: false,
      captureFoundry: false,
      captureCodex: false,
      captureClaude: false,
      captureGemini: false,
      captureLlama: false,
      captureBlackbox: false,
      enableContextInjection: false,
      enableVectorIndexing: false,
      enableSemanticTags: false,
      enableAutoCleanup: false,
      trackUsageMetrics: false,
      maxStorageSize: 500,
      contextSensitivity: "low",
    },
    balanced: {
      autoCapture: true,
      captureCopilot: true,
      captureContinue: true,
      captureFoundry: false,
      captureCodex: true,
      captureClaude: true,
      captureGemini: false,
      captureLlama: false,
      captureBlackbox: false,
      enableContextInjection: true,
      enableVectorIndexing: false,
      enableSemanticTags: false,
      enableAutoCleanup: true,
      trackUsageMetrics: true,
      maxStorageSize: 1500,
      contextSensitivity: "medium",
      autoCleanupIntervalDays: 30,
      // Microsoft stack for business scenarios
      enableMicrosoftStack: true,
      captureBusinessCentral: true,
      captureFinanceSupplyChain: false,
      capturePowerPlatform: true,
      captureAzure: true,
    },
    comprehensive: {
      autoCapture: true,
      captureCopilot: true,
      captureContinue: true,
      captureFoundry: true,
      captureCodex: true,
      captureClaude: true,
      captureGemini: true,
      captureLlama: true,
      captureBlackbox: true,
      enableContextInjection: true,
      enableVectorIndexing: true,
      enableSemanticTags: true,
      enableAutoCleanup: true,
      trackUsageMetrics: true,
      maxStorageSize: 5000,
      contextSensitivity: "high",
      minContextConfidenceThreshold: 40,
      autoCleanupIntervalDays: 14,
      enableConceptMapping: true,
      enableIncrementalIndexing: true,
      // Full Microsoft stack
      enableMicrosoftStack: true,
      captureBusinessCentral: true,
      captureFinanceSupplyChain: true,
      capturePowerPlatform: true,
      captureAzure: true,
    },
  };

  public static getDefaults(): ExtensionConfig {
    return JSON.parse(JSON.stringify(this.DEFAULTS));
  }

  public static loadConfig(): ExtensionConfig {
    const vsConfig = vscode.workspace.getConfiguration("ai-learning-repo");
    const config = this.getDefaults();

    // Load each setting from VS Code config
    Object.keys(config).forEach((key) => {
      const value = vsConfig.get(key);
      if (value !== undefined) {
        (config as any)[key] = value;
      }
    });

    return config;
  }

  public static async saveConfig(
    config: Partial<ExtensionConfig>,
  ): Promise<void> {
    const vsConfig = vscode.workspace.getConfiguration("ai-learning-repo");

    for (const [key, value] of Object.entries(config)) {
      await vsConfig.update(key, value, vscode.ConfigurationTarget.Global);
    }
  }

  public static async applyPreset(preset: ConfigPreset): Promise<void> {
    const presetConfig = this.PRESETS[preset];
    const fullConfig = { ...this.getDefaults(), ...presetConfig };
    await this.saveConfig(fullConfig);
  }

  public static validateConfig(config: ExtensionConfig): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (config.maxStorageSize < 100) {
      errors.push("maxStorageSize must be at least 100");
    }

    if (config.minInteractionLength < 0) {
      errors.push("minInteractionLength must be non-negative");
    }

    if (
      config.minContextConfidenceThreshold < 0 ||
      config.minContextConfidenceThreshold > 100
    ) {
      errors.push("minContextConfidenceThreshold must be between 0 and 100");
    }

    if (
      config.maxContextResultsPerSearch < 1 ||
      config.maxContextResultsPerSearch > 50
    ) {
      errors.push("maxContextResultsPerSearch must be between 1 and 50");
    }

    if (config.autoBackupRetentionDays < 1) {
      errors.push("autoBackupRetentionDays must be at least 1");
    }

    if (config.autoCleanupIntervalDays < 1) {
      errors.push("autoCleanupIntervalDays must be at least 1");
    }

    if (config.indexingScheduleHour < 0 || config.indexingScheduleHour > 23) {
      errors.push("indexingScheduleHour must be between 0 and 23");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  public static getConfigSummary(config: ExtensionConfig): string {
    const lines: string[] = [
      "=== AI Learning Repository Configuration ===",
      "",
      "CAPTURE SETTINGS:",
      `  Auto Capture: ${config.autoCapture ? "✓" : "✗"}`,
      `  GitHub Copilot Chat: ${config.captureCopilot ? "✓" : "✗"}`,
      `  Continue: ${config.captureContinue ? "✓" : "✗"}`,
      `  AI Foundry: ${config.captureFoundry ? "✓" : "✗"}`,
      `  Codex: ${config.captureCodex ? "✓" : "✗"}`,
      `  Claude: ${config.captureClaude ? "✓" : "✗"}`,
      `  Gemini: ${config.captureGemini ? "✓" : "✗"}`,
      `  Llama: ${config.captureLlama ? "✓" : "✗"}`,
      `  Blackbox: ${config.captureBlackbox ? "✓" : "✗"}`,
      `  Min Interaction Length: ${config.minInteractionLength} chars`,
      "",
      "MICROSOFT ECOSYSTEM:",
      `  Stack Support: ${config.enableMicrosoftStack ? "✓ ENABLED" : "✗ disabled"}`,
      config.enableMicrosoftStack
        ? `  Business Central: ${config.captureBusinessCentral ? "✓" : "✗"}`
        : "",
      config.enableMicrosoftStack
        ? `  Finance & Supply Chain: ${config.captureFinanceSupplyChain ? "✓" : "✗"}`
        : "",
      config.enableMicrosoftStack
        ? `  Power Platform: ${config.capturePowerPlatform ? "✓" : "✗"}`
        : "",
      config.enableMicrosoftStack
        ? `  Azure: ${config.captureAzure ? "✓" : "✗"}`
        : "",
      "",
      "STORAGE SETTINGS:",
      `  Max Storage Size: ${config.maxStorageSize} learnings`,
      `  Auto Backup: ${config.autoBackupEnabled ? "✓" : "✗"}`,
      config.autoBackupEnabled
        ? `  Backup Frequency: Every ${config.autoBackupFrequencyDays} days`
        : "",
      "",
      "CONTEXT INJECTION:",
      `  Enabled: ${config.enableContextInjection ? "✓" : "✗"}`,
      `  Sensitivity: ${config.contextSensitivity}`,
      `  Min Confidence: ${config.minContextConfidenceThreshold}%`,
      `  Max Results: ${config.maxContextResultsPerSearch}`,
      "",
      "INDEXING:",
      `  Vector Indexing: ${config.enableVectorIndexing ? "✓" : "✗"}`,
      `  Semantic Tags: ${config.enableSemanticTags ? "✓" : "✗"}`,
      `  Concept Mapping: ${config.enableConceptMapping ? "✓" : "✗"}`,
      "",
      "FEATURE TIER:",
      `  License Status: ${config.licenseStatus}`,
      `  Feature Tier: ${config.featureTier}`,
    ];

    return lines.filter((l) => l !== "").join("\n");
  }

  public static getPresetDescriptions(): { [key in ConfigPreset]: string } {
    return {
      lightweight:
        "Minimal resource usage - captures GitHub Copilot Chat only, no context injection, small storage",
      balanced:
        "Recommended - captures GitHub Copilot Chat and Continue, context injection enabled, 1000 learnings",
      comprehensive:
        "Full featured - all sources, context injection, vector indexing, 5000 learnings, semantic analysis",
    };
  }
}
