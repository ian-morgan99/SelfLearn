// Quick test to manually capture the learnings document
import * as vscode from "vscode";
import { LearningManager } from "./managers/learningManager";

export async function captureLearningSummary(
  learningManager: LearningManager,
  filePath: string,
): Promise<boolean> {
  try {
    const fileUri = vscode.Uri.file(filePath);
    const content = await vscode.workspace.fs.readFile(fileUri);
    const text = new TextDecoder().decode(content);

    // Extract title
    const titleMatch = text.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : "Session Learnings";

    // Capture as learning
    await learningManager.addLearning(
      `Session Documentation: ${title}`,
      text,
      "markdown",
      [
        "session-learnings",
        "documentation",
        "lazy-loading",
        "performance",
        "vscode-extension",
      ],
      "AI-generated session learnings and insights",
      "success",
      "Captured for review before deletion",
    );

    console.log(`✅ Captured learning: ${title}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to capture learning: ${error}`);
    return false;
  }
}
