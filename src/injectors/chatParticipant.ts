import * as vscode from "vscode";
import { LearningManager } from "../managers/learningManager";
import { ContextInjector } from "./contextInjector";

export class LearningChatParticipant {
  private learningManager: LearningManager;
  private contextInjector: ContextInjector;
  private participant: vscode.ChatParticipant | undefined;

  constructor(
    learningManager: LearningManager,
    contextInjector: ContextInjector,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;
    this.contextInjector = contextInjector;
    this.initialize(context);
  }

  private initialize(context: vscode.ExtensionContext) {
    try {
      // Create a chat participant that provides context from learnings
      this.participant = vscode.chat.createChatParticipant(
        "ai-learning-repo.learnings",
        this.handleChatRequest.bind(this),
      );

      this.participant.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        "media",
        "learning.svg",
      );

      context.subscriptions.push(this.participant);

      console.log(
        "Chat participant registered: @learnings (use '@learnings' in chat to inject context)",
      );
    } catch (error) {
      console.error("Failed to register chat participant:", error);
    }
  }

  private async handleChatRequest(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ): Promise<void> {
    try {
      const query = request.prompt;

      stream.progress("Searching learning repository...");

      // Enrich the interaction with context
      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: query,
        response: "",
        source: "chat-participant",
      });

      if (enrichedContext.relevantLearnings.length === 0) {
        stream.markdown(
          "No relevant learnings found in your repository for this query.\n\n",
        );
        return;
      }

      // Show confidence score
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

      // Show context summary
      stream.markdown("\n### 📊 Analysis:\n\n");
      stream.markdown("```\n" + enrichedContext.contextSummary + "\n```\n");

      stream.markdown(
        "\n💡 *Use these learnings to inform your current task. The context has been injected into your chat.*\n",
      );
    } catch (error) {
      stream.markdown(`Error retrieving learnings: ${error}`);
      console.error("Error in chat participant:", error);
    }
  }
}
