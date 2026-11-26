/**
 * Continue IDE Tools Adapter
 * Exposes learning context as slash commands and tools for Continue IDE
 *
 * Provides integration points for:
 * - Slash commands (@learning /query, /blueprint)
 * - Context providers
 * - Tool definitions for autonomous invocation
 */

import { LearningManager, Learning } from "../managers/learningManager";
import { ContextInjector } from "./contextInjector";

/**
 * Tool definition compatible with Continue's tool system
 */
export interface ContinueTool {
  name: string;
  description: string;
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required: string[];
    };
  };
  handler?: (params: Record<string, any>) => Promise<string>;
}

/**
 * Continue Context Item
 * Represents a piece of context that Continue can inject into prompts
 */
export interface ContinueContextItem {
  name: string;
  description: string;
  content: string;
  metadata?: Record<string, any>;
}

/**
 * Adapter to expose learning context as Continue tools
 */
export class ContinueToolsAdapter {
  private learningManager: LearningManager;
  private contextInjector: ContextInjector;

  constructor(
    learningManager: LearningManager,
    contextInjector: ContextInjector,
  ) {
    this.learningManager = learningManager;
    this.contextInjector = contextInjector;
  }

  /**
   * Creates tool definitions for Continue
   * These can be used as slash commands or autonomous tools
   */
  public getToolDefinitions(): ContinueTool[] {
    return [
      {
        name: "learning-query",
        description:
          "Query the learning repository for relevant solutions and patterns",
        type: "function",
        function: {
          name: "queryLearnings",
          description:
            "Search learning repository for relevant questions, solutions, and best practices",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description:
                  "Search query (e.g., 'authentication', 'error handling', 'async patterns')",
              },
              language: {
                type: "string",
                description: "Filter by programming language (optional)",
              },
              minReliability: {
                type: "number",
                description: "Minimum reliability score 0-100 (default: 50)",
              },
              limit: {
                type: "number",
                description: "Maximum results to return (default: 5)",
              },
            },
            required: ["query"],
          },
        },
        handler: this.handleLearningQuery.bind(this),
      },
      {
        name: "project-analysis",
        description:
          "Analyze current project to identify languages, frameworks, and relevant learnings",
        type: "function",
        function: {
          name: "analyzeProject",
          description:
            "Get an analysis of the current project context and recommended learnings",
          parameters: {
            type: "object",
            properties: {
              includeRecommendations: {
                type: "boolean",
                description:
                  "Whether to include recommended learnings (default: true)",
              },
            },
            required: [],
          },
        },
        handler: this.handleProjectAnalysis.bind(this),
      },
      {
        name: "solution-blueprint",
        description:
          "Get a complete solution blueprint for a specific problem type",
        type: "function",
        function: {
          name: "getSolutionBlueprint",
          description:
            "Retrieve a complete solution blueprint including code, patterns, and lessons learned",
          parameters: {
            type: "object",
            properties: {
              problemType: {
                type: "string",
                description:
                  "The problem to solve (e.g., 'jwt-authentication', 'rate-limiting')",
              },
              language: {
                type: "string",
                description: "Programming language preference (optional)",
              },
            },
            required: ["problemType"],
          },
        },
        handler: this.handleSolutionBlueprint.bind(this),
      },
      {
        name: "similar-questions",
        description: "Find similar questions that have been asked before",
        type: "function",
        function: {
          name: "findSimilarQuestions",
          description:
            "Search for similar questions in the learning repository",
          parameters: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "Your question or problem statement",
              },
              limit: {
                type: "number",
                description: "Maximum results to return (default: 3)",
              },
            },
            required: ["question"],
          },
        },
        handler: this.handleSimilarQuestions.bind(this),
      },
    ];
  }

  /**
   * Get context items for Continue's context provider
   */
  public async getContextItems(
    query: string,
    limit: number = 5,
  ): Promise<ContinueContextItem[]> {
    try {
      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: query,
        response: "",
        source: "continue",
      });

      return enrichedContext.relevantLearnings
        .slice(0, limit)
        .map((learning) => ({
          name: learning.question,
          description: `${learning.language} - Reliability: ${learning.reliability}%`,
          content: this.formatLearningForContinue(learning),
          metadata: {
            language: learning.language,
            frameworks: learning.frameworks,
            reliability: learning.reliability,
            tags: learning.tags,
          },
        }));
    } catch (error) {
      console.error("Error getting context items:", error);
      return [];
    }
  }

  /**
   * Handler: Query learnings
   */
  private async handleLearningQuery(
    params: Record<string, any>,
  ): Promise<string> {
    try {
      const { query, language, minReliability = 50, limit = 5 } = params;

      if (!query) {
        return "Error: 'query' parameter is required";
      }

      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: query,
        response: "",
        source: "continue",
      });

      const filtered = language
        ? enrichedContext.relevantLearnings
            .filter((l) => l.language.toLowerCase() === language.toLowerCase())
            .filter((l) => l.reliability >= minReliability)
        : enrichedContext.relevantLearnings.filter(
            (l) => l.reliability >= minReliability,
          );

      const results = filtered.slice(0, limit);

      if (results.length === 0) {
        return `No learnings found matching query: "${query}"${language ? ` in ${language}` : ""}`;
      }

      return this.formatResultsForContinue(
        results,
        `Learning Query Results for: "${query}"`,
      );
    } catch (error) {
      return `Error querying learnings: ${error}`;
    }
  }

  /**
   * Handler: Analyze project
   */
  private async handleProjectAnalysis(
    params: Record<string, any>,
  ): Promise<string> {
    try {
      const { includeRecommendations = true } = params;

      const allLearnings = await this.learningManager.getAllLearnings();

      if (allLearnings.length === 0) {
        return "No learnings in repository yet. Start by capturing AI interactions!";
      }

      // Analyze patterns
      const languages = new Map<string, number>();
      const frameworks = new Map<string, number>();

      for (const learning of allLearnings) {
        languages.set(
          learning.language,
          (languages.get(learning.language) || 0) + 1,
        );
        for (const framework of learning.frameworks || []) {
          frameworks.set(framework, (frameworks.get(framework) || 0) + 1);
        }
      }

      const topLanguages = Array.from(languages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `${name} (${count})`)
        .join(", ");

      const topFrameworks = Array.from(frameworks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => `${name} (${count})`)
        .join(", ");

      const avgReliability = Math.round(
        allLearnings.reduce((sum, l) => sum + l.reliability, 0) /
          allLearnings.length,
      );

      let analysis = `## Project Learning Analysis\n\n`;
      analysis += `**Repository Stats:**\n`;
      analysis += `- Total Learnings: ${allLearnings.length}\n`;
      analysis += `- Average Reliability: ${avgReliability}%\n`;
      analysis += `- Top Languages: ${topLanguages}\n`;
      analysis += `- Top Frameworks: ${topFrameworks}\n`;

      if (includeRecommendations && allLearnings.length > 0) {
        const recommendations = allLearnings
          .filter((l) => l.reliability >= 80)
          .sort((a, b) => b.reliability - a.reliability)
          .slice(0, 3);

        if (recommendations.length > 0) {
          analysis += `\n**Recommended High-Confidence Learnings:**\n`;
          recommendations.forEach((rec, idx) => {
            analysis += `${idx + 1}. ${rec.question} (${rec.language}, ${rec.reliability}%)\n`;
          });
        }
      }

      return analysis;
    } catch (error) {
      return `Error analyzing project: ${error}`;
    }
  }

  /**
   * Handler: Solution blueprint
   */
  private async handleSolutionBlueprint(
    params: Record<string, any>,
  ): Promise<string> {
    try {
      const { problemType, language } = params;

      if (!problemType) {
        return "Error: 'problemType' parameter is required";
      }

      const allLearnings = await this.learningManager.getAllLearnings();

      const matching = allLearnings.filter((learning) => {
        const matchesProblem =
          learning.question.toLowerCase().includes(problemType.toLowerCase()) ||
          learning.tags?.some((tag) =>
            tag.toLowerCase().includes(problemType.toLowerCase()),
          );

        const matchesLanguage =
          !language ||
          learning.language.toLowerCase() === language.toLowerCase();

        return matchesProblem && matchesLanguage;
      });

      if (matching.length === 0) {
        return `No solution blueprints found for: "${problemType}"`;
      }

      const blueprint = matching
        .sort((a, b) => b.reliability - a.reliability)
        .slice(0, 1)[0];

      return this.formatBlueprintForContinue(blueprint, matching.slice(1, 3));
    } catch (error) {
      return `Error retrieving solution blueprint: ${error}`;
    }
  }

  /**
   * Handler: Similar questions
   */
  private async handleSimilarQuestions(
    params: Record<string, any>,
  ): Promise<string> {
    try {
      const { question, limit = 3 } = params;

      if (!question) {
        return "Error: 'question' parameter is required";
      }

      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question,
        response: "",
        source: "continue",
      });

      const similar = enrichedContext.similarQuestions.slice(0, limit);

      if (similar.length === 0) {
        return "No similar questions found in learning repository";
      }

      return this.formatResultsForContinue(similar, "Similar Questions Found");
    } catch (error) {
      return `Error finding similar questions: ${error}`;
    }
  }

  /**
   * Format learning for Continue display
   */
  private formatLearningForContinue(learning: Learning): string {
    return `
**${learning.question}**

Language: \`${learning.language}\`
${learning.frameworks && learning.frameworks.length > 0 ? `Frameworks: \`${learning.frameworks.join(", ")}\`` : ""}
Reliability: ${learning.reliability}%

**Solution:**
\`\`\`${learning.language}
${learning.solution}
\`\`\`

${learning.concepts && learning.concepts.length > 0 ? `**Key Concepts:**\n${learning.concepts.map((c: string) => `- ${c}`).join("\n")}\n` : ""}

${learning.tags && learning.tags.length > 0 ? `**Tags:** ${learning.tags.join(", ")}\n` : ""}
`;
  }

  /**
   * Format results for Continue
   */
  private formatResultsForContinue(
    learnings: Learning[],
    title: string,
  ): string {
    let output = `## ${title}\n\n`;
    learnings.forEach((learning, idx) => {
      output += `### ${idx + 1}. ${learning.question}\n`;
      output += `**Language:** \`${learning.language}\` | `;
      output += `**Reliability:** ${learning.reliability}%\n\n`;
      output += `${learning.solution.substring(0, 300)}...\n\n`;
    });
    return output;
  }

  /**
   * Format blueprint for Continue
   */
  private formatBlueprintForContinue(
    blueprint: Learning,
    alternatives: Learning[],
  ): string {
    let output = `## Solution Blueprint: ${blueprint.question}\n\n`;
    output += `**Language:** \`${blueprint.language}\`\n`;
    if (blueprint.frameworks && blueprint.frameworks.length > 0) {
      output += `**Frameworks:** \`${blueprint.frameworks.join(", ")}\`\n`;
    }
    output += `**Reliability:** ${blueprint.reliability}%\n`;
    output += `**Outcome:** ${blueprint.outcome}\n\n`;

    output += `### Solution\n\n`;
    output += `\`\`\`${blueprint.language}\n${blueprint.solution}\n\`\`\`\n\n`;

    if (blueprint.concepts && blueprint.concepts.length > 0) {
      output += `### Key Concepts\n\n`;
      blueprint.concepts.forEach((concept: string) => {
        output += `- ${concept}\n`;
      });
      output += "\n";
    }

    if (alternatives.length > 0) {
      output += `### Alternative Approaches\n\n`;
      alternatives.forEach((alt) => {
        output += `- **${alt.question}** (${alt.language}, ${alt.reliability}%)\n`;
      });
    }

    return output;
  }
}
