import * as vscode from "vscode";
import { LearningManager } from "../managers/learningManager";
import { ContextInjector } from "./contextInjector";
import { AgentFrameworkToolAdapter } from "./agentFrameworkToolAdapter";
import { ContinueToolsAdapter } from "./continueToolsAdapter";
import { AgentRouter } from "./agentRouter";

/**
 * Multi-AI Tool Chat Integration
 * Provides context injection for:
 * - GitHub Copilot Chat (via VS Code Chat API)
 * - Continue extension
 * - OpenAI Codex
 * - Microsoft AI Toolkit
 * - Microsoft Foundry/AI Foundry
 * - Microsoft Agent Framework
 */
export class MultiAIChatIntegration {
  private learningManager: LearningManager;
  private contextInjector: ContextInjector;
  private context: vscode.ExtensionContext;
  private participants: Map<string, vscode.ChatParticipant> = new Map();
  private agentFrameworkAdapter: AgentFrameworkToolAdapter;
  private continueAdapter: ContinueToolsAdapter;
  private agentRouter: AgentRouter;

  constructor(
    learningManager: LearningManager,
    contextInjector: ContextInjector,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;
    this.contextInjector = contextInjector;
    this.context = context;

    // Initialize router first (needed by adapter)
    this.agentRouter = new AgentRouter(learningManager, contextInjector);

    this.agentFrameworkAdapter = new AgentFrameworkToolAdapter(
      learningManager,
      contextInjector,
      this.agentRouter,
    );
    this.continueAdapter = new ContinueToolsAdapter(
      learningManager,
      contextInjector,
    );
    this.initialize();
  }

  private initialize() {
    // Register VS Code native chat participant (works with GitHub Copilot Chat)
    this.registerVSCodeChatParticipant();

    // Register with Continue extension
    this.registerContinueIntegration();

    // Register with Codex/OpenAI tools
    this.registerCodexIntegration();

    // Register with Microsoft AI Toolkit
    this.registerAIToolkitIntegration();

    // Register with Microsoft Foundry/AI Foundry
    this.registerFoundryIntegration();

    // Register with Microsoft Agent Framework
    this.registerAgentFrameworkIntegration();

    console.log("Multi-AI chat integration initialized with tool registration");
  }

  /**
   * VS Code Chat API - Works with GitHub Copilot Chat natively
   */
  private registerVSCodeChatParticipant() {
    try {
      const participant = vscode.chat.createChatParticipant(
        "ai-learning-repo.learnings",
        this.handleChatRequest.bind(this),
      );

      participant.iconPath = vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "learning.svg",
      );

      this.participants.set("vscode", participant);
      this.context.subscriptions.push(participant);

      console.log("✅ VS Code Chat participant registered (@learnings)");
    } catch (error) {
      console.error("Failed to register VS Code chat participant:", error);
    }
  }

  /**
   * Continue Extension Integration
   * Registers tools (slash commands) and context providers
   */
  private registerContinueIntegration() {
    try {
      // Register tool-based commands for Continue
      const tools = this.continueAdapter.getToolDefinitions();

      tools.forEach((tool) => {
        const cmd = vscode.commands.registerCommand(
          `ai-learning-repo.continue${tool.name.charAt(0).toUpperCase() + tool.name.slice(1)}`,
          async (...args: any[]) => {
            if (tool.handler) {
              const params =
                Array.isArray(args) && args.length > 0 ? args[0] : {};
              return await tool.handler(params);
            }
            return undefined;
          },
        );

        this.context.subscriptions.push(cmd);
      });

      // Register a general command that Continue can use as a slash command
      const cmd = vscode.commands.registerCommand(
        "ai-learning-repo.continueContextProvider",
        async (query: string) => {
          const enrichedContext =
            await this.contextInjector.enrichAIInteraction({
              question: query,
              response: "",
              source: "continue",
            });

          return this.formatContextForContinue(enrichedContext);
        },
      );

      this.context.subscriptions.push(cmd);

      // Also expose via Continue's context provider API if available
      this.exposeToContinueAPI();

      console.log("✅ Continue integration registered with tool definitions");
    } catch (error) {
      console.error("Failed to register Continue integration:", error);
    }
  }

  /**
   * Continue API exposure - allows Continue to query our learnings
   */
  private async exposeToContinueAPI() {
    try {
      // Check if Continue extension is installed
      const continueExt = vscode.extensions.getExtension("Continue.continue");
      if (!continueExt) {
        console.log("Continue extension not found - skipping API exposure");
        return;
      }

      await continueExt.activate();

      // Register our context provider with Continue
      // Continue uses a specific API for context providers
      const continueAPI = continueExt.exports;
      if (continueAPI && continueAPI.registerContextProvider) {
        continueAPI.registerContextProvider({
          name: "learnings",
          displayName: "AI Learning Repository",
          description: "Context from your learning repository",
          getContextItems: async (query: string) => {
            const enrichedContext =
              await this.contextInjector.enrichAIInteraction({
                question: query,
                response: "",
                source: "continue",
              });

            return enrichedContext.relevantLearnings.map((learning) => ({
              name: learning.question,
              description: `${learning.language} - Reliability: ${learning.reliability}%`,
              content: this.formatLearningForContinue(learning),
            }));
          },
        });

        console.log("✅ Continue API context provider registered");
      }
    } catch (error) {
      console.log("Continue API not available:", error);
    }
  }

  /**
   * OpenAI Codex Integration
   * Provides context via command and clipboard
   */
  private registerCodexIntegration() {
    try {
      // Command to copy context to clipboard for Codex
      const cmd = vscode.commands.registerCommand(
        "ai-learning-repo.copyContextForCodex",
        async () => {
          const editor = vscode.window.activeTextEditor;
          if (!editor) {
            vscode.window.showWarningMessage("No active editor");
            return;
          }

          const selection = editor.document.getText(editor.selection);
          const query = selection || "current file context";

          const enrichedContext =
            await this.contextInjector.enrichAIInteraction({
              question: query,
              response: "",
              source: "codex",
            });

          const formattedContext = this.formatContextForCodex(enrichedContext);

          await vscode.env.clipboard.writeText(formattedContext);
          vscode.window.showInformationMessage(
            "Context copied! Paste into Codex prompt.",
          );
        },
      );

      this.context.subscriptions.push(cmd);

      console.log("✅ Codex integration registered");
    } catch (error) {
      console.error("Failed to register Codex integration:", error);
    }
  }

  /**
   * Microsoft AI Toolkit Integration
   */
  private registerAIToolkitIntegration() {
    try {
      // Check if AI Toolkit is installed
      const aiToolkitExt = vscode.extensions.getExtension(
        "ms-windows-ai-studio.windows-ai-studio",
      );

      // Register command for AI Toolkit
      const cmd = vscode.commands.registerCommand(
        "ai-learning-repo.aiToolkitContextProvider",
        async (query: string) => {
          const enrichedContext =
            await this.contextInjector.enrichAIInteraction({
              question: query || "AI Toolkit query",
              response: "",
              source: "foundry",
            });

          return this.formatContextForAIToolkit(enrichedContext);
        },
      );

      this.context.subscriptions.push(cmd);

      // Try to integrate with AI Toolkit API if available
      if (aiToolkitExt) {
        this.integrateWithAIToolkit(aiToolkitExt);
      }

      console.log("✅ Microsoft AI Toolkit integration registered");
    } catch (error) {
      console.error("Failed to register AI Toolkit integration:", error);
    }
  }

  /**
   * Microsoft Foundry/AI Foundry Integration
   */
  private registerFoundryIntegration() {
    try {
      // Check if Foundry/AI Foundry is installed
      const foundryExt = vscode.extensions.getExtension("ms-toolsai.vscode-ai");

      // Register command for Foundry
      const cmd = vscode.commands.registerCommand(
        "ai-learning-repo.foundryContextProvider",
        async (query: string) => {
          const enrichedContext =
            await this.contextInjector.enrichAIInteraction({
              question: query || "Foundry query",
              response: "",
              source: "foundry",
            });

          return this.formatContextForFoundry(enrichedContext);
        },
      );

      this.context.subscriptions.push(cmd);

      // Try to integrate with Foundry API if available
      if (foundryExt) {
        this.integrateWithFoundry(foundryExt);
      }

      console.log("✅ Microsoft Foundry integration registered");
    } catch (error) {
      console.error("Failed to register Foundry integration:", error);
    }
  }

  /**
   * Microsoft Agent Framework Integration
   * Registers tools that agents can autonomously invoke
   */
  private registerAgentFrameworkIntegration() {
    try {
      // Get all tool definitions from the Agent Framework adapter
      const tools = this.agentFrameworkAdapter.getAllTools();

      // Register each tool as a command that agents can invoke
      tools.forEach((tool) => {
        const cmd = vscode.commands.registerCommand(
          `ai-learning-repo.agentFramework.${tool.name}`,
          async (...args: any[]) => {
            try {
              // Extract parameters from arguments
              const params =
                Array.isArray(args) && args.length > 0 ? args[0] : {};
              const result = await tool.handler(params);
              return JSON.parse(result);
            } catch (error) {
              return {
                error: `Failed to execute tool ${tool.name}: ${error}`,
                status: "failed",
              };
            }
          },
        );

        this.context.subscriptions.push(cmd);
      });

      // Expose tools via the extension's public API for agents to discover
      // This allows agents to introspect available tools
      this.exposeToolsToAgents();

      console.log(
        `✅ Microsoft Agent Framework integration registered (${tools.length} tools)`,
      );
    } catch (error) {
      console.error("Failed to register Agent Framework integration:", error);
    }
  }

  /**
   * Expose tool definitions to agents via extension API
   */
  private exposeToolsToAgents() {
    try {
      // Store tool definitions in extension context for discovery
      const tools = this.agentFrameworkAdapter.getAllTools();

      // Create a tool registry accessible to agents
      const toolRegistry = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        schema: tool.inputSchema,
        commandId: `ai-learning-repo.agentFramework.${tool.name}`,
      }));

      // Store in extension global state for agents to discover
      this.context.globalState.update("agentFrameworkTools", toolRegistry);

      console.log("Agent Framework tools exposed for discovery");
    } catch (error) {
      console.error("Failed to expose tools to agents:", error);
    }
  }

  /**
   * Main chat request handler for VS Code Chat API
   */
  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const query = request.prompt;

      stream.progress("Searching learning repository...");

      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: query,
        response: "",
        source: "chat-participant",
      });

      if (enrichedContext.relevantLearnings.length === 0) {
        stream.markdown(
          "No relevant learnings found in your repository for this query.\n\n",
        );
        stream.markdown(
          "*Tip: Keep using AI assistants, and this repository will grow automatically!*\n",
        );
        return;
      }

      // Show header with confidence
      stream.markdown(
        `### 📚 Learning Repository Context (${enrichedContext.confidenceScore}% confidence)\n\n`,
      );

      // Show relevant learnings
      stream.markdown(
        `Found **${enrichedContext.relevantLearnings.length} relevant learning(s)**:\n\n`,
      );

      enrichedContext.relevantLearnings.slice(0, 5).forEach((learning, idx) => {
        stream.markdown(`**${idx + 1}. ${learning.question}**\n`);
        stream.markdown(`   - Language: ${learning.language}\n`);
        stream.markdown(`   - Outcome: ${learning.outcome}\n`);
        if (learning.tags && learning.tags.length > 0) {
          stream.markdown(`   - Tags: ${learning.tags.join(", ")}\n`);
        }
        stream.markdown(`   - Reliability: ${learning.reliability}%\n`);
        stream.markdown("\n");

        // Show solution preview
        const solutionPreview = learning.solution.substring(0, 300);
        stream.markdown("   Solution:\n");
        stream.markdown(`   \`\`\`\n   ${solutionPreview}...\n   \`\`\`\n\n`);
      });

      // Show similar questions
      if (enrichedContext.similarQuestions.length > 0) {
        stream.markdown("\n### 🔍 Similar Questions:\n\n");
        enrichedContext.similarQuestions
          .slice(0, 3)
          .forEach((learning, idx) => {
            stream.markdown(
              `${idx + 1}. ${learning.question} (${learning.language})\n`,
            );
          });
      }

      // Show context analysis
      stream.markdown("\n### 📊 Analysis:\n\n");
      stream.markdown("```\n" + enrichedContext.contextSummary + "\n```\n");

      stream.markdown(
        "\n💡 *Use these learnings to inform your current task. Context injected!*\n",
      );
    } catch (error) {
      stream.markdown(`❌ Error retrieving learnings: ${error}`);
      console.error("Error in chat participant:", error);
    }
  }

  /**
   * Format context for Continue extension
   */
  private formatContextForContinue(enrichedContext: any): string {
    const lines: string[] = [];

    lines.push("# Learning Repository Context\n");
    lines.push(`Confidence: ${enrichedContext.confidenceScore}%\n`);
    lines.push("\n## Relevant Learnings:\n");

    enrichedContext.relevantLearnings.slice(0, 3).forEach((learning: any) => {
      lines.push(`\n### ${learning.question}\n`);
      lines.push(`- Language: ${learning.language}\n`);
      lines.push(`- Reliability: ${learning.reliability}%\n`);
      lines.push(
        `\nSolution:\n\`\`\`\n${learning.solution.substring(0, 500)}\n\`\`\`\n`,
      );
    });

    return lines.join("");
  }

  /**
   * Format a single learning for Continue
   */
  private formatLearningForContinue(learning: any): string {
    return `# ${learning.question}\n\n**Language:** ${learning.language}\n**Reliability:** ${learning.reliability}%\n\n## Solution:\n\`\`\`\n${learning.solution}\n\`\`\`\n\n## Context:\n${learning.context}\n`;
  }

  /**
   * Format context for Codex
   */
  private formatContextForCodex(enrichedContext: any): string {
    const lines: string[] = [];

    lines.push("=== AI Learning Repository Context ===\n");
    lines.push(`Confidence: ${enrichedContext.confidenceScore}%\n\n`);

    enrichedContext.relevantLearnings
      .slice(0, 3)
      .forEach((learning: any, idx: number) => {
        lines.push(`${idx + 1}. ${learning.question}\n`);
        lines.push(`   Language: ${learning.language}\n`);
        lines.push(
          `   Solution: ${learning.solution.substring(0, 200)}...\n\n`,
        );
      });

    lines.push("\n[Copy this context into your Codex prompt]\n");

    return lines.join("");
  }

  /**
   * Format context for Microsoft AI Toolkit
   */
  private formatContextForAIToolkit(enrichedContext: any): any {
    return {
      confidence: enrichedContext.confidenceScore,
      learnings: enrichedContext.relevantLearnings
        .slice(0, 5)
        .map((learning: any) => ({
          question: learning.question,
          language: learning.language,
          solution: learning.solution,
          reliability: learning.reliability,
          tags: learning.tags,
        })),
      summary: enrichedContext.contextSummary,
    };
  }

  /**
   * Format context for Microsoft Foundry
   */
  private formatContextForFoundry(enrichedContext: any): any {
    return {
      contextType: "learning-repository",
      confidence: enrichedContext.confidenceScore,
      items: enrichedContext.relevantLearnings
        .slice(0, 5)
        .map((learning: any) => ({
          title: learning.question,
          content: learning.solution,
          metadata: {
            language: learning.language,
            reliability: learning.reliability,
            tags: learning.tags,
            outcome: learning.outcome,
          },
        })),
    };
  }

  /**
   * Integrate with AI Toolkit extension API
   */
  private async integrateWithAIToolkit(extension: vscode.Extension<any>) {
    try {
      await extension.activate();
      const api = extension.exports;

      if (api && api.registerContextProvider) {
        api.registerContextProvider({
          name: "learnings",
          displayName: "Learning Repository",
          getContext: async (query: string) => {
            return await vscode.commands.executeCommand(
              "ai-learning-repo.aiToolkitContextProvider",
              query,
            );
          },
        });

        console.log("✅ AI Toolkit API integration complete");
      }
    } catch (error) {
      console.log("AI Toolkit API integration skipped:", error);
    }
  }

  /**
   * Integrate with Foundry extension API
   */
  private async integrateWithFoundry(extension: vscode.Extension<any>) {
    try {
      await extension.activate();
      const api = extension.exports;

      if (api && api.registerContextSource) {
        api.registerContextSource({
          id: "ai-learning-repo",
          name: "Learning Repository",
          description: "Context from your AI learning repository",
          getContext: async (query: string) => {
            return await vscode.commands.executeCommand(
              "ai-learning-repo.foundryContextProvider",
              query,
            );
          },
        });

        console.log("✅ Foundry API integration complete");
      }
    } catch (error) {
      console.log("Foundry API integration skipped:", error);
    }
  }

  /**
   * Public method to get context for any AI tool
   */
  public async getContextForQuery(
    query: string,
    source: string = "unknown",
  ): Promise<any> {
    const enrichedContext = await this.contextInjector.enrichAIInteraction({
      question: query,
      response: "",
      source: source,
    });

    return enrichedContext;
  }

  /**
   * Get all available Agent Framework tools for discovery
   * Used by agents to introspect available tools
   */
  public getAgentFrameworkTools(): Array<{
    name: string;
    description: string;
    schema: any;
  }> {
    return this.agentFrameworkAdapter.getAllTools().map((tool) => ({
      name: tool.name,
      description: tool.description,
      schema: tool.inputSchema,
    }));
  }

  /**
   * Invoke an Agent Framework tool
   * Used by agents to execute tools by name and parameters
   */
  public async invokeAgentTool(
    toolName: string,
    parameters: Record<string, any>,
  ): Promise<any> {
    try {
      const tools = this.agentFrameworkAdapter.getAllTools();
      const tool = tools.find((t) => t.name === toolName);

      if (!tool) {
        return {
          error: `Tool not found: ${toolName}`,
          status: "failed",
          availableTools: tools.map((t) => t.name),
        };
      }

      const result = await tool.handler(parameters);
      return JSON.parse(result);
    } catch (error) {
      return {
        error: `Failed to invoke tool ${toolName}: ${error}`,
        status: "failed",
      };
    }
  }

  /**
   * Get all available Continue tools
   * Used for integration with Continue IDE
   */
  public getContinueTools(): any[] {
    return this.continueAdapter.getToolDefinitions();
  }

  /**
   * Invoke a Continue tool
   * Used for Continue IDE integration
   */
  public async invokeContinueTool(
    toolName: string,
    parameters: Record<string, any>,
  ): Promise<string> {
    try {
      const tools = this.continueAdapter.getToolDefinitions();
      const tool = tools.find((t) => t.name === toolName);

      if (!tool || !tool.handler) {
        return `Error: Tool not found or has no handler: ${toolName}`;
      }

      return await tool.handler(parameters);
    } catch (error) {
      return `Error invoking Continue tool ${toolName}: ${error}`;
    }
  }

  /**
   * Route a task to the optimal agent based on complexity and cost
   * Helps optimize token usage by routing work from cloud agents to local agents
   */
  public async routeTask(
    query: string,
    currentAgent: string = "Copilot",
    options?: {
      masterAgent?: string;
      allowDelegation?: boolean;
      maxHops?: number;
      delegationChain?: string[];
      preferredAgents?: string[];
      requireUserConfirm?: boolean;
    },
  ): Promise<any> {
    try {
      return await this.agentRouter.analyzeAndRoute(
        query,
        currentAgent,
        options,
      );
    } catch (error) {
      return {
        error: `Failed to route task: ${error}`,
        status: "failed",
      };
    }
  }

  /**
   * Get available agents for routing
   */
  public getAvailableAgentsForRouting(): Array<{
    name: string;
    type: string;
    costPerMillion: number;
    latency: string;
    strengths: string[];
  }> {
    return this.agentRouter.getAvailableAgents();
  }

  /**
   * Check if a learning is optimal for local agent handling
   */
  public checkLocalAgentOptimal(learning: any): boolean {
    return this.agentRouter.isLocalAgentOptimal(learning);
  }
}
