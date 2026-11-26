import * as vscode from "vscode";
import { LearningManager } from "../managers/learningManager";

/**
 * Enhanced real-time capture of AI-generated code and interactions
 *
 * Phase 3: AI comment detection, paste detection, quick capture, better chat matching
 */
export class RealtimeCaptureEnhancer {
  private learningManager: LearningManager;
  private statusBarItem: vscode.StatusBarItem;
  private pasteDetectionEnabled: boolean = true;
  private aiCommentDetectionEnabled: boolean = true;

  // Patterns to detect AI-generated markers
  private readonly AI_MARKERS = [
    /\/\/ AI:/i,
    /\/\/ Copilot:/i,
    /\/\/ Generated:/i,
    /# AI:/i,
    /# Copilot:/i,
    /<!-- AI:/i,
  ];

  constructor(
    learningManager: LearningManager,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;

    // Create status bar item for quick capture
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.text = "$(book) Capture Learning";
    this.statusBarItem.tooltip = "Quick capture current code as learning";
    this.statusBarItem.command = "ai-learning-repo.quickCapture";
    this.statusBarItem.show();
    context.subscriptions.push(this.statusBarItem);

    this.setupEventListeners(context);
  }

  /**
   * Setup event listeners for real-time detection
   */
  private setupEventListeners(context: vscode.ExtensionContext): void {
    // Monitor document changes for paste detection and AI comments
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.onDocumentChanged(event);
      }),
    );

    // Monitor when documents are opened (scan for AI comments)
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((document) => {
        this.scanDocumentForAIComments(document);
      }),
    );

    // Register quick capture command
    context.subscriptions.push(
      vscode.commands.registerCommand("ai-learning-repo.quickCapture", () => {
        this.showQuickCaptureModal();
      }),
    );

    // Register keyboard shortcut (already in package.json as Ctrl+Shift+L)
  }

  /**
   * Handle document changes - detect pastes and AI comments
   */
  private async onDocumentChanged(
    event: vscode.TextDocumentChangeEvent,
  ): Promise<void> {
    if (!event.contentChanges || event.contentChanges.length === 0) {
      return;
    }

    const change = event.contentChanges[0];

    // Detect large paste (likely from AI)
    if (this.pasteDetectionEnabled && this.isLargePaste(change)) {
      await this.handleLargePaste(event.document, change);
    }

    // Check if the change contains AI marker comments
    if (this.aiCommentDetectionEnabled) {
      for (const aiMarker of this.AI_MARKERS) {
        if (aiMarker.test(change.text)) {
          await this.handleAIMarkerDetected(event.document, change);
          break;
        }
      }
    }
  }

  /**
   * Detect if a change is a large paste (likely AI-generated)
   */
  private isLargePaste(change: vscode.TextDocumentContentChangeEvent): boolean {
    // Large paste criteria:
    // - More than 50 lines OR 500 characters
    // - Instant change (no typing delay)
    const lineCount = change.text.split("\n").length;
    const charCount = change.text.length;

    return lineCount > 50 || charCount > 500;
  }

  /**
   * Handle detection of large paste
   */
  private async handleLargePaste(
    document: vscode.TextDocument,
    change: vscode.TextDocumentContentChangeEvent,
  ): Promise<void> {
    const lineCount = change.text.split("\n").length;

    // Show notification with option to capture
    const action = await vscode.window.showInformationMessage(
      `📋 Large code paste detected (${lineCount} lines). Capture as learning?`,
      "Yes",
      "No",
      "Don't ask again",
    );

    if (action === "Yes") {
      await this.captureCodeAsLearning(
        document,
        change.text,
        change.range.start,
      );
    } else if (action === "Don't ask again") {
      this.pasteDetectionEnabled = false;
      vscode.window.showInformationMessage(
        "Paste detection disabled. Re-enable in settings.",
      );
    }
  }

  /**
   * Handle detection of AI marker comment
   */
  private async handleAIMarkerDetected(
    document: vscode.TextDocument,
    change: vscode.TextDocumentContentChangeEvent,
  ): Promise<void> {
    // Extract the AI marker line
    const lines = change.text.split("\n");
    const markerLine = lines.find((line) =>
      this.AI_MARKERS.some((marker) => marker.test(line)),
    );

    if (!markerLine) return;

    // Extract context from marker comment
    const context = markerLine.replace(/\/\/|#|<!--|-->/g, "").trim();

    // Get the code block after the marker
    const startLine = change.range.start.line;
    const endLine = Math.min(startLine + 50, document.lineCount - 1);
    const codeRange = new vscode.Range(startLine, 0, endLine, 0);
    const code = document.getText(codeRange);

    // Show notification
    const action = await vscode.window.showInformationMessage(
      `🤖 AI-generated code detected. Capture as learning?`,
      "Yes",
      "No",
    );

    if (action === "Yes") {
      await this.captureCodeAsLearning(
        document,
        code,
        change.range.start,
        context,
      );
    }
  }

  /**
   * Scan entire document for AI marker comments
   */
  private async scanDocumentForAIComments(
    document: vscode.TextDocument,
  ): Promise<void> {
    const text = document.getText();
    const lines = text.split("\n");

    const aiMarkerLines: { line: number; content: string }[] = [];

    lines.forEach((line, index) => {
      if (this.AI_MARKERS.some((marker) => marker.test(line))) {
        aiMarkerLines.push({ line: index, content: line });
      }
    });

    if (aiMarkerLines.length > 0) {
      vscode.window.showInformationMessage(
        `📚 Found ${aiMarkerLines.length} AI marker(s) in this file. View and capture?`,
        "Yes",
        "Later",
      );
    }
  }

  /**
   * Show quick capture modal for instant learning capture
   */
  private async showQuickCaptureModal(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor found");
      return;
    }

    // Get selected text or current line
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    const code =
      selectedText || editor.document.lineAt(selection.start.line).text;

    if (!code || code.trim().length === 0) {
      vscode.window.showWarningMessage(
        "No code selected or found on current line",
      );
      return;
    }

    // Show quick input for question
    const question = await vscode.window.showInputBox({
      prompt: "What problem does this code solve?",
      placeHolder: "e.g., How to handle async errors in React",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Question is required";
        }
        return null;
      },
    });

    if (!question) return;

    // Show quick input for context (optional)
    const context = await vscode.window.showInputBox({
      prompt: "Additional context (optional)",
      placeHolder: "e.g., Using React 18 with TypeScript",
    });

    // Detect language
    const language = editor.document.languageId;

    // Add learning
    await this.learningManager.addLearning(
      question,
      code,
      language,
      ["quick-capture"],
      context || "",
      "success",
      "Captured via quick capture",
    );

    vscode.window.showInformationMessage("✅ Learning captured successfully!");
    this.statusBarItem.text = "$(check) Captured!";
    setTimeout(() => {
      this.statusBarItem.text = "$(book) Capture Learning";
    }, 2000);
  }

  /**
   * Capture code as learning with context
   */
  private async captureCodeAsLearning(
    document: vscode.TextDocument,
    code: string,
    position: vscode.Position,
    detectedContext?: string,
  ): Promise<void> {
    // Show input box for question
    const question = await vscode.window.showInputBox({
      prompt: "What problem does this code solve?",
      placeHolder: "e.g., How to implement user authentication",
      value: detectedContext || "",
      validateInput: (value) => {
        if (!value || value.trim().length === 0) {
          return "Question is required";
        }
        return null;
      },
    });

    if (!question) return;

    // Get file context
    const fileName = document.fileName;
    const lineNumber = position.line + 1;
    const fileContext = `File: ${fileName}, Line: ${lineNumber}`;

    // Detect language
    const language = document.languageId;

    // Add learning
    await this.learningManager.addLearning(
      question,
      code,
      language,
      ["ai-generated", "auto-detected"],
      fileContext,
      "success",
      "Auto-detected from AI marker or paste",
    );

    vscode.window.showInformationMessage("✅ Learning captured successfully!");
  }

  /**
   * Monitor chat panels for AI interactions (GitHub Copilot, Continue)
   */
  public startChatMonitoring(): void {
    // Note: This is a placeholder for future implementation
    // Requires VS Code API for accessing chat panels
    // GitHub Copilot Chat and Continue use different mechanisms

    console.log("[RealtimeCaptureEnhancer] Chat monitoring started");

    // Potential implementation:
    // 1. Listen for webview panel creation
    // 2. Monitor panel titles for "Copilot Chat", "Continue", etc.
    // 3. Extract Q&A pairs from chat history
    // 4. Auto-suggest learnings from extracted pairs
  }

  /**
   * Enable/disable paste detection
   */
  public setPasteDetectionEnabled(enabled: boolean): void {
    this.pasteDetectionEnabled = enabled;
    vscode.window.showInformationMessage(
      `Paste detection ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * Enable/disable AI comment detection
   */
  public setAICommentDetectionEnabled(enabled: boolean): void {
    this.aiCommentDetectionEnabled = enabled;
    vscode.window.showInformationMessage(
      `AI comment detection ${enabled ? "enabled" : "disabled"}`,
    );
  }

  /**
   * Update status bar with learning count
   */
  public async updateStatusBar(): Promise<void> {
    const learnings = await this.learningManager.getAllLearnings();
    this.statusBarItem.text = `$(book) ${learnings.length} Learnings`;
  }

  /**
   * Dispose resources
   */
  public dispose(): void {
    this.statusBarItem.dispose();
  }
}
