/**
 * Agent Framework Tool Adapter
 * Exposes learning context as tools for Microsoft Agent Framework agents
 *
 * This allows agents to autonomously invoke the learning context provider
 * to enrich their reasoning with relevant project learnings.
 */

import { LearningManager, Learning } from "../managers/learningManager";
import { ContextInjector, AIInteractionContext } from "./contextInjector";

/**
 * Tool definition for Agent Framework
 * Defines the schema and behavior of the learning context tool
 */
export interface AgentFrameworkTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required: string[];
  };
  handler: (input: Record<string, any>) => Promise<string>;
}

/**
 * Adapter to expose learning context as Agent Framework tools
 */
export class AgentFrameworkToolAdapter {
  private learningManager: LearningManager;
  private contextInjector: ContextInjector;
  private agentRouter: any; // AgentRouter - kept as any to avoid circular dependency

  constructor(
    learningManager: LearningManager,
    contextInjector: ContextInjector,
    agentRouter?: any,
  ) {
    this.learningManager = learningManager;
    this.contextInjector = contextInjector;
    this.agentRouter = agentRouter;
  }

  /**
   * Creates a tool definition for querying learning context
   * Can be used with Agent Framework's tool registration mechanism
   */
  public createLearningContextTool(): AgentFrameworkTool {
    return {
      name: "query_learning_context",
      description:
        "Query the AI Learning Repository to retrieve relevant project learnings, similar solutions, and best practices. Use this to augment your reasoning with patterns from past AI interactions and project experience.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The question or topic to search for in the learning repository (e.g., 'how to implement authentication in TypeScript', 'React hooks best practices')",
          },
          includeMetadata: {
            type: "boolean",
            description:
              "Whether to include detailed metadata (language, framework, reliability scores)",
            default: true,
          },
          maxResults: {
            type: "number",
            description: "Maximum number of learning results to return",
            default: 5,
          },
          minReliability: {
            type: "number",
            description: "Minimum reliability score (0-100) for results",
            default: 50,
          },
        },
        required: ["query"],
      },
      handler: this.handleLearningQuery.bind(this),
    };
  }

  /**
   * Creates a tool definition for analyzing project context
   * Detects languages, frameworks, and suggests relevant learnings
   */
  public createProjectAnalyzerTool(): AgentFrameworkTool {
    return {
      name: "analyze_project_context",
      description:
        "Analyze the current project context to identify languages, frameworks, and patterns. Returns relevant learnings that match the detected project characteristics.",
      inputSchema: {
        type: "object",
        properties: {
          analysisDepth: {
            type: "string",
            enum: ["shallow", "medium", "deep"],
            description: "How thoroughly to analyze the project",
            default: "medium",
          },
        },
        required: [],
      },
      handler: this.handleProjectAnalysis.bind(this),
    };
  }

  /**
   * Creates a tool definition for retrieving solution blueprints
   * Returns pre-built patterns for common scenarios
   */
  public createSolutionToolTool(): AgentFrameworkTool {
    return {
      name: "get_solution_blueprint",
      description:
        "Retrieve a complete solution blueprint or pattern from the learning repository for a specific problem type. Includes code samples, best practices, and lessons learned.",
      inputSchema: {
        type: "object",
        properties: {
          problemType: {
            type: "string",
            description:
              "The type of problem (e.g., 'authentication', 'error-handling', 'performance-optimization')",
          },
          language: {
            type: "string",
            description:
              "Programming language (TypeScript, Python, JavaScript, etc.)",
          },
          context: {
            type: "string",
            description:
              "Additional context about the specific use case or constraints",
          },
        },
        required: ["problemType"],
      },
      handler: this.handleSolutionBlueprint.bind(this),
    };
  }

  /**
   * Handler for learning context queries
   */
  private async handleLearningQuery(
    input: Record<string, any>,
  ): Promise<string> {
    try {
      const {
        query,
        includeMetadata = true,
        maxResults = 5,
        minReliability = 50,
      } = input;

      if (!query) {
        return JSON.stringify({
          error: "Query parameter is required",
          status: "failed",
        });
      }

      // Enrich the interaction with context
      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: query,
        response: "",
        source: "agent-framework",
      });

      // Filter by reliability
      const filteredLearnings = enrichedContext.relevantLearnings.filter(
        (learning) => learning.reliability >= minReliability,
      );

      // Limit results
      const results = filteredLearnings.slice(0, maxResults);

      // Format response
      const response = {
        status: "success",
        query,
        foundCount: results.length,
        confidenceScore: enrichedContext.confidenceScore,
        learnings: results.map((learning) => ({
          question: learning.question,
          language: learning.language,
          metadata: includeMetadata
            ? {
                frameworks: learning.frameworks || [],
                reliability: learning.reliability,
                tags: learning.tags || [],
                outcome: learning.outcome,
                timestamp: learning.timestamp,
              }
            : undefined,
          solutionSummary: learning.solution.substring(0, 500),
          fullSolution: learning.solution,
          concepts: learning.concepts || [],
        })),
        enrichmentSuggestions: enrichedContext.enrichmentSuggestions,
      };

      return JSON.stringify(response, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to query learning context: ${error}`,
        status: "failed",
      });
    }
  }

  /**
   * Handler for project analysis
   */
  private async handleProjectAnalysis(
    input: Record<string, any>,
  ): Promise<string> {
    try {
      const { analysisDepth = "medium" } = input;

      // Get all learnings and analyze patterns
      const allLearnings = await this.learningManager.getAllLearnings();

      if (allLearnings.length === 0) {
        return JSON.stringify({
          status: "success",
          message: "No learnings found in repository",
          projectProfile: {
            languages: [],
            frameworks: [],
            recommendedLearnings: [],
          },
        });
      }

      // Analyze patterns
      const languages = new Map<string, number>();
      const frameworks = new Map<string, number>();
      const tags = new Map<string, number>();

      for (const learning of allLearnings) {
        languages.set(
          learning.language,
          (languages.get(learning.language) || 0) + 1,
        );
        for (const framework of learning.frameworks || []) {
          frameworks.set(framework, (frameworks.get(framework) || 0) + 1);
        }
        for (const tag of learning.tags || []) {
          tags.set(tag, (tags.get(tag) || 0) + 1);
        }
      }

      // Sort by frequency
      const topLanguages = Array.from(languages.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const topFrameworks = Array.from(frameworks.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, count }));

      const topTags = Array.from(tags.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Get high-reliability learnings for recommendations
      const recommendedLearnings = allLearnings
        .filter((l) => l.reliability >= 80)
        .sort((a, b) => b.reliability - a.reliability)
        .slice(0, 3)
        .map((l) => ({
          question: l.question,
          language: l.language,
          reliability: l.reliability,
        }));

      return JSON.stringify(
        {
          status: "success",
          analysisDepth,
          projectProfile: {
            totalLearnings: allLearnings.length,
            languages: topLanguages,
            frameworks: topFrameworks,
            topicAreas: topTags,
            recommendedLearnings,
          },
          insights:
            analysisDepth === "deep"
              ? this.generateDeepInsights(allLearnings)
              : undefined,
        },
        null,
        2,
      );
    } catch (error) {
      return JSON.stringify({
        error: `Failed to analyze project context: ${error}`,
        status: "failed",
      });
    }
  }

  /**
   * Handler for solution blueprints
   */
  private async handleSolutionBlueprint(
    input: Record<string, any>,
  ): Promise<string> {
    try {
      const { problemType, language, context } = input;

      if (!problemType) {
        return JSON.stringify({
          error: "problemType parameter is required",
          status: "failed",
        });
      }

      // Search for matching solutions
      const allLearnings = await this.learningManager.getAllLearnings();

      // Filter by problem type and language if provided
      const matchingLearnings = allLearnings.filter((learning) => {
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

      if (matchingLearnings.length === 0) {
        return JSON.stringify({
          status: "success",
          message: `No solution blueprints found for problem type: ${problemType}`,
          suggestions: `Try searching for different keywords or specify a programming language`,
        });
      }

      // Return best match as blueprint
      const blueprint = matchingLearnings
        .sort((a, b) => b.reliability - a.reliability)
        .slice(0, 1)[0];

      return JSON.stringify(
        {
          status: "success",
          problemType,
          blueprint: {
            title: blueprint.question,
            language: blueprint.language,
            frameworks: blueprint.frameworks,
            reliability: blueprint.reliability,
            outcome: blueprint.outcome,
            solution: blueprint.solution,
            concepts: blueprint.concepts || [],
            patterns: blueprint.tags || [],
            contextRelevance:
              context &&
              blueprint.question.toLowerCase().includes(context.toLowerCase())
                ? "high"
                : "medium",
          },
          alternativeApproaches: matchingLearnings.slice(1, 3).map((l) => ({
            title: l.question,
            language: l.language,
            reliability: l.reliability,
          })),
        },
        null,
        2,
      );
    } catch (error) {
      return JSON.stringify({
        error: `Failed to retrieve solution blueprint: ${error}`,
        status: "failed",
      });
    }
  }

  /**
   * Generate deep insights about the project
   */
  private generateDeepInsights(learnings: Learning[]): object {
    const highReliability = learnings.filter((l) => l.reliability >= 80).length;
    const avgReliability =
      learnings.reduce((sum, l) => sum + l.reliability, 0) / learnings.length;
    const outcomeDistribution = new Map<string, number>();

    for (const learning of learnings) {
      outcomeDistribution.set(
        learning.outcome,
        (outcomeDistribution.get(learning.outcome) || 0) + 1,
      );
    }

    return {
      qualityMetrics: {
        totalLearnings: learnings.length,
        highReliabilityCount: highReliability,
        averageReliability: Math.round(avgReliability),
        successfulOutcomesCount: outcomeDistribution.get("success") || 0,
      },
      outcomeDistribution: Object.fromEntries(outcomeDistribution),
      recommendedFocus:
        highReliability > learnings.length * 0.5
          ? "Consolidate knowledge and refine implementations"
          : "Focus on building reliable, well-documented solutions",
    };
  }

  /**
   * Creates a tool definition for routing tasks to optimal agents
   * Helps cloud agents delegate work to local agents for token savings
   */
  public createAgentRoutingTool(): AgentFrameworkTool {
    return {
      name: "route_to_best_agent",
      description:
        "Analyze a task and route it to the most cost-effective and capable agent. Use this to optimize token usage by delegating work from Copilot to local agents (Continue, Codex) when appropriate. Returns routing recommendation with cost analysis and handoff instructions.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The task or question to route (e.g., 'Refactor this function', 'add unit tests')",
          },
          currentAgent: {
            type: "string",
            description:
              "The agent currently processing the request (default: 'Copilot')",
            default: "Copilot",
          },
          masterAgent: {
            type: "string",
            description:
              "The only agent allowed to delegate (default: 'Copilot'). Prevents ping-pong between agents.",
            default: "Copilot",
          },
          allowDelegation: {
            type: "boolean",
            description: "Whether delegation is allowed for this request",
            default: true,
          },
          maxHops: {
            type: "number",
            description: "Maximum delegation hops allowed (default: 1)",
            default: 1,
          },
          delegationChain: {
            type: "array",
            description:
              "List of agents that already handled this request (prevents ping-pong)",
            items: { type: "string" },
            default: [],
          },
          preferredAgents: {
            type: "array",
            description:
              "Preferred agents to consider first (e.g., ['Continue', 'Codex'])",
            items: { type: "string" },
            default: [],
          },
          requireUserConfirm: {
            type: "boolean",
            description:
              "Whether a human confirmation is required before delegation",
            default: false,
          },
        },
        required: ["query"],
      },
      handler: this.handleAgentRouting.bind(this),
    };
  }

  /**
   * Creates a tool definition for delegated execution
   * Enforces master-agent delegation policy to avoid ping-pong
   */
  public createAgentDelegationTool(): AgentFrameworkTool {
    return {
      name: "delegate_task_to_agent",
      description:
        "Create a delegation plan that routes a task from the master agent to an optimal agent. Enforces a single master agent and hop limits to avoid ping-pong. Returns a delegation decision and handoff instructions.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "The task or question to delegate (e.g., 'Refactor this function', 'add unit tests')",
          },
          currentAgent: {
            type: "string",
            description:
              "The agent currently processing the request (default: 'Copilot')",
            default: "Copilot",
          },
          masterAgent: {
            type: "string",
            description:
              "The only agent allowed to delegate (default: 'Copilot')",
            default: "Copilot",
          },
          allowDelegation: {
            type: "boolean",
            description: "Whether delegation is allowed for this request",
            default: true,
          },
          maxHops: {
            type: "number",
            description: "Maximum delegation hops allowed (default: 1)",
            default: 1,
          },
          delegationChain: {
            type: "array",
            description:
              "List of agents that already handled this request (prevents ping-pong)",
            items: { type: "string" },
            default: [],
          },
          preferredAgents: {
            type: "array",
            description:
              "Preferred agents to consider first (e.g., ['Continue', 'Codex'])",
            items: { type: "string" },
            default: [],
          },
          requireUserConfirm: {
            type: "boolean",
            description:
              "Whether a human confirmation is required before delegation",
            default: true,
          },
        },
        required: ["query"],
      },
      handler: this.handleAgentDelegation.bind(this),
    };
  }

  /**
   * Handler for agent routing
   */
  private async handleAgentRouting(
    input: Record<string, any>,
  ): Promise<string> {
    try {
      const {
        query,
        currentAgent = "Copilot",
        masterAgent,
        allowDelegation,
        maxHops,
        delegationChain,
        preferredAgents,
        requireUserConfirm,
      } = input;

      if (!query) {
        return JSON.stringify({
          error: "Query parameter is required",
          status: "failed",
        });
      }

      if (!this.agentRouter) {
        return JSON.stringify({
          status: "success",
          message: "Agent routing not available",
          recommendedAgent: currentAgent,
          reason: "Router not initialized",
        });
      }

      // Analyze and route the task
      const recommendation = await this.agentRouter.analyzeAndRoute(
        query,
        currentAgent,
        {
          masterAgent,
          allowDelegation,
          maxHops,
          delegationChain,
          preferredAgents,
          requireUserConfirm,
        },
      );

      return JSON.stringify(recommendation, null, 2);
    } catch (error) {
      return JSON.stringify({
        error: `Failed to route task: ${error}`,
        status: "failed",
      });
    }
  }

  /**
   * Handler for delegation planning
   */
  private async handleAgentDelegation(
    input: Record<string, any>,
  ): Promise<string> {
    try {
      const {
        query,
        currentAgent = "Copilot",
        masterAgent,
        allowDelegation,
        maxHops,
        delegationChain,
        preferredAgents,
        requireUserConfirm,
      } = input;

      if (!query) {
        return JSON.stringify({
          error: "Query parameter is required",
          status: "failed",
        });
      }

      if (!this.agentRouter) {
        return JSON.stringify({
          status: "success",
          message: "Agent routing not available",
          recommendedAgent: currentAgent,
          reason: "Router not initialized",
        });
      }

      const recommendation = await this.agentRouter.analyzeAndRoute(
        query,
        currentAgent,
        {
          masterAgent,
          allowDelegation,
          maxHops,
          delegationChain,
          preferredAgents,
          requireUserConfirm,
        },
      );

      return JSON.stringify(
        {
          status: "success",
          delegationPlan: recommendation,
        },
        null,
        2,
      );
    } catch (error) {
      return JSON.stringify({
        error: `Failed to create delegation plan: ${error}`,
        status: "failed",
      });
    }
  }

  /**
   * Get all tool definitions for registration
   */
  public getAllTools(): AgentFrameworkTool[] {
    const tools = [
      this.createLearningContextTool(),
      this.createProjectAnalyzerTool(),
      this.createSolutionToolTool(),
    ];

    // Add routing tool if router is available
    if (this.agentRouter) {
      tools.push(this.createAgentRoutingTool());
      tools.push(this.createAgentDelegationTool());
    }

    return tools;
  }
}
