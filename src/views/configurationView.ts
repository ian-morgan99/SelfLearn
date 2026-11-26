import * as vscode from "vscode";
import {
  ConfigurationManager,
  ExtensionConfig,
} from "../managers/configurationManager";
import { LearningManager } from "../managers/learningManager";

export class ConfigurationView {
  private panel: vscode.WebviewPanel | undefined;
  private learningManager: LearningManager;

  constructor(learningManager: LearningManager) {
    this.learningManager = learningManager;
  }

    public async show(
        extensionUri: vscode.Uri,
        extensionVersion: string,
    ): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "configurationView",
      "Settings",
      vscode.ViewColumn.One,
      { enableScripts: true },
    );

    const config = ConfigurationManager.loadConfig();
    const metadata = await this.learningManager.getMetadataIndex();

        this.panel.webview.html = this.getWebviewContent(
            config,
            metadata,
            extensionVersion,
        );

    this.panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message, config);
    });

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private async handleMessage(
    message: { command: string; [key: string]: any },
    currentConfig: ExtensionConfig,
  ): Promise<void> {
    switch (message.command) {
      case "applyPreset":
        await ConfigurationManager.applyPreset(message.preset);
        vscode.window.showInformationMessage(
          `Applied ${message.preset} preset`,
        );
        break;

      case "updateConfig":
        const updates = message.updates as Partial<ExtensionConfig>;
        const validation = ConfigurationManager.validateConfig({
          ...currentConfig,
          ...updates,
        });

        if (!validation.valid) {
          vscode.window.showErrorMessage(
            `Configuration error: ${validation.errors.join(", ")}`,
          );
          return;
        }

        await ConfigurationManager.saveConfig(updates);
        vscode.window.showInformationMessage("Settings updated successfully");
        break;

      case "getStats":
        const stats = await this.learningManager.getMetadataIndex();
        if (this.panel) {
          this.panel.webview.postMessage({
            command: "statsUpdated",
            stats,
          });
        }
        break;

      case "viewSummary":
        const summary = ConfigurationManager.getConfigSummary(currentConfig);
        vscode.window.showInformationMessage(summary);
        break;

      case "setupPrivateGitHub":
        await vscode.commands.executeCommand(
          "ai-learning-repo.setupPrivateGitHub",
        );
        break;

      case "checkGitHubStatus":
        await vscode.commands.executeCommand(
          "ai-learning-repo.checkGitHubStatus",
        );
        break;
    }
  }

    private getWebviewContent(
        config: ExtensionConfig,
        metadata: any,
        extensionVersion: string,
    ): string {
    const presets = ConfigurationManager.getPresetDescriptions();

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Learning Repository Settings</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            padding: 20px;
            line-height: 1.6;
        }

        .container {
            max-width: 900px;
            margin: 0 auto;
        }

        .header-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
        }

        h1 {
            font-size: 28px;
            margin-bottom: 8px;
            color: var(--vscode-editor-foreground);
        }

        .version {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 12px;
            padding: 2px 8px;
        }

        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 24px;
            font-size: 14px;
        }

        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
            gap: 12px;
            margin-bottom: 32px;
            background-color: var(--vscode-sideBar-background);
            padding: 16px;
            border-radius: 6px;
        }

        .stat-item {
            text-align: center;
            padding: 12px;
            border-radius: 4px;
            background-color: var(--vscode-editor-background);
        }

        .stat-number {
            font-size: 24px;
            font-weight: bold;
            color: var(--vscode-textLink-foreground);
        }

        .stat-label {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            text-transform: uppercase;
        }

        .section {
            margin-bottom: 32px;
            background-color: var(--vscode-sideBar-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            padding: 16px;
            border-radius: 4px;
        }

        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-editor-foreground);
        }

        .preset-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }

        .preset-card {
            padding: 16px;
            background-color: var(--vscode-editor-background);
            border: 2px solid transparent;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.2s ease;
        }

        .preset-card:hover {
            border-color: var(--vscode-textLink-foreground);
            background-color: var(--vscode-editorWidget-background);
        }

        .preset-card-title {
            font-weight: 600;
            margin-bottom: 4px;
            text-transform: capitalize;
        }

        .preset-card-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            line-height: 1.4;
        }

        .setting-group {
            margin-bottom: 16px;
        }

        .setting-label {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
            font-size: 14px;
        }

        .setting-label-text {
            font-weight: 500;
        }

        .setting-desc {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        input[type="text"],
        input[type="number"],
        select {
            width: 100%;
            padding: 8px 12px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: inherit;
            font-size: 14px;
        }

        input[type="checkbox"] {
            cursor: pointer;
            margin-right: 8px;
        }

        .checkbox-item {
            display: flex;
            align-items: center;
            margin-bottom: 8px;
        }

        .button-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }

        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: background-color 0.2s ease;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button.secondary {
            background-color: transparent;
            border: 1px solid var(--vscode-button-border);
            color: var(--vscode-button-foreground);
        }

        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .validation-error {
            color: var(--vscode-errorForeground);
            font-size: 12px;
            margin-top: 4px;
        }

        .info-box {
            background-color: var(--vscode-editorInfo-background);
            border-left: 4px solid var(--vscode-editorInfo-border);
            padding: 12px;
            margin-top: 12px;
            border-radius: 4px;
            font-size: 12px;
            color: var(--vscode-editorInfo-foreground);
        }

        .two-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
        }

        @media (max-width: 600px) {
            .two-column {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header-row">
            <h1>🧠 AI Learning Repository</h1>
            <div class="version">v${extensionVersion}</div>
        </div>
        <p class="subtitle">Configure how your extension captures and manages learnings</p>

        <!-- Statistics -->
        <div class="stats-grid">
            <div class="stat-item">
                <div class="stat-number" id="totalLearnings">0</div>
                <div class="stat-label">Total Learnings</div>
            </div>
            <div class="stat-item">
                <div class="stat-number" id="totalLanguages">0</div>
                <div class="stat-label">Languages</div>
            </div>
            <div class="stat-item">
                <div class="stat-number" id="totalConcepts">0</div>
                <div class="stat-label">Concepts</div>
            </div>
            <div class="stat-item">
                <div class="stat-number" id="avgReliability">0%</div>
                <div class="stat-label">Avg Reliability</div>
            </div>
        </div>

        <!-- Presets -->
        <div class="section">
            <div class="section-title">⚡ Quick Setup</div>
            <p style="font-size: 13px; margin-bottom: 12px; color: var(--vscode-descriptionForeground);">
                Choose a preset to quickly configure the extension for your needs:
            </p>
            <div class="preset-grid">
                <div class="preset-card" onclick="applyPreset('lightweight')">
                    <div class="preset-card-title">Lightweight</div>
                    <div class="preset-card-desc">${presets.lightweight}</div>
                </div>
                <div class="preset-card" onclick="applyPreset('balanced')">
                    <div class="preset-card-title">Balanced</div>
                    <div class="preset-card-desc">${presets.balanced}</div>
                </div>
                <div class="preset-card" onclick="applyPreset('comprehensive')">
                    <div class="preset-card-title">Comprehensive</div>
                    <div class="preset-card-desc">${presets.comprehensive}</div>
                </div>
            </div>
        </div>

        <!-- Capture Settings -->
        <div class="section">
            <div class="section-title">📝 Capture Settings</div>
            
            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="autoCapture" ${config.autoCapture ? "checked" : ""} onchange="updateConfig()">
                    <label for="autoCapture">
                        <span class="setting-label-text">Auto Capture AI Interactions</span>
                    </label>
                </div>
                <div class="setting-desc">Automatically capture interactions from AI assistants</div>
            </div>

            <div class="two-column">
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureCopilot" ${config.captureCopilot ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureCopilot">Capture Copilot Chat</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureContinue" ${config.captureContinue ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureContinue">Capture Continue</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureFoundry" ${config.captureFoundry ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureFoundry">Capture AI Foundry</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureCodex" ${config.captureCodex ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureCodex">Capture Codex</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureClaude" ${config.captureClaude ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureClaude">Capture Claude</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureGemini" ${config.captureGemini ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureGemini">Capture Gemini</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureLlama" ${config.captureLlama ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureLlama">Capture Llama</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureBlackbox" ${config.captureBlackbox ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureBlackbox">Capture Blackbox</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureComments" ${config.captureComments ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureComments">Capture Comments</label>
                    </div>
                </div>
            </div>

            <div class="setting-group">
                <div class="setting-label">
                    <span class="setting-label-text">Min Interaction Length (characters)</span>
                    <span id="minLengthValue">${config.minInteractionLength}</span>
                </div>
                <input type="number" id="minInteractionLength" value="${config.minInteractionLength}" min="0" max="1000" onchange="updateConfig()">
                <div class="setting-desc">Minimum length of interaction to capture</div>
            </div>
        </div>

        <!-- Microsoft Ecosystem -->
        <div class="section">
            <div class="section-title">☁️ Microsoft Ecosystem & Dynamics 365</div>
            
            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="enableMicrosoftStack" ${config.enableMicrosoftStack ? "checked" : ""} onchange="updateConfig()">
                    <label for="enableMicrosoftStack">
                        <span class="setting-label-text">Enable Microsoft Stack Support</span>
                    </label>
                </div>
                <div class="setting-desc">Capture learnings for Dynamics 365, Power Platform, and Azure</div>
            </div>

            ${
              config.enableMicrosoftStack
                ? `
            <div class="two-column">
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureBusinessCentral" ${config.captureBusinessCentral ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureBusinessCentral">Business Central</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureFinanceSupplyChain" ${config.captureFinanceSupplyChain ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureFinanceSupplyChain">Finance & Supply Chain</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="capturePowerPlatform" ${config.capturePowerPlatform ? "checked" : ""} onchange="updateConfig()">
                        <label for="capturePowerPlatform">Power Platform</label>
                    </div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="captureAzure" ${config.captureAzure ? "checked" : ""} onchange="updateConfig()">
                        <label for="captureAzure">Azure & Cloud Services</label>
                    </div>
                </div>
            </div>
            `
                : ""
            }
        </div>

        <!-- Storage Settings -->
        <div class="section">
            <div class="section-title">💾 Storage Settings</div>
            
            <div class="setting-group">
                <div class="setting-label">
                    <span class="setting-label-text">Max Storage Size (learnings)</span>
                    <span id="maxSizeValue">${config.maxStorageSize}</span>
                </div>
                <input type="number" id="maxStorageSize" value="${config.maxStorageSize}" min="100" max="10000" onchange="updateConfig()">
                <div class="setting-desc">Maximum number of learnings to store locally</div>
            </div>

            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="autoBackupEnabled" ${config.autoBackupEnabled ? "checked" : ""} onchange="updateConfig()">
                    <label for="autoBackupEnabled">
                        <span class="setting-label-text">Enable Auto Backup</span>
                    </label>
                </div>
                <div class="setting-desc">Automatically backup learnings to a local file</div>
            </div>

            <div class="two-column">
                <div class="setting-group">
                    <div class="setting-label">Backup Frequency (days)</div>
                    <input type="number" id="autoBackupFrequencyDays" value="${config.autoBackupFrequencyDays}" min="1" max="30" onchange="updateConfig()">
                </div>
                <div class="setting-group">
                    <div class="setting-label">Backup Retention (days)</div>
                    <input type="number" id="autoBackupRetentionDays" value="${config.autoBackupRetentionDays}" min="1" max="365" onchange="updateConfig()">
                </div>
            </div>

            <div class="setting-group">
                <div class="setting-label">Custom Storage Location</div>
                <input type="text" id="customStorageLocation" value="${config.customStorageLocation || ""}" placeholder="e.g., C:\\Users\\YourName\\OneDrive\\SelfLearn" onchange="updateConfig()">
                <div class="setting-desc">Path to cloud-synced folder (OneDrive, Google Drive, Dropbox). Leave empty for VS Code default storage. Useful for syncing across multiple PCs.</div>
            </div>
        </div>

        <!-- GitHub Sync -->
        <div class="section">
            <div class="section-title">🔗 GitHub Sync</div>
            <div class="setting-desc">Automatically sync learnings.json to your Git repository for cross-device access</div>
            
            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="enableGitHubSync" ${config.enableGitHubSync ? "checked" : ""} onchange="updateConfig()">
                    <label for="enableGitHubSync">
                        <span class="setting-label-text">Enable GitHub Sync</span>
                    </label>
                </div>
                <div class="setting-desc">Enable automatic syncing to your Git repository</div>
            </div>

            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="gitHubAutoCommit" ${config.gitHubAutoCommit ? "checked" : ""} onchange="updateConfig()">
                    <label for="gitHubAutoCommit">
                        <span class="setting-label-text">Auto Commit</span>
                    </label>
                </div>
                <div class="setting-desc">Automatically commit learnings.json after each update</div>
            </div>

            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="gitHubAutoPush" ${config.gitHubAutoPush ? "checked" : ""} onchange="updateConfig()">
                    <label for="gitHubAutoPush">
                        <span class="setting-label-text">Auto Push to GitHub</span>
                    </label>
                </div>
                <div class="setting-desc">Automatically push commits to remote (requires git setup)</div>
            </div>

            <div class="setting-group">
                <div class="setting-label">Git Branch</div>
                <input type="text" id="gitHubSyncBranch" value="${config.gitHubSyncBranch}" onchange="updateConfig()">
                <div class="setting-desc">Branch to sync learnings to (default: main)</div>
            </div>
        </div>

        <!-- Private GitHub Repository -->
        <div class="section">
            <div class="section-title">🔐 Private GitHub Repository</div>
            <div class="setting-desc">Secure, private repository for your learnings - encrypted and under your control</div>
            
            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="enablePrivateGitHubRepo" ${config.enablePrivateGitHubRepo ? "checked" : ""} onchange="updateConfig()">
                    <label for="enablePrivateGitHubRepo">
                        <span class="setting-label-text">Enable Private GitHub Repository</span>
                    </label>
                </div>
                <div class="setting-desc">Store learnings in a private GitHub repository (requires personal access token)</div>
            </div>

            <div class="setting-group">
                <div class="setting-label">Repository URL</div>
                <input type="text" id="gitHubRepoUrl" value="${config.gitHubRepoUrl || ""}" placeholder="https://github.com/username/ai-learnings (leave empty to auto-create)" onchange="updateConfig()">
                <div class="setting-desc">GitHub repository URL. Leave empty to auto-create a new private repository.</div>
            </div>

            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="gitHubAutoCreateRepo" ${config.gitHubAutoCreateRepo ? "checked" : ""} onchange="updateConfig()">
                    <label for="gitHubAutoCreateRepo">
                        <span class="setting-label-text">Auto-Create Repository</span>
                    </label>
                </div>
                <div class="setting-desc">Automatically create a new private repository if one doesn't exist</div>
            </div>

            <div class="setting-group">
                <div class="setting-label">Repository Description</div>
                <textarea id="gitHubRepositoryDescription" rows="2" onchange="updateConfig()">${config.gitHubRepositoryDescription}</textarea>
                <div class="setting-desc">Description for auto-created GitHub repository</div>
            </div>

            <div class="button-group">
                <button onclick="setupGitHub()">Setup Private Repository</button>
                <button class="secondary" onclick="checkGitHubStatus()">Check Status</button>
            </div>
        </div>

        <!-- Context Injection -->
        <div class="section">
            <div class="section-title">🎯 Context Injection</div>
            
            <div class="setting-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="enableContextInjection" ${config.enableContextInjection ? "checked" : ""} onchange="updateConfig()">
                    <label for="enableContextInjection">
                        <span class="setting-label-text">Enable Context Injection</span>
                    </label>
                </div>
                <div class="setting-desc">Automatically inject relevant learnings into new projects</div>
            </div>

            <div class="setting-group">
                <div class="setting-label">Context Sensitivity</div>
                <select id="contextSensitivity" onchange="updateConfig()">
                    <option value="low" ${config.contextSensitivity === "low" ? "selected" : ""}>Low - Only very relevant learnings</option>
                    <option value="medium" ${config.contextSensitivity === "medium" ? "selected" : ""}>Medium - Balanced relevance</option>
                    <option value="high" ${config.contextSensitivity === "high" ? "selected" : ""}>High - Include loosely related learnings</option>
                </select>
                <div class="setting-desc">How aggressive should context injection be</div>
            </div>

            <div class="two-column">
                <div class="setting-group">
                    <div class="setting-label">Min Confidence Threshold (%)</div>
                    <input type="number" id="minContextConfidenceThreshold" value="${config.minContextConfidenceThreshold}" min="0" max="100" onchange="updateConfig()">
                </div>
                <div class="setting-group">
                    <div class="setting-label">Max Results Per Search</div>
                    <input type="number" id="maxContextResultsPerSearch" value="${config.maxContextResultsPerSearch}" min="1" max="50" onchange="updateConfig()">
                </div>
            </div>
        </div>

        <!-- Advanced Settings -->
        <div class="section">
            <div class="section-title">⚙️ Advanced Settings</div>
            
            <div class="two-column">
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="enableVectorIndexing" ${config.enableVectorIndexing ? "checked" : ""} onchange="updateConfig()">
                        <label for="enableVectorIndexing">Vector Indexing</label>
                    </div>
                    <div class="setting-desc">Enable vector-based semantic search (advanced)</div>
                </div>
                <div class="setting-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="enableSemanticTags" ${config.enableSemanticTags ? "checked" : ""} onchange="updateConfig()">
                        <label for="enableSemanticTags">Semantic Tags</label>
                    </div>
                    <div class="setting-desc">Auto-generate semantic tags (advanced)</div>
                </div>
            </div>
        </div>

        <!-- Actions -->
        <div class="section">
            <div class="section-title">📊 Actions</div>
            <div class="button-group">
                <button onclick="viewSummary()">View Configuration Summary</button>
                <button class="secondary" onclick="getStats()">Refresh Statistics</button>
            </div>
        </div>

        <div class="info-box">
            💡 Changes are saved automatically. For help with specific settings, hover over the labels.
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function updateConfig() {
            const updates = {
                autoCapture: document.getElementById('autoCapture').checked,
                captureCopilot: document.getElementById('captureCopilot').checked,
                captureContinue: document.getElementById('captureContinue').checked,
                captureFoundry: document.getElementById('captureFoundry').checked,
                captureComments: document.getElementById('captureComments').checked,
                minInteractionLength: parseInt(document.getElementById('minInteractionLength').value),
                maxStorageSize: parseInt(document.getElementById('maxStorageSize').value),
                autoBackupEnabled: document.getElementById('autoBackupEnabled').checked,
                autoBackupFrequencyDays: parseInt(document.getElementById('autoBackupFrequencyDays').value),
                autoBackupRetentionDays: parseInt(document.getElementById('autoBackupRetentionDays').value),
                customStorageLocation: document.getElementById('customStorageLocation').value,
                enableGitHubSync: document.getElementById('enableGitHubSync').checked,
                gitHubAutoCommit: document.getElementById('gitHubAutoCommit').checked,
                gitHubAutoPush: document.getElementById('gitHubAutoPush').checked,
                gitHubSyncBranch: document.getElementById('gitHubSyncBranch').value,
                enablePrivateGitHubRepo: document.getElementById('enablePrivateGitHubRepo').checked,
                gitHubRepoUrl: document.getElementById('gitHubRepoUrl').value,
                gitHubAutoCreateRepo: document.getElementById('gitHubAutoCreateRepo').checked,
                gitHubRepositoryDescription: document.getElementById('gitHubRepositoryDescription').value,
                enableContextInjection: document.getElementById('enableContextInjection').checked,
                contextSensitivity: document.getElementById('contextSensitivity').value,
                minContextConfidenceThreshold: parseInt(document.getElementById('minContextConfidenceThreshold').value),
                maxContextResultsPerSearch: parseInt(document.getElementById('maxContextResultsPerSearch').value),
                enableVectorIndexing: document.getElementById('enableVectorIndexing').checked,
                enableSemanticTags: document.getElementById('enableSemanticTags').checked,
            };

            vscode.postMessage({
                command: 'updateConfig',
                updates
            });
        }

        function applyPreset(preset) {
            vscode.postMessage({
                command: 'applyPreset',
                preset
            });
            setTimeout(() => window.location.reload(), 500);
        }

        function viewSummary() {
            vscode.postMessage({
                command: 'viewSummary'
            });
        }

        function getStats() {
            vscode.postMessage({
                command: 'getStats'
            });
        }

        function setupGitHub() {
            vscode.postMessage({
                command: 'setupPrivateGitHub'
            });
        }

        function checkGitHubStatus() {
            vscode.postMessage({
                command: 'checkGitHubStatus'
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;
            if (message.command === 'statsUpdated') {
                const stats = message.stats;
                document.getElementById('totalLearnings').textContent = stats.totalLearnings;
                document.getElementById('totalLanguages').textContent = Object.keys(stats.languages).length;
                document.getElementById('totalConcepts').textContent = Object.keys(stats.concepts).length;
                document.getElementById('avgReliability').textContent = Math.round(stats.averageReliability) + '%';
            }
        });

        // Load stats on startup
        getStats();
    </script>
</body>
</html>`;
  }
}
