import * as vscode from "vscode";
import { LearningManager } from "../managers/learningManager";
import {
  ContextInjector,
  AIInteractionContext,
} from "../injectors/contextInjector";

export interface AIInteraction {
  source:
    | "copilot"
    | "continue"
    | "foundry"
    | "codex"
    | "claude"
    | "gemini"
    | "llama"
    | "blackbox"
    | "unknown";
  question: string;
  response: string;
  timestamp: number;
  language?: string;
  codeBlock?: string;
  context?: string;
  model?: string;
}

export class AIInteractionCapture {
  private learningManager: LearningManager;
  private context: vscode.ExtensionContext;
  private contextInjector: ContextInjector;
  private captureEnabled: boolean = true;
  private chatHistory: AIInteraction[] = [];
  private maxChatHistorySize: number = 100;

  constructor(
    learningManager: LearningManager,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;
    this.context = context;
    this.contextInjector = new ContextInjector(learningManager, context);
    this.setupCapture();
    this.updateConfig();
  }

  private setupCapture(): void {
    // Monitor chat input/output channels
    this.monitorChatInteractions();

    // Monitor active editor for chat patterns
    this.monitorActiveEditorForChatPatterns();

    // Monitor for GitHub Copilot Chat interactions (modern Copilot Chat interface)
    this.monitorCopilotChat();

    // Monitor for Continue interactions
    this.monitorContinueInteractions();

    // Monitor for other AI agents
    this.monitorCodexInteractions();
    this.monitorClaudeInteractions();
    this.monitorGeminiInteractions();
    this.monitorLlamaInteractions();
    this.monitorBlackboxInteractions();

    // Monitor configuration changes
    vscode.workspace.onDidChangeConfiguration(() => {
      this.updateConfig();
    });
  }

  private updateConfig(): void {
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    this.captureEnabled = config.get("captureAIInteractions", true);
  }

  private monitorActiveEditorForChatPatterns(): void {
    // Monitor when text documents change
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (!this.captureEnabled) return;

      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document !== event.document) return;

      // Check if this looks like a chat conversation
      const text = event.document.getText();
      const chatPatterns = this.detectChatPatterns(text);

      if (chatPatterns.length > 0) {
        // Debounce: only capture if user stopped typing for 3 seconds
        setTimeout(() => {
          this.autoCaptureFromChatPatterns(
            chatPatterns,
            event.document.languageId,
          );
        }, 3000);
      }
    });

    // Monitor when active editor changes
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!this.captureEnabled || !editor) return;

      const text = editor.document.getText();
      const chatPatterns = this.detectChatPatterns(text);

      if (chatPatterns.length > 0) {
        vscode.window
          .showInformationMessage(
            `Detected ${chatPatterns.length} AI conversation(s). Capturing...`,
            "View",
          )
          .then((action) => {
            if (action === "View") {
              vscode.commands.executeCommand(
                "ai-learning-repo.viewAIChatHistory",
              );
            }
          });
        this.autoCaptureFromChatPatterns(
          chatPatterns,
          editor.document.languageId,
        );
      }
    });
  }

  private detectChatPatterns(
    text: string,
  ): Array<{ question: string; answer: string }> {
    const conversations: Array<{ question: string; answer: string }> = [];

    // Pattern 1: User: ... Assistant: ... format
    const userAssistantPattern =
      /(?:User|Human|Question|Q):\s*([^\n]+(?:\n(?!(?:User|Human|Assistant|AI|Answer|A):)[^\n]+)*)\s*(?:Assistant|AI|Answer|A):\s*([^\n]+(?:\n(?!(?:User|Human|Question|Q):)[^\n]+)*)/gi;
    let match;
    while ((match = userAssistantPattern.exec(text)) !== null) {
      conversations.push({
        question: match[1].trim(),
        answer: match[2].trim(),
      });
    }

    // Pattern 2: Markdown-style Q&A with headers
    const markdownQAPattern =
      /##?\s*(?:Question|Q|User|Prompt)\s*[:\n]\s*([^#]+?)\s*##?\s*(?:Answer|A|Response|Assistant)\s*[:\n]\s*([^#]+?)(?=\n##|$)/gis;
    while ((match = markdownQAPattern.exec(text)) !== null) {
      conversations.push({
        question: match[1].trim(),
        answer: match[2].trim(),
      });
    }

    // Pattern 3: Numbered Q&A format
    const numberedQAPattern =
      /(?:^|\n)\s*(?:\d+\.?|[Qq]:)\s*([^\n]+(?:\n(?!\s*(?:\d+\.?|[AaQq]:))[^\n]+)*)\s*[Aa]:\s*([^\n]+(?:\n(?!\s*(?:\d+\.?|[AaQq]:))[^\n]+)*)/gim;
    while ((match = numberedQAPattern.exec(text)) !== null) {
      conversations.push({
        question: match[1].trim(),
        answer: match[2].trim(),
      });
    }

    // Pattern 4: GitHub Copilot Chat style (detect multi-line conversations)
    const copilotPattern =
      /<userRequest>([\s\S]*?)<\/userRequest>[\s\S]*?<function_calls>[\s\S]*?<\/antml:function_calls>|You:\s*([^\n]+(?:\n(?!(?:Copilot|GitHub Copilot):)[^\n]+)*)\s*(?:Copilot|GitHub Copilot):\s*([^\n]+(?:\n(?!You:)[^\n]+)*)/gis;
    while ((match = copilotPattern.exec(text)) !== null) {
      if (match[1]) {
        // XML-style user request
        conversations.push({
          question: match[1].trim(),
          answer: "(AI response detected in active conversation)",
        });
      } else if (match[2] && match[3]) {
        conversations.push({
          question: match[2].trim(),
          answer: match[3].trim(),
        });
      }
    }

    // Filter out very short exchanges (likely false positives)
    return conversations.filter(
      (c) => c.question.length > 20 && c.answer.length > 20,
    );
  }

  private async autoCaptureFromChatPatterns(
    conversations: Array<{ question: string; answer: string }>,
    language: string,
  ): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    const projectName = workspaceFolder?.name || "Unknown Project";

    for (const conv of conversations) {
      // Check if already captured (avoid duplicates)
      const recentLearnings = await this.learningManager.getAllLearnings();
      const isDuplicate = recentLearnings.some(
        (l) => l.question === conv.question && l.solution === conv.answer,
      );

      if (!isDuplicate) {
        await this.learningManager.addLearning(
          conv.question,
          conv.answer,
          language || "chat",
          ["ai-chat", "auto-captured", "conversation"],
          `Auto-captured from chat pattern in ${projectName}`,
          "success",
          "Automatically detected Q&A pattern in editor",
        );

        const interaction: AIInteraction = {
          source: "unknown",
          question: conv.question,
          response: conv.answer,
          timestamp: Date.now(),
          language: language,
          context: `Auto-captured from active editor`,
        };
        this.chatHistory.push(interaction);
      }
    }

    if (conversations.length > 0) {
      vscode.window.showInformationMessage(
        `Auto-captured ${conversations.length} AI conversation(s) to learning repository`,
      );
    }
  }

  private monitorChatInteractions(): void {
    // Listen to terminal output for AI interactions
    vscode.window.onDidOpenTerminal(() => {
      // Capture terminal commands and responses
    });

    // Monitor VS Code chat interface
    vscode.commands.registerCommand(
      "ai-learning-repo.captureCurrentChat",
      async () => {
        await this.captureVisibleChat();
      },
    );
  }

  private monitorCopilotChat(): void {
    // Monitor Copilot Chat extension
    // This captures interactions with VS Code's built-in Copilot Chat

    // Listen for chat messages
    vscode.commands.registerCommand(
      "ai-learning-repo.processCopilotChat",
      async () => {
        try {
          const editor = vscode.window.activeTextEditor;
          if (!editor) return;

          // Try to access Copilot chat history via extension API
          // Note: This is limited by VS Code API availability
          const chatMessages = await this.extractCopilotMessages();

          for (const message of chatMessages) {
            await this.processAIInteraction({
              source: "copilot",
              question: message.question,
              response: message.response,
              timestamp: Date.now(),
              language: this.detectLanguage(editor),
              codeBlock: this.extractCodeBlock(message.response),
              context: `Copilot Chat Interaction`,
            });
          }
        } catch (error) {
          console.log("Copilot chat capture:", error);
        }
      },
    );
  }

  private monitorContinueInteractions(): void {
    // Monitor Continue extension interactions
    // Continue stores conversation history that we can access

    vscode.commands.registerCommand(
      "ai-learning-repo.processContinueChat",
      async () => {
        try {
          const interactions = await this.extractContinueHistory();

          for (const interaction of interactions) {
            await this.processAIInteraction({
              source: "continue",
              question: interaction.userMessage,
              response: interaction.assistantMessage,
              timestamp: interaction.timestamp,
              language: interaction.language,
              codeBlock: this.extractCodeBlock(interaction.assistantMessage),
              model: interaction.model,
              context: "Continue Extension Chat",
            });
          }
        } catch (error) {
          console.log("Continue capture:", error);
        }
      },
    );
  }

  private monitorCodexInteractions(): void {
    // Monitor Codex (OpenAI Codex) interactions from various clients
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const captureCodex = config.get("captureCodex", false);

    if (!captureCodex) return;

    vscode.commands.registerCommand(
      "ai-learning-repo.processCodexChat",
      async () => {
        try {
          // Codex interactions from Jupyter, IDEs, or web interfaces
          const interactions = await this.extractCodexHistory();

          for (const interaction of interactions) {
            await this.processAIInteraction({
              source: "codex",
              question: interaction.prompt,
              response: interaction.completion,
              timestamp: Date.now(),
              language: "python", // Codex is Python-primary
              codeBlock: interaction.completion,
              model: "code-davinci-003", // Codex model variant
              context: "OpenAI Codex Interaction",
            });
          }
        } catch (error) {
          console.log("Codex capture:", error);
        }
      },
    );
  }

  private monitorClaudeInteractions(): void {
    // Monitor Claude (Anthropic) interactions
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const captureClaude = config.get("captureClaude", false);

    if (!captureClaude) return;

    vscode.commands.registerCommand(
      "ai-learning-repo.processClaudeChat",
      async () => {
        try {
          const interactions = await this.extractClaudeHistory();

          for (const interaction of interactions) {
            await this.processAIInteraction({
              source: "claude",
              question: interaction.userMessage,
              response: interaction.assistantMessage,
              timestamp: Date.now(),
              language: this.detectLanguageFromContent(interaction.userMessage),
              codeBlock: this.extractCodeBlock(interaction.assistantMessage),
              model: "claude-3", // Latest Claude model
              context: "Claude AI Interaction",
            });
          }
        } catch (error) {
          console.log("Claude capture:", error);
        }
      },
    );
  }

  private monitorGeminiInteractions(): void {
    // Monitor Google Gemini interactions
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const captureGemini = config.get("captureGemini", false);

    if (!captureGemini) return;

    vscode.commands.registerCommand(
      "ai-learning-repo.processGeminiChat",
      async () => {
        try {
          const interactions = await this.extractGeminiHistory();

          for (const interaction of interactions) {
            await this.processAIInteraction({
              source: "gemini",
              question: interaction.userMessage,
              response: interaction.assistantMessage,
              timestamp: Date.now(),
              language: this.detectLanguageFromContent(interaction.userMessage),
              codeBlock: this.extractCodeBlock(interaction.assistantMessage),
              model: "gemini-pro", // Google Gemini model
              context: "Google Gemini Interaction",
            });
          }
        } catch (error) {
          console.log("Gemini capture:", error);
        }
      },
    );
  }

  private monitorLlamaInteractions(): void {
    // Monitor Llama (Meta/Local) interactions
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const captureLlama = config.get("captureLlama", false);

    if (!captureLlama) return;

    vscode.commands.registerCommand(
      "ai-learning-repo.processLlamaChat",
      async () => {
        try {
          const interactions = await this.extractLlamaHistory();

          for (const interaction of interactions) {
            await this.processAIInteraction({
              source: "llama",
              question: interaction.userMessage,
              response: interaction.assistantMessage,
              timestamp: Date.now(),
              language: this.detectLanguageFromContent(interaction.userMessage),
              codeBlock: this.extractCodeBlock(interaction.assistantMessage),
              model: "llama-2", // Meta Llama model
              context: "Llama AI Interaction",
            });
          }
        } catch (error) {
          console.log("Llama capture:", error);
        }
      },
    );
  }

  private monitorBlackboxInteractions(): void {
    // Monitor Blackbox (community AI code search) interactions
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const captureBlackbox = config.get("captureBlackbox", false);

    if (!captureBlackbox) return;

    vscode.commands.registerCommand(
      "ai-learning-repo.processBlackboxChat",
      async () => {
        try {
          const interactions = await this.extractBlackboxHistory();

          for (const interaction of interactions) {
            await this.processAIInteraction({
              source: "blackbox",
              question: interaction.query,
              response: interaction.result,
              timestamp: Date.now(),
              language: interaction.language,
              codeBlock: this.extractCodeBlock(interaction.result),
              context: "Blackbox AI Code Search",
            });
          }
        } catch (error) {
          console.log("Blackbox capture:", error);
        }
      },
    );
  }

  private async extractCopilotMessages(): Promise<
    Array<{ question: string; response: string }>
  > {
    const messages: Array<{ question: string; response: string }> = [];

    try {
      // Access Copilot chat history from VS Code storage
      const chatHistory =
        this.context.globalState.get<any[]>("copilot.chat.history") || [];

      for (const entry of chatHistory) {
        if (entry.kind === "message" && entry.role === "user") {
          messages.push({
            question: entry.content,
            response: entry.response || "",
          });
        }
      }
    } catch (error) {
      console.log("Error extracting Copilot messages:", error);
    }

    return messages;
  }

  private async extractContinueHistory(): Promise<
    Array<{
      userMessage: string;
      assistantMessage: string;
      timestamp: number;
      language?: string;
      model?: string;
    }>
  > {
    const interactions: Array<{
      userMessage: string;
      assistantMessage: string;
      timestamp: number;
      language?: string;
      model?: string;
    }> = [];

    try {
      // Try to access Continue extension data
      const continueExt = vscode.extensions.getExtension("Continue.continue");

      if (continueExt) {
        // Continue stores history in its local storage
        const histories =
          this.context.globalState.get<any[]>("continue.history") || [];

        for (const history of histories) {
          if (history.messages && history.messages.length >= 2) {
            const lastUserMsg = history.messages
              .filter((m: any) => m.role === "user")
              .pop();
            const lastAssistantMsg = history.messages
              .filter((m: any) => m.role === "assistant")
              .pop();

            if (lastUserMsg && lastAssistantMsg) {
              interactions.push({
                userMessage: lastUserMsg.content,
                assistantMessage: lastAssistantMsg.content,
                timestamp: history.timestamp || Date.now(),
                language: history.language,
                model: history.model,
              });
            }
          }
        }
      }
    } catch (error) {
      console.log("Error extracting Continue history:", error);
    }

    return interactions;
  }

  private async extractCodexHistory(): Promise<
    Array<{
      prompt: string;
      completion: string;
    }>
  > {
    const interactions: Array<{
      prompt: string;
      completion: string;
    }> = [];

    try {
      // Attempt to access Codex history from local cache or API logs
      const codexCache =
        this.context.globalState.get<any[]>("codex.history") || [];

      for (const entry of codexCache) {
        if (entry.prompt && entry.completion) {
          interactions.push({
            prompt: entry.prompt,
            completion: entry.completion,
          });
        }
      }
    } catch (error) {
      console.log("Error extracting Codex history:", error);
    }

    return interactions;
  }

  private async extractClaudeHistory(): Promise<
    Array<{
      userMessage: string;
      assistantMessage: string;
    }>
  > {
    const interactions: Array<{
      userMessage: string;
      assistantMessage: string;
    }> = [];

    try {
      // Access Claude conversation history
      const claudeHistory =
        this.context.globalState.get<any[]>("claude.history") || [];

      for (const entry of claudeHistory) {
        if (entry.userMessage && entry.assistantMessage) {
          interactions.push({
            userMessage: entry.userMessage,
            assistantMessage: entry.assistantMessage,
          });
        }
      }
    } catch (error) {
      console.log("Error extracting Claude history:", error);
    }

    return interactions;
  }

  private async extractGeminiHistory(): Promise<
    Array<{
      userMessage: string;
      assistantMessage: string;
    }>
  > {
    const interactions: Array<{
      userMessage: string;
      assistantMessage: string;
    }> = [];

    try {
      // Access Google Gemini conversation history
      const geminiHistory =
        this.context.globalState.get<any[]>("gemini.history") || [];

      for (const entry of geminiHistory) {
        if (entry.userMessage && entry.assistantMessage) {
          interactions.push({
            userMessage: entry.userMessage,
            assistantMessage: entry.assistantMessage,
          });
        }
      }
    } catch (error) {
      console.log("Error extracting Gemini history:", error);
    }

    return interactions;
  }

  private async extractLlamaHistory(): Promise<
    Array<{
      userMessage: string;
      assistantMessage: string;
    }>
  > {
    const interactions: Array<{
      userMessage: string;
      assistantMessage: string;
    }> = [];

    try {
      // Access Llama conversation history (local or cloud)
      const llamaHistory =
        this.context.globalState.get<any[]>("llama.history") || [];

      for (const entry of llamaHistory) {
        if (entry.userMessage && entry.assistantMessage) {
          interactions.push({
            userMessage: entry.userMessage,
            assistantMessage: entry.assistantMessage,
          });
        }
      }
    } catch (error) {
      console.log("Error extracting Llama history:", error);
    }

    return interactions;
  }

  private async extractBlackboxHistory(): Promise<
    Array<{
      query: string;
      result: string;
      language?: string;
    }>
  > {
    const interactions: Array<{
      query: string;
      result: string;
      language?: string;
    }> = [];

    try {
      // Access Blackbox search history
      const blackboxHistory =
        this.context.globalState.get<any[]>("blackbox.history") || [];

      for (const entry of blackboxHistory) {
        if (entry.query && entry.result) {
          interactions.push({
            query: entry.query,
            result: entry.result,
            language: entry.language,
          });
        }
      }
    } catch (error) {
      console.log("Error extracting Blackbox history:", error);
    }

    return interactions;
  }

  private detectLanguageFromContent(content: string): string {
    // Language detection from content patterns including Microsoft ecosystem
    const languagePatterns: { [key: string]: RegExp } = {
      python: /python|def |import |class \w+/i,
      javascript: /javascript|function |const |let |=>|import /i,
      typescript: /typescript|interface |type |namespace /i,
      java: /java|public class|extends |@Override/i,
      cpp: /c\+\+|#include|int main|std::/i,
      csharp: /namespace |using |async Task|class \w+:/i,
      go: /golang|func |package |import /i,
      rust: /rust|fn |impl |cargo/i,
      "power-query": /let\s+\w+=|each|in|#"/i,
      dax: /EVALUATE|CALCULATE|MEASURE|RETURN/i,
      kql: /find|search|where|project|summarize/i,
      "t-sql": /SELECT|INSERT|UPDATE|DELETE|CREATE|sp_|@\w+/i,
      bicep: /param\s+|var\s+|resource\s+|output\s+/i,
      powershell: /\$\w+|Get-|Set-|-Path|-Value/i,
      json: /^\{|\^\[|":\s*(?:\{|\[)/,
      xml: /^\<\?xml|<\w+[^>]*>|xmlns=/i,
      yaml: /^\w+:\s*|^\s*-\s+/m,
      sql: /SELECT|INSERT|UPDATE|DELETE|CREATE|FROM/i,
      bash: /^#!/i,
    };

    for (const [lang, pattern] of Object.entries(languagePatterns)) {
      if (pattern.test(content)) {
        return lang;
      }
    }

    return "unknown";
  }

  public async captureVisibleChat(): Promise<void> {
    // Capture the current visible chat/conversation
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor to capture from");
      return;
    }

    const selectedText = editor.document.getText(editor.selection);
    if (selectedText.length > 0) {
      // Try to parse as Q&A format
      const lines = selectedText.split("\n");
      let question = "";
      let answer = "";
      let inAnswer = false;

      for (const line of lines) {
        if (line.match(/^(Q:|Question:|User:|You:)/i)) {
          question = line.replace(/^(Q:|Question:|User:|You:)\s*/i, "").trim();
          inAnswer = false;
        } else if (
          line.match(/^(A:|Answer:|Assistant:|Assistant:|Response:)/i)
        ) {
          inAnswer = true;
          answer = line
            .replace(/^(A:|Answer:|Assistant:|Response:)\s*/i, "")
            .trim();
        } else if (inAnswer) {
          answer += "\n" + line;
        }
      }

      if (question && answer) {
        await this.processAIInteraction({
          source: "unknown",
          question,
          response: answer,
          timestamp: Date.now(),
          language: this.detectLanguage(editor),
          codeBlock: this.extractCodeBlock(answer),
          context: "Manual Chat Capture",
        });
      }
    }
  }

  public async scanActiveEditorForChatPatterns(): Promise<number> {
    if (!this.captureEnabled) {
      return 0;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage("No active editor to scan");
      return 0;
    }

    const text = editor.document.getText();
    const chatPatterns = this.detectChatPatterns(text);
    if (chatPatterns.length === 0) {
      return 0;
    }

    await this.autoCaptureFromChatPatterns(
      chatPatterns,
      editor.document.languageId,
    );
    return chatPatterns.length;
  }

  private async processAIInteraction(
    interaction: AIInteraction,
  ): Promise<void> {
    if (!this.captureEnabled) return;

    try {
      // Track in history
      this.chatHistory.push(interaction);
      if (this.chatHistory.length > this.maxChatHistorySize) {
        this.chatHistory.shift();
      }

      // ✨ NEW: Enrich interaction with repository context BEFORE processing
      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: interaction.question,
        response: interaction.response,
        source: interaction.source,
      });

      // Log context for debugging
      if (enrichedContext.relevantLearnings.length > 0) {
        console.log(
          `[AICapture Context] Found ${enrichedContext.relevantLearnings.length} ` +
            `relevant learnings (confidence: ${enrichedContext.confidenceScore}%)`,
        );
      }

      // Extract learning from interaction
      const learning = await this.extractLearning(interaction, enrichedContext);

      if (learning) {
        // Add to learning manager
        const added = await this.learningManager.addLearning(
          learning.question,
          learning.solution,
          learning.language,
          learning.tags,
          learning.context,
          learning.outcome,
          learning.notes,
        );

        // Enrich with AI metadata AND context-based suggestions
        await this.learningManager.updateLearning(added.id, {
          ...added,
          source: "interaction",
          problemType: learning.problemTypes,
          concepts: learning.concepts,
          frameworks: learning.frameworks,
          reliability: 85, // AI-provided solutions are typically reliable
          difficulty: this.estimateDifficulty(interaction.response),
          keywords: this.extractKeywords(
            interaction.question,
            interaction.response,
          ),
          notes: `AI Source: ${interaction.source} | Model: ${interaction.model || "unknown"} | Context Confidence: ${enrichedContext.confidenceScore}%`,
          // Link to related learnings from context
          relatedLearningIds: enrichedContext.relevantLearnings
            .slice(0, 5)
            .map((l) => l.id),
        });

        // Show confirmation with context info
        const contextInfo =
          enrichedContext.relevantLearnings.length > 0
            ? ` (${enrichedContext.relevantLearnings.length} related learnings found)`
            : "";
        vscode.window.showInformationMessage(
          `✅ Learning captured from ${interaction.source}: "${learning.question.substring(0, 50)}..."${contextInfo}`,
        );
      }
    } catch (error) {
      console.log("Error processing AI interaction:", error);
    }
  }

  private async extractLearning(
    interaction: AIInteraction,
    enrichedContext?: AIInteractionContext,
  ): Promise<{
    question: string;
    solution: string;
    language: string;
    tags: string[];
    context: string;
    outcome: "success" | "partial" | "failed" | "unknown";
    notes: string;
    problemTypes: string[];
    concepts: string[];
    frameworks: string[];
  } | null> {
    // Analyze the interaction to extract a learning

    const question = this.cleanQuestion(interaction.question);
    const solution = interaction.codeBlock || interaction.response;
    const language =
      interaction.language ||
      this.detectLanguageFromResponse(interaction.response);

    // Use enriched context suggestions if available
    let problemTypes = this.detectProblemTypes(
      interaction.question,
      interaction.response,
    );
    let concepts = this.extractConcepts(language, interaction.response);
    let frameworks = this.detectFrameworks(interaction.response);

    // Enhance with context suggestions if available and high confidence
    if (enrichedContext && enrichedContext.confidenceScore >= 60) {
      // Merge suggestions from enriched context
      problemTypes = Array.from(
        new Set([
          ...problemTypes,
          ...enrichedContext.enrichmentSuggestions.problemTypes,
        ]),
      );
      concepts = Array.from(
        new Set([
          ...concepts,
          ...enrichedContext.enrichmentSuggestions.concepts,
        ]),
      );
      frameworks = Array.from(
        new Set([
          ...frameworks,
          ...enrichedContext.enrichmentSuggestions.frameworks,
        ]),
      );
    }

    // Determine if it's a valid learning
    if (!question || !solution) {
      return null;
    }

    // Create tags from the data
    const tags = [
      interaction.source,
      "ai-assisted",
      ...(interaction.source === "copilot" ? ["copilot"] : []),
      ...(interaction.source === "continue" ? ["continue"] : []),
      ...(interaction.source === "foundry" ? ["foundry"] : []),
      ...problemTypes,
      ...concepts.slice(0, 3),
    ];

    return {
      question,
      solution,
      language,
      tags,
      context:
        interaction.context ||
        `Captured from ${interaction.source} AI interaction`,
      outcome: "success", // AI-assisted interactions are typically successful
      notes: `Model: ${interaction.model || "unknown"} | Timestamp: ${new Date(interaction.timestamp).toISOString()}`,
      problemTypes,
      concepts,
      frameworks,
    };
  }

  private cleanQuestion(question: string): string {
    return question
      .replace(/^(Q:|Question:|User:|You:|Assistant:|>)\s*/i, "")
      .trim()
      .split("\n")[0] // Take first line only
      .slice(0, 200); // Limit length
  }

  private extractCodeBlock(text: string): string {
    const codeBlockRegex = /```[\s\S]*?```/g;
    const blocks = text.match(codeBlockRegex);

    if (blocks && blocks.length > 0) {
      // Return the first code block, cleaned
      return blocks[0].replace(/```[\w]*\n?/g, "").trim();
    }

    return "";
  }

  private detectLanguage(editor: vscode.TextEditor): string {
    const lang = editor.document.languageId;
    const languageMap: { [key: string]: string } = {
      typescript: "TypeScript",
      typescriptreact: "TypeScript",
      javascript: "JavaScript",
      javascriptreact: "JavaScript",
      python: "Python",
      java: "Java",
      csharp: "C#",
      go: "Go",
      rust: "Rust",
      cpp: "C++",
      c: "C",
      powerquery: "Power Query",
      dax: "DAX",
      kql: "KQL",
      bicep: "Bicep",
      powershell: "PowerShell",
      sql: "SQL",
      "t-sql": "T-SQL",
      json: "JSON",
      xml: "XML",
      yaml: "YAML",
    };

    return languageMap[lang] || "unknown";
  }

  private detectLanguageFromResponse(response: string): string {
    // Detect language from code blocks
    const codeBlockMatch = response.match(/```([\w-]+)/);
    if (codeBlockMatch) {
      const lang = codeBlockMatch[1].toLowerCase();
      const languageMap: { [key: string]: string } = {
        ts: "TypeScript",
        tsx: "TypeScript",
        typescript: "TypeScript",
        js: "JavaScript",
        jsx: "JavaScript",
        javascript: "JavaScript",
        py: "Python",
        python: "Python",
        java: "Java",
        cs: "C#",
        csharp: "C#",
        go: "Go",
        rs: "Rust",
        rust: "Rust",
        cpp: "C++",
        c: "C",
        "power-query": "Power Query",
        powerquery: "Power Query",
        dax: "DAX",
        kql: "KQL",
        "t-sql": "T-SQL",
        bicep: "Bicep",
        powershell: "PowerShell",
        json: "JSON",
        xml: "XML",
        yaml: "YAML",
        sql: "SQL",
        bash: "Bash",
      };
      return languageMap[lang] || "unknown";
    }

    return "unknown";
  }

  private detectProblemTypes(question: string, solution: string): string[] {
    const types = new Set<string>();
    const lower = (question + " " + solution).toLowerCase();

    if (/async|await|promise|\.then/.test(lower)) types.add("async");
    if (/error|exception|catch|throw|try/.test(lower))
      types.add("error-handling");
    if (/state|useState|reducer|dispatch/.test(lower))
      types.add("state-management");
    if (/performance|optimize|cache|memo/.test(lower)) types.add("performance");
    if (/test|mock|jest|mocha|unit/.test(lower)) types.add("testing");
    if (/security|auth|token|password|encrypt/.test(lower))
      types.add("security");
    if (/api|fetch|http|request|response|rest/.test(lower))
      types.add("api-integration");
    if (/database|sql|query|connection|orm/.test(lower)) types.add("database");
    if (/loop|map|filter|reduce|iteration/.test(lower)) types.add("iteration");
    if (/race|concurrent|parallel|async|sync/.test(lower))
      types.add("concurrency");

    return Array.from(types);
  }

  private extractConcepts(language: string, code: string): string[] {
    const concepts = new Set<string>();

    if (language.match(/TypeScript|JavaScript/i)) {
      if (/async|await/.test(code)) concepts.add("async-await");
      if (/\.then|Promise/.test(code)) concepts.add("promises");
      if (/function\*|yield/.test(code)) concepts.add("generators");
      if (/class.*extends|super/.test(code)) concepts.add("inheritance");
      if (/interface|type\s+\w+\s*=/.test(code)) concepts.add("type-system");
      if (/@[A-Z]|decorator/.test(code)) concepts.add("decorators");
      if (/useState|useEffect|useContext/.test(code))
        concepts.add("react-hooks");
    }

    if (language === "Python") {
      if (/async def|await|asyncio/.test(code)) concepts.add("async-await");
      if (/@property|@staticmethod|@classmethod/.test(code))
        concepts.add("decorators");
      if (/lambda/.test(code)) concepts.add("functional-programming");
      if (/with\s+/.test(code)) concepts.add("context-managers");
    }

    concepts.add("ai-assisted");
    return Array.from(concepts);
  }

  private detectFrameworks(code: string): string[] {
    const frameworks = new Set<string>();

    if (/react|jsx|tsx|useState/.test(code)) frameworks.add("React");
    if (/vue|v-if|v-for/.test(code)) frameworks.add("Vue");
    if (/angular|@angular|@Component/.test(code)) frameworks.add("Angular");
    if (/express|app\.get|router\./.test(code)) frameworks.add("Express");
    if (/next\.js|getServerSideProps/.test(code)) frameworks.add("Next.js");
    if (/fastapi|@app\./.test(code)) frameworks.add("FastAPI");
    if (/django/.test(code)) frameworks.add("Django");
    if (/flask|@app\./.test(code)) frameworks.add("Flask");

    return Array.from(frameworks);
  }

  private extractKeywords(question: string, response: string): string[] {
    const keywords = new Set<string>();
    const text = (question + " " + response).toLowerCase();

    const commonKeywords = [
      "async",
      "await",
      "promise",
      "function",
      "class",
      "interface",
      "error",
      "exception",
      "try",
      "catch",
      "throw",
      "api",
      "http",
      "request",
      "response",
      "fetch",
      "database",
      "query",
      "sql",
      "orm",
      "test",
      "mock",
      "jest",
      "unit",
      "component",
      "state",
      "props",
      "hook",
      "decorator",
      "factory",
      "singleton",
      "pattern",
    ];

    commonKeywords.forEach((kw) => {
      if (text.includes(kw)) {
        keywords.add(kw);
      }
    });

    return Array.from(keywords);
  }

  private estimateDifficulty(
    response: string,
  ): "beginner" | "intermediate" | "advanced" | "expert" {
    const lines = response.split("\n").length;
    const complexity = (
      response.match(/async|await|Promise|\.then|try|catch|class|interface/g) ||
      []
    ).length;

    if (lines < 10 && complexity <= 1) return "beginner";
    if (lines < 30 && complexity <= 3) return "intermediate";
    if (lines < 100 && complexity <= 6) return "advanced";
    return "expert";
  }

  public async enableCapture(): Promise<void> {
    this.captureEnabled = true;
    vscode.window.showInformationMessage("AI interaction capture enabled");
  }

  public async disableCapture(): Promise<void> {
    this.captureEnabled = false;
    vscode.window.showInformationMessage("AI interaction capture disabled");
  }

  public async getInteractionHistory(): Promise<AIInteraction[]> {
    return [...this.chatHistory];
  }

  public async clearInteractionHistory(): Promise<void> {
    this.chatHistory = [];
  }

  public async captureInteractionManually(
    question: string,
    response: string,
  ): Promise<void> {
    await this.processAIInteraction({
      source: "unknown",
      question,
      response,
      timestamp: Date.now(),
      context: "Manual capture",
    });
  }
}
