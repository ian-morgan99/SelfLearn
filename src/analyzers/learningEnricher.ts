import * as vscode from "vscode";
import { Learning, LearningManager } from "../managers/learningManager";

/**
 * Enriches captured learnings with additional metadata
 * Runs as background processing to improve learning quality
 *
 * Phase 2: Extract concepts, detect problem types, calculate difficulty, infer outcomes
 */
export class LearningEnricher {
  private enrichmentQueue: Learning[] = [];
  private processing: boolean = false;
  private learningManager: LearningManager;

  constructor(learningManager: LearningManager) {
    this.learningManager = learningManager;
  }

  /**
   * Queue a learning for enrichment
   */
  public queueForEnrichment(learning: Learning): void {
    if (!this.enrichmentQueue.find((l) => l.id === learning.id)) {
      this.enrichmentQueue.push(learning);
    }

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process enrichment queue in background
   */
  private async processQueue(): Promise<void> {
    if (this.enrichmentQueue.length === 0) {
      this.processing = false;
      return;
    }

    this.processing = true;

    const learning = this.enrichmentQueue.shift();
    if (!learning) {
      this.processing = false;
      return;
    }

    try {
      const enriched = await this.enrichLearning(learning);
      await this.learningManager.updateLearning(learning.id, enriched);
    } catch (error) {
      console.error(
        `[LearningEnricher] Error enriching learning ${learning.id}:`,
        error,
      );
    }

    // Continue processing next item
    setTimeout(() => this.processQueue(), 100);
  }

  /**
   * Enrich a single learning with metadata
   */
  private async enrichLearning(learning: Learning): Promise<Learning> {
    // Extract concepts from solution code
    if (!learning.concepts || learning.concepts.length === 0) {
      learning.concepts = this.extractConcepts(learning.solution);
    }

    // Detect problem types from question
    if (!learning.problemType || learning.problemType.length === 0) {
      learning.problemType = this.detectProblemTypes(
        learning.question,
        learning.solution,
      );
    }

    // Calculate difficulty if not set
    if (!learning.difficulty || learning.difficulty === "intermediate") {
      learning.difficulty = this.calculateDifficulty(learning);
    }

    // Infer outcome if unknown
    if (learning.outcome === "unknown") {
      learning.outcome = this.inferOutcome(learning);
    }

    // Auto-generate keywords
    if (!learning.keywords || learning.keywords.length === 0) {
      learning.keywords = this.generateKeywords(learning);
    }

    // Calculate reliability score
    if (!learning.reliability || learning.reliability === 50) {
      learning.reliability = this.calculateReliability(learning);
    }

    return learning;
  }

  /**
   * Extract technical concepts from solution code
   */
  private extractConcepts(solution: string): string[] {
    const concepts: Set<string> = new Set();

    // JavaScript/TypeScript concepts
    if (solution.includes("async ") || solution.includes("await ")) {
      concepts.add("async-await");
    }
    if (solution.includes("Promise")) {
      concepts.add("promises");
    }
    if (solution.includes("class ")) {
      concepts.add("classes");
    }
    if (solution.includes("interface ")) {
      concepts.add("interfaces");
    }
    if (solution.includes("=>")) {
      concepts.add("arrow-functions");
    }
    if (
      solution.includes(".map(") ||
      solution.includes(".filter(") ||
      solution.includes(".reduce(")
    ) {
      concepts.add("array-methods");
    }
    if (solution.includes("useState") || solution.includes("useEffect")) {
      concepts.add("react-hooks");
    }
    if (solution.includes("try") && solution.includes("catch")) {
      concepts.add("error-handling");
    }

    // Python concepts
    if (solution.includes("def ")) {
      concepts.add("functions");
    }
    if (solution.includes("class ") && solution.includes("__init__")) {
      concepts.add("classes");
    }
    if (solution.includes("with ")) {
      concepts.add("context-managers");
    }
    if (solution.includes("lambda ")) {
      concepts.add("lambda-functions");
    }

    // General concepts
    if (
      solution.includes("http") ||
      solution.includes("fetch") ||
      solution.includes("axios")
    ) {
      concepts.add("http-requests");
    }
    if (solution.includes("json")) {
      concepts.add("json");
    }
    if (solution.includes("regex") || solution.includes("RegExp")) {
      concepts.add("regex");
    }
    if (solution.includes("setTimeout") || solution.includes("setInterval")) {
      concepts.add("timers");
    }

    return Array.from(concepts);
  }

  /**
   * Detect problem types from question and solution
   */
  private detectProblemTypes(question: string, solution: string): string[] {
    const problemTypes: Set<string> = new Set();
    const lowerQuestion = question.toLowerCase();
    const lowerSolution = solution.toLowerCase();

    // Error/bug fixes
    if (
      lowerQuestion.includes("error") ||
      lowerQuestion.includes("bug") ||
      lowerQuestion.includes("fix") ||
      lowerQuestion.includes("issue")
    ) {
      problemTypes.add("bug-fix");
    }

    // Performance
    if (
      lowerQuestion.includes("slow") ||
      lowerQuestion.includes("performance") ||
      lowerQuestion.includes("optimize") ||
      lowerQuestion.includes("faster")
    ) {
      problemTypes.add("performance");
    }

    // State management
    if (
      lowerSolution.includes("state") ||
      lowerSolution.includes("redux") ||
      lowerSolution.includes("context")
    ) {
      problemTypes.add("state-management");
    }

    // API integration
    if (
      lowerQuestion.includes("api") ||
      lowerQuestion.includes("endpoint") ||
      lowerSolution.includes("fetch") ||
      lowerSolution.includes("axios")
    ) {
      problemTypes.add("api-integration");
    }

    // Data transformation
    if (
      lowerQuestion.includes("parse") ||
      lowerQuestion.includes("transform") ||
      lowerQuestion.includes("convert")
    ) {
      problemTypes.add("data-transformation");
    }

    // UI/UX
    if (
      lowerQuestion.includes("ui") ||
      lowerQuestion.includes("style") ||
      lowerQuestion.includes("layout") ||
      lowerQuestion.includes("component")
    ) {
      problemTypes.add("ui-ux");
    }

    // Testing
    if (
      lowerQuestion.includes("test") ||
      lowerSolution.includes("expect") ||
      lowerSolution.includes("assert")
    ) {
      problemTypes.add("testing");
    }

    // Authentication/Security
    if (
      lowerQuestion.includes("auth") ||
      lowerQuestion.includes("login") ||
      lowerQuestion.includes("security") ||
      lowerQuestion.includes("token")
    ) {
      problemTypes.add("authentication");
    }

    // If no specific type detected, mark as general
    if (problemTypes.size === 0) {
      problemTypes.add("general");
    }

    return Array.from(problemTypes);
  }

  /**
   * Calculate difficulty level based on solution complexity
   */
  private calculateDifficulty(
    learning: Learning,
  ): "beginner" | "intermediate" | "advanced" | "expert" {
    let score = 0;

    // Solution length
    const solutionLength = learning.solution.length;
    if (solutionLength > 1000) score += 3;
    else if (solutionLength > 500) score += 2;
    else if (solutionLength > 200) score += 1;

    // Concept count
    const conceptCount = learning.concepts?.length || 0;
    if (conceptCount > 5) score += 3;
    else if (conceptCount > 3) score += 2;
    else if (conceptCount > 1) score += 1;

    // Problem type complexity
    const problemTypes = learning.problemType || [];
    if (
      problemTypes.includes("performance") ||
      problemTypes.includes("security")
    ) {
      score += 2;
    }

    // Code complexity indicators
    if (
      learning.solution.includes("async") &&
      learning.solution.includes("Promise")
    ) {
      score += 1;
    }
    if (learning.solution.match(/\{[^}]*\{[^}]*\{/)) {
      // Multiple levels of nesting
      score += 2;
    }

    // Map score to difficulty
    if (score >= 7) return "expert";
    if (score >= 5) return "advanced";
    if (score >= 3) return "intermediate";
    return "beginner";
  }

  /**
   * Infer outcome from context and notes
   */
  private inferOutcome(
    learning: Learning,
  ): "success" | "partial" | "failed" | "unknown" {
    const context = learning.context.toLowerCase();
    const notes = learning.notes.toLowerCase();
    const solution = learning.solution.toLowerCase();

    // Success indicators
    if (
      context.includes("worked") ||
      context.includes("success") ||
      context.includes("solved") ||
      notes.includes("fixed") ||
      notes.includes("resolved")
    ) {
      return "success";
    }

    // Failure indicators
    if (
      context.includes("failed") ||
      context.includes("error") ||
      context.includes("didn't work") ||
      notes.includes("still broken")
    ) {
      return "failed";
    }

    // Partial success
    if (
      context.includes("workaround") ||
      context.includes("temporary") ||
      notes.includes("needs improvement")
    ) {
      return "partial";
    }

    // If solution is substantial, assume success
    if (solution.length > 100) {
      return "success";
    }

    return "unknown";
  }

  /**
   * Generate searchable keywords from learning
   */
  private generateKeywords(learning: Learning): string[] {
    const keywords: Set<string> = new Set();

    // Extract from question
    const questionWords = learning.question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3);

    questionWords.forEach((word) => keywords.add(word));

    // Add concepts
    learning.concepts?.forEach((concept) => {
      keywords.add(concept);
    });

    // Add problem types
    learning.problemType?.forEach((type) => {
      keywords.add(type);
    });

    // Add language and frameworks
    keywords.add(learning.language.toLowerCase());
    learning.frameworks?.forEach((fw) => {
      keywords.add(fw.toLowerCase());
    });

    return Array.from(keywords).slice(0, 20); // Limit to 20 keywords
  }

  /**
   * Calculate reliability score based on available data
   */
  private calculateReliability(learning: Learning): number {
    let score = 50; // Base score

    // Has detailed solution
    if (learning.solution.length > 200) score += 10;
    if (learning.solution.length > 500) score += 10;

    // Has context
    if (learning.context && learning.context.length > 50) score += 10;

    // Has notes
    if (learning.notes && learning.notes.length > 20) score += 5;

    // Success outcome
    if (learning.outcome === "success") score += 15;

    // Has concepts and problem types
    if (learning.concepts && learning.concepts.length > 0) score += 5;
    if (learning.problemType && learning.problemType.length > 0) score += 5;

    return Math.min(100, score);
  }

  /**
   * Batch enrich all learnings (run in background)
   */
  public async enrichAllLearnings(
    progressCallback?: (current: number, total: number) => void,
  ): Promise<void> {
    const learnings = await this.learningManager.getAllLearnings();

    for (let i = 0; i < learnings.length; i++) {
      const learning = learnings[i];

      try {
        const enriched = await this.enrichLearning(learning);
        await this.learningManager.updateLearning(learning.id, enriched);

        if (progressCallback) {
          progressCallback(i + 1, learnings.length);
        }
      } catch (error) {
        console.error(
          `[LearningEnricher] Error enriching learning ${learning.id}:`,
          error,
        );
      }

      // Yield to prevent blocking
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
}
