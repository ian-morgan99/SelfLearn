import * as vscode from "vscode";
import { LearningManager } from "./managers/learningManager";
import { InteractionTracker } from "./trackers/interactionTracker";
import { LearningsTreeProvider } from "./views/learningsTreeView";
import { ContextInjector } from "./injectors/contextInjector";
import { LegacyImporter } from "./importers/legacyImporter";
import { AIInteractionCapture } from "./capturers/aiInteractionCapture";
import { ConfigurationManager } from "./managers/configurationManager";
import { ConfigurationView } from "./views/configurationView";
import { AnalyticsView } from "./views/analyticsView";
import { LearningEnricher } from "./analyzers/learningEnricher";
import { RealtimeCaptureEnhancer } from "./capturers/realtimeCaptureEnhancer";
import { MultiAIChatIntegration } from "./injectors/multiAIChatIntegration";
import { LicenseManager } from "./managers/licenseManager";
import { StorageMigrationManager } from "./managers/storageManager";

let learningManager: LearningManager;
let interactionTracker: InteractionTracker;
let contextInjector: ContextInjector;
let legacyImporter: LegacyImporter;
let aiInteractionCapture: AIInteractionCapture;
let configurationView: ConfigurationView;
let analyticsView: AnalyticsView;
let learningEnricher: LearningEnricher;
let realtimeCaptureEnhancer: RealtimeCaptureEnhancer;
let multiAIChat: MultiAIChatIntegration;
let licenseManager: LicenseManager;

export function activate(context: vscode.ExtensionContext) {
  try {
    console.log("AI Learning Repository extension activated");

    // Perform storage migration if upgrading from old publisher
    void StorageMigrationManager.migrateIfNeeded(context);

    // Initialize core components
    learningManager = new LearningManager(context);
    interactionTracker = new InteractionTracker(learningManager, context);
    contextInjector = new ContextInjector(learningManager, context);
    legacyImporter = new LegacyImporter(learningManager, context);
    aiInteractionCapture = new AIInteractionCapture(learningManager, context);
    configurationView = new ConfigurationView(learningManager);
    licenseManager = new LicenseManager(
      context,
      learningManager.getSecureStorage(),
    );
    void licenseManager.verifyLicense();

    // Initialize Phase 2: Background enrichment
    learningEnricher = new LearningEnricher(learningManager);

    // Initialize Phase 3: Real-time capture enhancement
    realtimeCaptureEnhancer = new RealtimeCaptureEnhancer(
      learningManager,
      context,
    );

    // Initialize multi-AI chat integration (Copilot, Continue, Codex, AI Toolkit, Foundry)
    multiAIChat = new MultiAIChatIntegration(
      learningManager,
      contextInjector,
      context,
    );

    // Register tree view
    const learningsProvider = new LearningsTreeProvider(learningManager);
    vscode.window.registerTreeDataProvider("learnings-tree", learningsProvider);

    // Register analytics view
    analyticsView = new AnalyticsView(context.extensionUri, () =>
      learningManager.getAllLearnings(),
    );
    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(
        AnalyticsView.viewType,
        analyticsView,
      ),
    );

    const REFRESH_DEBOUNCE_MS = 1500;
    const REFRESH_MAX_WAIT_MS = 10000;
    let refreshTimer: NodeJS.Timeout | undefined;
    let lastRefreshAt = 0;

    const scheduleLearningsRefresh = (): void => {
      const now = Date.now();
      if (refreshTimer) {
        clearTimeout(refreshTimer);
      }

      const delay =
        now - lastRefreshAt >= REFRESH_MAX_WAIT_MS ? 0 : REFRESH_DEBOUNCE_MS;

      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        lastRefreshAt = Date.now();
        learningsProvider.refresh();
        analyticsView.refresh();
      }, delay);
    };

    context.subscriptions.push(
      learningManager.onDidChangeLearnings(() => {
        scheduleLearningsRefresh();
      }),
    );

    console.log("About to register commands...");

    const requireProAccess = async (featureName: string): Promise<boolean> => {
      const access = await licenseManager.checkProAccess();
      if (access.allowed) {
        return true;
      }

      const action = await vscode.window.showWarningMessage(
        `${featureName} is available in Pro. Enter a license key to unlock Pro features.`,
        "Enter License Key",
        "Check License Status",
        "Enable Test Override",
      );

      if (action === "Enter License Key") {
        await vscode.commands.executeCommand(
          "ai-learning-repo.enterLicenseKey",
        );
      } else if (action === "Check License Status") {
        await vscode.commands.executeCommand(
          "ai-learning-repo.checkLicenseStatus",
        );
      } else if (action === "Enable Test Override") {
        await vscode.commands.executeCommand(
          "ai-learning-repo.enableTestLicenseOverride",
        );
      }

      return false;
    };

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "ai-learning-repo.viewLearnings",
        async (learning) => {
          try {
            if (learning) {
              // Show detailed view of a specific learning
              const panel = vscode.window.createWebviewPanel(
                "learningDetail",
                `Learning: ${learning.question.substring(0, 50)}...`,
                vscode.ViewColumn.One,
                { enableScripts: true },
              );

              const htmlContent = `
              <!DOCTYPE html>
              <html>
              <head>
                <style>
                  body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); }
                  .container { max-width: 800px; }
                  .field { margin: 15px 0; }
                  .label { font-weight: bold; color: var(--vscode-textPreformat-foreground); margin-bottom: 5px; }
                  .value { 
                    background: var(--vscode-textCodeBlock-background); 
                    padding: 10px; 
                    border-radius: 4px; 
                    white-space: pre-wrap; 
                    word-wrap: break-word;
                    font-family: monospace;
                    font-size: 13px;
                  }
                  .outcome { padding: 5px 10px; border-radius: 3px; display: inline-block; font-weight: bold; }
                  .outcome.success { background: var(--vscode-gitDecoration-addedResourceForeground); }
                  .outcome.partial { background: var(--vscode-editorWarning-foreground); }
                  .outcome.failed { background: var(--vscode-editorError-foreground); }
                  .meta { display: flex; gap: 30px; margin: 15px 0; }
                  .meta-item { flex: 1; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h2>${learning.question}</h2>
                  
                  <div class="meta">
                    <div class="meta-item">
                      <div class="label">Language</div>
                      <div class="value">${learning.language}</div>
                    </div>
                    <div class="meta-item">
                      <div class="label">Framework</div>
                      <div class="value">${learning.framework || "Unknown"}</div>
                    </div>
                    <div class="meta-item">
                      <div class="label">Outcome</div>
                      <div class="outcome ${learning.outcome}">${learning.outcome.toUpperCase()}</div>
                    </div>
                  </div>

                  <div class="field">
                    <div class="label">📌 Context</div>
                    <div class="value">${learning.context}</div>
                  </div>

                  <div class="field">
                    <div class="label">💡 Solution</div>
                    <div class="value">${learning.solution}</div>
                  </div>

                  <div class="field">
                    <div class="label">📊 Outcome Details</div>
                    <div class="value">${learning.outcome}</div>
                  </div>

                  <div class="field">
                    <div class="label">🔗 Source</div>
                    <div class="value">${learning.source}</div>
                  </div>

                  <div class="field">
                    <div class="label">📅 Learned On</div>
                    <div class="value">${new Date(learning.timestamp).toLocaleString()}</div>
                  </div>

                  <div class="field">
                    <div class="label">⭐ Reliability Score</div>
                    <div class="value">${learning.reliability || 0}%</div>
                  </div>

                  ${
                    learning.tags && learning.tags.length > 0
                      ? `
                  <div class="field">
                    <div class="label">🏷️ Tags</div>
                    <div class="value">${(learning.tags || []).join(", ")}</div>
                  </div>
                  `
                      : ""
                  }
                </div>
              </body>
              </html>
            `;

              panel.webview.html = htmlContent;
            } else {
              // Show all learnings summary
              const learnings = await learningManager.getAllLearnings();
              vscode.window.showInformationMessage(
                `Total learnings: ${learnings.length}`,
              );
            }
          } catch (error) {
            console.error("Error viewing learnings:", error);
            vscode.window.showErrorMessage(`Failed to view learning: ${error}`);
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.exportLearnings",
        async () => {
          await learningManager.exportLearnings();
          vscode.window.showInformationMessage(
            "Learnings exported successfully",
          );
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.clearLearnings",
        async () => {
          const confirm = await vscode.window.showWarningMessage(
            "Are you sure you want to clear all learnings? This cannot be undone.",
            { modal: true },
            "Clear All",
          );
          if (confirm === "Clear All") {
            await learningManager.clearAll();
            scheduleLearningsRefresh();
            vscode.window.showInformationMessage("All learnings cleared");
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.injectContext",
        async () => {
          await contextInjector.injectContextForCurrentProject();
          vscode.window.showInformationMessage("Learning context injected");
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.importLegacy",
        async () => {
          await legacyImporter.importFromLegacyProject();
          scheduleLearningsRefresh();
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.captureAIChat",
        async () => {
          // Manually capture the selected chat/code or markdown document
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showWarningMessage(
              "Please open a document to capture",
            );
            return;
          }

          // Check if it's a markdown document
          if (editor.document.languageId === "markdown") {
            const text = editor.document.getText();
            const fileName =
              editor.document.fileName.split(/[\\\/]/).pop() || "document";
            const titleMatch = text.match(/^#\s+(.+)$/m);
            const title = titleMatch ? titleMatch[1].trim() : fileName;

            await learningManager.addLearning(
              `Documentation: ${title}`,
              text,
              "markdown",
              ["documentation", "ai-generated", "manual-capture"],
              `Manually captured markdown document: ${fileName}`,
              "success",
              `Full document captured from ${editor.document.uri.fsPath}`,
            );

            vscode.window.showInformationMessage(`Captured: ${title}`);
          } else {
            await aiInteractionCapture.captureVisibleChat?.();
          }

          scheduleLearningsRefresh();
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.captureChatSummary",
        async () => {
          const editor = vscode.window.activeTextEditor;
          const selectionText = editor
            ? editor.document.getText(editor.selection)
            : "";
          const clipboardText = selectionText
            ? ""
            : await vscode.env.clipboard.readText();
          const solution = (selectionText || clipboardText).trim();

          if (!solution) {
            vscode.window.showWarningMessage(
              "Select the chat summary text or copy it to the clipboard before capturing.",
            );
            return;
          }

          const question = await vscode.window.showInputBox({
            prompt: "What should this learning be titled?",
            placeHolder: "e.g., VS Code Marketplace licensing limitations",
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return "Title is required";
              }
              return null;
            },
          });

          if (!question) return;

          const context = await vscode.window.showInputBox({
            prompt: "Context (optional)",
            placeHolder: "e.g., Commercializing VS Code extension",
          });

          const tagsInput = await vscode.window.showInputBox({
            prompt: "Tags (comma-separated, optional)",
            placeHolder: "licensing, marketplace, paddle",
          });

          const tags = tagsInput
            ? tagsInput
                .split(",")
                .map((tag) => tag.trim())
                .filter((tag) => tag.length > 0)
            : [];

          const language = editor?.document.languageId || "chat";
          await learningManager.addLearning(
            question.trim(),
            solution,
            language,
            ["manual", "chat-summary", ...tags],
            context || "Manual chat summary capture",
            "success",
            "Captured from chat summary",
          );

          scheduleLearningsRefresh();
          vscode.window.showInformationMessage(
            "✅ Chat summary captured as a learning",
          );
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.scanChatLearnings",
        async () => {
          const count =
            await aiInteractionCapture.scanActiveEditorForChatPatterns();
          if (count === 0) {
            vscode.window.showInformationMessage(
              "No chat-style interactions found in the active editor.",
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.enableAICapture",
        async () => {
          await aiInteractionCapture.enableCapture();
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.disableAICapture",
        async () => {
          await aiInteractionCapture.disableCapture();
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.viewAIChatHistory",
        async () => {
          const history = await aiInteractionCapture.getInteractionHistory();
          vscode.window.showInformationMessage(
            `Captured ${history.length} AI interactions`,
          );
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.openSettings",
        async () => {
          await configurationView.show(
            context.extensionUri,
            context.extension.packageJSON.version,
          );
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.enterLicenseKey",
        async () => {
          const key = await vscode.window.showInputBox({
            prompt: "Enter your license key",
            password: true,
            placeHolder: "XXXX-XXXX-XXXX-XXXX",
            validateInput: (value) => {
              if (!value || value.trim().length === 0) {
                return "License key is required";
              }
              return null;
            },
          });

          if (!key) return;

          const state = await licenseManager.setLicenseKey(key.trim());
          if (state.status === "licensed" || state.status === "trial") {
            vscode.window.showInformationMessage(
              "License verified. Pro features unlocked.",
            );
            return;
          }

          vscode.window.showWarningMessage(
            "License could not be verified. Check your key or verification URL.",
          );
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.checkLicenseStatus",
        async () => {
          const state = await licenseManager.verifyLicense({ force: true });
          const summary = await licenseManager.getLicenseSummary();
          const level =
            state.status === "licensed" || state.status === "trial"
              ? vscode.window.showInformationMessage
              : vscode.window.showWarningMessage;
          level(summary);
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.clearLicenseKey",
        async () => {
          const confirm = await vscode.window.showWarningMessage(
            "Remove the stored license key? Pro features will be disabled.",
            { modal: true },
            "Remove Key",
          );
          if (confirm === "Remove Key") {
            await licenseManager.clearLicenseKey();
            vscode.window.showInformationMessage("License key removed");
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.enableTestLicenseOverride",
        async () => {
          try {
            let overrideKey: string | undefined;

            if (context.extensionMode === vscode.ExtensionMode.Production) {
              overrideKey = await vscode.window.showInputBox({
                prompt: "Enter a temporary test override key for this install",
                password: true,
                placeHolder: "Temporary testing key",
                validateInput: (value) => {
                  if (!value || value.trim().length === 0) {
                    return "A temporary override key is required";
                  }
                  return null;
                },
              });

              if (!overrideKey) {
                return;
              }
            }

            const state =
              await licenseManager.enableTestingOverride(overrideKey);

            if (state.status === "licensed" || state.status === "trial") {
              vscode.window.showInformationMessage(
                "Test override enabled. Pro features unlocked for this install.",
              );
              return;
            }

            vscode.window.showWarningMessage(
              "Test override was configured, but Pro features are still locked.",
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(
              `Failed to enable test override: ${message}`,
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.setupCloudSync",
        async () => {
          if (!(await requireProAccess("Cloud sync"))) {
            return;
          }

          try {
            console.log("[SETUP CLOUD SYNC] Command started");
            const pickResult = await vscode.window.showQuickPick(
              [
                {
                  label: "$(check) Configure Sync Destinations",
                  description: "Choose which services to sync learnings to",
                  id: "configure",
                },
                {
                  label: "$(sync) View Current Sync Status",
                  description: "See which destinations are currently enabled",
                  id: "status",
                },
              ],
              { placeHolder: "Multi-destination sync setup" },
            );

            if (!pickResult) return;

            if (pickResult.id === "status") {
              const config = ConfigurationManager.loadConfig();
              const destinations = config.syncDestinations || [];
              const message =
                destinations.length > 0
                  ? `📦 Syncing to:\n${destinations.map((d: any) => `• ${d.type}: ${d.path || "configured"}`).join("\n")}`
                  : "❌ No sync destinations configured yet";
              vscode.window.showInformationMessage(message);
              return;
            }

            // Configure destinations
            console.log(
              "[SETUP CLOUD SYNC] User selected: Configure destinations",
            );
            const destinations = await vscode.window.showQuickPick(
              [
                {
                  label: "☁️ OneDrive / Google Drive / Dropbox",
                  picked: true,
                  description: "Choose folder for cloud sync",
                },
                {
                  label: "🔐 GitHub Private Repository",
                  picked: true,
                  description: "Secure Git-based sync",
                },
                {
                  label: "📋 Manual Backup",
                  description: "Create local backups you control",
                },
              ],
              {
                placeHolder: "Select all sync destinations you want",
                canPickMany: true,
              },
            );

            if (!destinations || destinations.length === 0) return;

            const syncDestinations: any[] = [];

            console.log(
              "[SETUP CLOUD SYNC] Processing destinations:",
              destinations?.map((d) => d.label),
            );

            for (const dest of destinations) {
              if (
                dest.label.startsWith("☁️") &&
                !syncDestinations.find((d) => d.type === "cloud-folder")
              ) {
                const folderUri = await vscode.window.showOpenDialog({
                  canSelectFolders: true,
                  canSelectFiles: false,
                  canSelectMany: false,
                  title:
                    "Select cloud-synced folder (OneDrive, Google Drive, or Dropbox)",
                  openLabel: "Use this folder",
                });

                if (folderUri && folderUri.length > 0) {
                  syncDestinations.push({
                    type: "cloud-folder",
                    path: folderUri[0].fsPath,
                    enabled: true,
                    lastSync: 0,
                  });
                }
              } else if (
                dest.label.startsWith("🔐") &&
                !syncDestinations.find((d) => d.type === "github")
              ) {
                const setupGitHub = await vscode.window.showQuickPick(
                  [
                    { label: "Setup GitHub Sync Now", id: "setup" },
                    { label: "Skip for Now", id: "skip" },
                  ],
                  { placeHolder: "Configure GitHub sync?" },
                );

                if (setupGitHub?.id === "setup") {
                  await vscode.commands.executeCommand(
                    "ai-learning-repo.setupPrivateGitHub",
                  );
                  syncDestinations.push({
                    type: "github",
                    enabled: true,
                    lastSync: 0,
                  });
                } else {
                  syncDestinations.push({
                    type: "github",
                    enabled: false,
                    lastSync: 0,
                  });
                }
              } else if (
                dest.label.startsWith("📋") &&
                !syncDestinations.find((d) => d.type === "backup")
              ) {
                syncDestinations.push({
                  type: "backup",
                  enabled: true,
                  frequency: 1,
                  lastSync: 0,
                });
              }
            }

            if (syncDestinations.length > 0) {
              console.log(
                "[SYNC SETUP] Saving syncDestinations:",
                JSON.stringify(syncDestinations),
              );

              // Enable GitHub sync if it's configured
              const hasGitHub = syncDestinations.some(
                (d) => d.type === "github" && d.enabled,
              );

              await ConfigurationManager.saveConfig({
                syncDestinations: syncDestinations,
                enableGitHubSync: hasGitHub,
              });

              // Update learning manager to refresh git sync settings
              learningManager.updateConfig();

              console.log("[SYNC SETUP] Saved. Verifying read...");
              const verify = ConfigurationManager.loadConfig();
              console.log(
                "[SYNC SETUP] Verified loaded config has:",
                verify.syncDestinations,
              );

              const summary = syncDestinations
                .map((d) => `• ${d.type}: ${d.path || "enabled"}`)
                .join("\n");
              vscode.window.showInformationMessage(
                `✅ Multi-destination sync configured!\n\nSyncing learnings to:\n${summary}\n\nConflicts will auto-resolve by latest timestamp.`,
              );

              // Trigger initial sync
              await learningManager.syncToAllDestinations();
            }
          } catch (error) {
            console.error("Error in cloud sync setup:", error);
            vscode.window.showErrorMessage(`Cloud sync setup failed: ${error}`);
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.gitSyncLearnings",
        async () => {
          // GitHub sync is free for now - re-enable the Pro gate later if needed.
          const success = await learningManager.syncLearningsToGit();
          if (success) {
            vscode.window.showInformationMessage(
              "Learnings synced to Git successfully",
            );
          } else {
            const reason = learningManager.getGitSyncError();
            vscode.window.showWarningMessage(
              reason
                ? `Git sync did not run: ${reason}`
                : "Git sync completed - no changes to commit",
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.pullLatestLearnings",
        async () => {
          // GitHub sync is free for now - re-enable the Pro gate later if needed.
          const success = await learningManager.pullLatestLearnings();
          if (success) {
            scheduleLearningsRefresh();
            vscode.window.showInformationMessage(
              "Latest learnings pulled from Git",
            );
          } else {
            const reason = learningManager.getGitSyncError();
            vscode.window.showWarningMessage(
              reason ? `Git pull failed: ${reason}` : "Git pull did not run",
            );
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.setupPrivateGitHub",
        async () => {
          // GitHub sync is free for now - re-enable the Pro gate later if needed.
          const token = await vscode.window.showInputBox({
            prompt: "Enter your GitHub Personal Access Token",
            password: true,
            placeHolder: "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
            validateInput: (value) => {
              if (!value) return "Token is required";
              if (
                !value.startsWith("ghp_") &&
                !value.startsWith("github_pat_")
              ) {
                return "Invalid GitHub token format";
              }
              return null;
            },
          });

          if (token) {
            vscode.window.showInformationMessage(
              "Setting up private GitHub repository...",
            );

            const result =
              await learningManager.setupPrivateGitHubRepository(token);

            if (result.success) {
              vscode.window.showInformationMessage(result.message);
              if (result.repoUrl) {
                const openRepo = await vscode.window.showInformationMessage(
                  "Repository ready",
                  "Open in Browser",
                );
                if (openRepo) {
                  vscode.env.openExternal(vscode.Uri.parse(result.repoUrl));
                }
              }
            } else {
              vscode.window.showErrorMessage(`Setup failed: ${result.message}`);
            }
          }
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.checkGitHubStatus",
        async () => {
          // GitHub sync is free for now - re-enable the Pro gate later if needed.
          const status = await learningManager.checkPrivateGitHubStatus();

          let statusMessage = "GitHub Repository Status:\n\n";
          statusMessage += `✓ Configured: ${status.configured ? "Yes" : "No"}\n`;
          statusMessage += `✓ Authenticated: ${status.authenticated ? "Yes" : "No"}\n`;
          statusMessage += `✓ Has Access: ${status.hasAccess ? "Yes" : "No"}\n`;

          if (status.repoUrl) {
            statusMessage += `\nRepository: ${status.repoUrl}`;
          } else {
            statusMessage +=
              "\nNo repository set - configure ai-learning-repo.gitHubRepoUrl.";
          }

          const syncStatus = await learningManager.getGitSyncStatus();
          statusMessage += `\nStorage repo: ${syncStatus.repoRoot || "unknown"}`;
          statusMessage += `\nGit repository: ${syncStatus.isGitRepo ? "Yes" : "No"}`;
          if (syncStatus.branch) {
            statusMessage += ` (${syncStatus.branch})`;
          }
          statusMessage += `\nRemote: ${syncStatus.remote || "none"}`;

          vscode.window.showInformationMessage(statusMessage);
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.pushAllLearningsToSync",
        async () => {
          if (!(await requireProAccess("Cloud sync"))) {
            return;
          }

          try {
            console.log("[PUSH SYNC] Command started");
            const loadedConfig = ConfigurationManager.loadConfig();
            console.log(
              "[PUSH SYNC] Loaded config has syncDestinations:",
              loadedConfig.syncDestinations,
            );
            const result = await vscode.window.withProgress(
              {
                location: vscode.ProgressLocation.Notification,
                title: "Pushing all learnings to sync destinations...",
                cancellable: false,
              },
              async (progress) => {
                return await learningManager.syncToAllDestinations();
              },
            );

            if (result.success) {
              const destCount = result.destinations.length;
              const summary = result.destinations
                .map((d: any) => `• ${d.type}: ${d.status}`)
                .join("\n");

              vscode.window.showInformationMessage(
                `✅ Synced ${result.synced} destination(s)!\n\n${summary}\n\n${result.conflicts} conflicts auto-resolved by timestamp.`,
              );
            } else {
              vscode.window.showWarningMessage(
                "No sync destinations configured. Set up sync with 'Setup Cloud Sync for Learnings'",
              );
            }
          } catch (error) {
            console.error("Error pushing learnings to sync:", error);
            vscode.window.showErrorMessage(
              `Failed to push learnings: ${error}`,
            );
          }
        },
      ),

      // Phase 2: Background enrichment commands
      vscode.commands.registerCommand(
        "ai-learning-repo.enrichAllLearnings",
        async () => {
          const result = await vscode.window.showQuickPick(
            [
              {
                label: "$(sync) Enrich All Learnings",
                description:
                  "Add concepts, problem types, and difficulty to all learnings",
                action: "all",
              },
              {
                label: "$(clock) Enrich Recent (Last 30 Days)",
                description: "Only enrich learnings from the last 30 days",
                action: "recent",
              },
            ],
            { placeHolder: "Choose enrichment scope" },
          );

          if (!result) return;

          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "Enriching learnings...",
              cancellable: false,
            },
            async (progress) => {
              await learningEnricher.enrichAllLearnings((current, total) => {
                progress.report({
                  message: `${current}/${total} learnings processed`,
                  increment: (1 / total) * 100,
                });
              });
            },
          );

          vscode.window.showInformationMessage(
            "✅ All learnings enriched with metadata!",
          );
          scheduleLearningsRefresh();
        },
      ),

      // Phase 3: Real-time capture commands
      vscode.commands.registerCommand(
        "ai-learning-repo.togglePasteDetection",
        async () => {
          const config = vscode.workspace.getConfiguration("ai-learning-repo");
          const current = config.get("enablePasteDetection", true);
          await config.update("enablePasteDetection", !current, true);
          realtimeCaptureEnhancer.setPasteDetectionEnabled(!current);
        },
      ),

      vscode.commands.registerCommand(
        "ai-learning-repo.toggleAICommentDetection",
        async () => {
          const config = vscode.workspace.getConfiguration("ai-learning-repo");
          const current = config.get("enableAICommentDetection", true);
          await config.update("enableAICommentDetection", !current, true);
          realtimeCaptureEnhancer.setAICommentDetectionEnabled(!current);
        },
      ),

      // Multi-AI integration commands
      vscode.commands.registerCommand(
        "ai-learning-repo.queryLearningsForContinue",
        async () => {
          const query = await vscode.window.showInputBox({
            prompt: "What do you want to learn about?",
            placeHolder: "e.g., async error handling",
          });
          if (query) {
            const context = await multiAIChat.getContextForQuery(
              query,
              "continue",
            );
            vscode.window.showInformationMessage(
              `Found ${context.relevantLearnings.length} relevant learnings`,
            );
          }
        },
      ),
    );
    console.log(
      "✅ All commands registered successfully (including Multi-AI integration)",
    );

    // Listen to text editor changes to capture potential AI-generated code
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        interactionTracker.onDocumentChanged(event);
      }),
    );

    // Monitor when files are created (potential AI generation)
    context.subscriptions.push(
      vscode.workspace.onDidCreateFiles((event) => {
        interactionTracker.onFilesCreated(event);
      }),
    );

    // Initialize settings listener
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("ai-learning-repo")) {
          learningManager.updateConfig();
          interactionTracker.updateConfig();
        }
      }),
    );

    // Refresh tree view when workspace folders change (switching projects)
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        console.log("Workspace folder changed - refreshing learnings view");
        scheduleLearningsRefresh();
      }),
    );

    console.log("AI Learning Repository extension fully initialized");
  } catch (error) {
    console.error("FATAL ERROR during extension activation:", error);
    vscode.window.showErrorMessage(`Extension activation failed: ${error}`);
    throw error; // Re-throw to let VS Code know activation failed
  }
}

export function deactivate() {
  console.log("AI Learning Repository extension deactivated");
}
