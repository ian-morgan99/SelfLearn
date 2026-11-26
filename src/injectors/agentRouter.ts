/**
 * Agent Router
 * Routes tasks from cloud agents (Copilot) to local agents (Continue, Codex)
 * to optimize token usage and latency
 *
 * Decision Logic:
 * - Analyze task complexity and requirements
 * - Check if local agents can handle it
 * - Estimate token savings
 * - Route to best agent (cloud vs. local)
 */

import { LearningManager, Learning } from "../managers/learningManager";
import { ContextInjector } from "./contextInjector";

/**
 * Task characteristics for routing decisions
 */
export interface TaskProfile {
  complexity: "trivial" | "simple" | "medium" | "complex" | "expert";
  requiresInternet: boolean;
  requiresLatestModel: boolean;
  needsRealTime: boolean;
  contextSize: "small" | "medium" | "large";
  domainExpertise: string[]; // Required expertise areas
  estimatedTokensCopilot: number;
  estimatedTokensContinue: number;
}

/**
 * Routing recommendation
 */
export interface RoutingRecommendation {
  recommendedAgent: "Copilot" | "Continue" | "Codex" | "Hybrid";
  confidence: number; // 0-100
  reason: string;
  tokenSavings: number; // Estimated tokens saved by routing locally
  estimatedCost: {
    cloud: number;
    local: number;
    savings: number;
  };
  handoffInstructions?: string;
  shouldPromptUser: boolean;
  localAgentsCapable: string[];
  cloudAgentsNeeded: boolean;
  delegation?: {
    allowed: boolean;
    blockedReason?: string;
    masterAgent: "Copilot" | "Continue" | "Codex" | "Hybrid";
    maxHops: number;
    delegationChain: string[];
    requireUserConfirm: boolean;
  };
}

export interface DelegationOptions {
  masterAgent?: string;
  allowDelegation?: boolean;
  maxHops?: number;
  delegationChain?: string[];
  preferredAgents?: string[];
  requireUserConfirm?: boolean;
}

/**
 * Agent capabilities definition
 */
interface AgentCapabilities {
  name: string;
  type: "cloud" | "local";
  modelSize: "small" | "medium" | "large" | "xlarge";
  supportedLanguages: string[];
  supportedFrameworks: string[];
  costsPerMillionTokens: number;
  latencyMs: number;
  requiresInternet: boolean;
  offlineCapable: boolean;
  specialties: string[];
  limitations: string[];
  maxContextLength: number;
}

/**
 * Agent Router - Intelligently routes tasks to optimal agents
 */
export class AgentRouter {
  private learningManager: LearningManager;
  private contextInjector: ContextInjector;

  // Agent capability profiles
  private agentCapabilities: Map<string, AgentCapabilities> = new Map([
    [
      "Copilot",
      {
        name: "GitHub Copilot",
        type: "cloud",
        modelSize: "xlarge",
        supportedLanguages: [
          "TypeScript",
          "Python",
          "JavaScript",
          "Java",
          "Go",
          "Rust",
        ],
        supportedFrameworks: ["React", "Vue", "Angular", "Django", "FastAPI"],
        costsPerMillionTokens: 2.0, // $2 per million tokens
        latencyMs: 500,
        requiresInternet: true,
        offlineCapable: false,
        specialties: ["code-generation", "refactoring", "documentation"],
        limitations: ["no-real-time-data", "rate-limited"],
        maxContextLength: 128000,
      },
    ],
    [
      "Continue",
      {
        name: "Continue IDE",
        type: "local",
        modelSize: "medium",
        supportedLanguages: [
          "TypeScript",
          "Python",
          "JavaScript",
          "Java",
          "Go",
        ],
        supportedFrameworks: ["React", "Django", "FastAPI", "Express"],
        costsPerMillionTokens: 0, // Free - local
        latencyMs: 100,
        requiresInternet: false,
        offlineCapable: true,
        specialties: ["inline-editing", "code-completion", "refactoring"],
        limitations: ["smaller-context", "local-models-only", "requires-setup"],
        maxContextLength: 8000,
      },
    ],
    [
      "Codex",
      {
        name: "OpenAI Codex",
        type: "cloud",
        modelSize: "large",
        supportedLanguages: [
          "TypeScript",
          "Python",
          "JavaScript",
          "Java",
          "CSS",
        ],
        supportedFrameworks: ["React", "Vue", "Django", "Flask"],
        costsPerMillionTokens: 0.08, // Cheaper than Copilot
        latencyMs: 300,
        requiresInternet: true,
        offlineCapable: false,
        specialties: ["code-generation", "debugging"],
        limitations: ["older-model", "rate-limited"],
        maxContextLength: 4096,
      },
    ],
  ]);

  constructor(
    learningManager: LearningManager,
    contextInjector: ContextInjector,
  ) {
    this.learningManager = learningManager;
    this.contextInjector = contextInjector;
  }

  /**
   * Analyze a task and provide routing recommendation
   */
  public async analyzeAndRoute(
    query: string,
    currentAgent: string = "Copilot",
    options?: DelegationOptions,
  ): Promise<RoutingRecommendation> {
    try {
      // Step 1: Profile the task
      const taskProfile = await this.profileTask(query, currentAgent);

      // Step 2: Find relevant learnings that might be useful
      const enrichedContext = await this.contextInjector.enrichAIInteraction({
        question: query,
        response: "",
        source: "router",
      });

      // Step 3: Check which local agents can handle this
      const localAgentsCapable = this.getCapableLocalAgents(
        taskProfile,
        enrichedContext.relevantLearnings,
      );

      // Step 4: Calculate token costs
      const costAnalysis = this.analyzeCosts(taskProfile, localAgentsCapable);

      // Step 5: Make routing decision
      const recommendation = this.makeRoutingDecision(
        taskProfile,
        costAnalysis,
        localAgentsCapable,
        currentAgent,
      );

      return this.applyDelegationPolicy(recommendation, currentAgent, options);
    } catch (error) {
      console.error("Error analyzing task for routing:", error);
      return {
        recommendedAgent: "Copilot",
        confidence: 50,
        reason: `Error during analysis: ${error}. Defaulting to Copilot.`,
        tokenSavings: 0,
        estimatedCost: { cloud: 0, local: 0, savings: 0 },
        shouldPromptUser: false,
        localAgentsCapable: [],
        cloudAgentsNeeded: true,
        delegation: {
          allowed: false,
          blockedReason: "Routing error",
          masterAgent: "Copilot",
          maxHops: 1,
          delegationChain: [],
          requireUserConfirm: false,
        },
      };
    }
  }

  /**
   * Profile a task based on query characteristics
   */
  private async profileTask(
    query: string,
    currentAgent: string,
  ): Promise<TaskProfile> {
    const queryLower = query.toLowerCase();
    const queryLength = query.length;

    // Detect complexity markers
    let complexity: TaskProfile["complexity"] = "simple";

    if (
      queryLower.includes("refactor") ||
      queryLower.includes("optimize") ||
      queryLower.includes("debug") ||
      queryLower.includes("test")
    ) {
      complexity = "medium";
    }

    if (
      queryLower.includes("architecture") ||
      queryLower.includes("design-pattern") ||
      queryLower.includes("scalability") ||
      queryLower.includes("performance-tuning")
    ) {
      complexity = "complex";
    }

    if (
      queryLower.includes("novel") ||
      queryLower.includes("cutting-edge") ||
      queryLower.includes("research") ||
      queryLower.includes("novel-approach")
    ) {
      complexity = "expert";
    }

    // Check for internet dependencies
    const requiresInternet =
      queryLower.includes("api") ||
      queryLower.includes("fetch-data") ||
      queryLower.includes("real-time") ||
      queryLower.includes("external-service");

    // Check if latest model needed
    const requiresLatestModel =
      queryLower.includes("latest") ||
      queryLower.includes("state-of-art") ||
      queryLower.includes("cutting-edge");

    // Check for real-time requirements
    const needsRealTime =
      queryLower.includes("real-time") ||
      queryLower.includes("live") ||
      queryLower.includes("streaming");

    // Estimate context size
    let contextSize: TaskProfile["contextSize"] = "small";
    if (queryLength > 500) contextSize = "medium";
    if (queryLength > 2000) contextSize = "large";

    // Extract domain areas
    const domainExpertise = this.extractDomains(query);

    // Estimate token costs (rough estimates)
    const estimatedTokensCopilot = Math.ceil(
      queryLength / 4 + (complexity === "complex" ? 500 : 100),
    );
    const estimatedTokensContinue = Math.ceil(
      queryLength / 4 + (complexity === "complex" ? 300 : 50),
    );

    return {
      complexity,
      requiresInternet,
      requiresLatestModel,
      needsRealTime,
      contextSize,
      domainExpertise,
      estimatedTokensCopilot,
      estimatedTokensContinue,
    };
  }

  /**
   * Extract domain expertise areas from query
   */
  private extractDomains(query: string): string[] {
    const domains: string[] = [];
    const queryLower = query.toLowerCase();

    const domainPatterns: Record<string, string[]> = {
      authentication: ["auth", "jwt", "oauth", "login", "password"],
      database: ["database", "sql", "mongo", "postgres", "query"],
      performance: ["performance", "optimize", "slow", "cache", "efficient"],
      testing: ["test", "unit", "integration", "e2e", "jest", "mocha"],
      deployment: ["deploy", "docker", "kubernetes", "ci/cd", "pipeline"],
      frontend: ["react", "vue", "angular", "css", "ui", "component"],
      backend: ["api", "server", "express", "django", "fastapi"],
      devops: ["docker", "kubernetes", "terraform", "infrastructure"],
      security: ["security", "encrypt", "vulnerable", "xss", "csrf"],
    };

    for (const [domain, keywords] of Object.entries(domainPatterns)) {
      if (keywords.some((kw) => queryLower.includes(kw))) {
        domains.push(domain);
      }
    }

    return domains.length > 0 ? domains : ["general"];
  }

  /**
   * Get local agents capable of handling this task
   */
  private getCapableLocalAgents(
    taskProfile: TaskProfile,
    learnings: Learning[],
  ): string[] {
    const capable: string[] = [];

    // Check Continue
    if (!taskProfile.requiresInternet && !taskProfile.requiresLatestModel) {
      const continueCapabilities = this.agentCapabilities.get("Continue");
      if (
        continueCapabilities &&
        this.canHandle(taskProfile, continueCapabilities, learnings)
      ) {
        capable.push("Continue");
      }
    }

    // Codex (cloud but cheaper for simple tasks)
    if (taskProfile.complexity !== "expert") {
      const codexCapabilities = this.agentCapabilities.get("Codex");
      if (
        codexCapabilities &&
        this.canHandle(taskProfile, codexCapabilities, learnings)
      ) {
        capable.push("Codex");
      }
    }

    return capable;
  }

  /**
   * Check if an agent can handle a task
   */
  private canHandle(
    taskProfile: TaskProfile,
    agentCapabilities: AgentCapabilities,
    learnings: Learning[],
  ): boolean {
    // Check if task is too complex for agent's model size
    if (
      taskProfile.complexity === "expert" &&
      agentCapabilities.modelSize === "small"
    ) {
      return false;
    }

    // Check if agent requires internet when task doesn't need it (optimization only)
    if (taskProfile.requiresInternet && !agentCapabilities.requiresInternet) {
      return false;
    }

    // Check if context size fits
    const estimatedContext = taskProfile.contextSize === "large" ? 10000 : 5000;
    if (estimatedContext > agentCapabilities.maxContextLength) {
      return false;
    }

    // Check if we have relevant learnings (higher confidence for local routing)
    if (agentCapabilities.type === "local" && learnings.length < 2) {
      return false; // Local agents work best with context learnings
    }

    return true;
  }

  /**
   * Analyze costs across agents
   */
  private analyzeCosts(
    taskProfile: TaskProfile,
    capableLocalAgents: string[],
  ): {
    copilotCost: number;
    continueOrCodexCost: number;
    savings: number;
  } {
    const copilotTokenCost =
      (taskProfile.estimatedTokensCopilot / 1_000_000) *
      (this.agentCapabilities.get("Copilot")?.costsPerMillionTokens || 2.0);

    let localCost = 0;
    if (capableLocalAgents.includes("Continue")) {
      // Continue is free (local)
      localCost = 0;
    } else if (capableLocalAgents.includes("Codex")) {
      const codexTokenCost =
        (taskProfile.estimatedTokensContinue / 1_000_000) *
        (this.agentCapabilities.get("Codex")?.costsPerMillionTokens || 0.08);
      localCost = codexTokenCost;
    }

    return {
      copilotCost: copilotTokenCost,
      continueOrCodexCost: localCost,
      savings: copilotTokenCost - localCost,
    };
  }

  /**
   * Make routing decision
   */
  private makeRoutingDecision(
    taskProfile: TaskProfile,
    costAnalysis: {
      copilotCost: number;
      continueOrCodexCost: number;
      savings: number;
    },
    localAgentsCapable: string[],
    currentAgent: string,
  ): RoutingRecommendation {
    // If no local agents capable, stick with Copilot
    if (localAgentsCapable.length === 0) {
      return {
        recommendedAgent: "Copilot",
        confidence: 90,
        reason: "No local agents capable of handling this expert-level task",
        tokenSavings: 0,
        estimatedCost: {
          cloud: costAnalysis.copilotCost,
          local: costAnalysis.continueOrCodexCost,
          savings: 0,
        },
        shouldPromptUser: false,
        localAgentsCapable: [],
        cloudAgentsNeeded: true,
      };
    }

    // Calculate decision factors
    const savingsFactor =
      costAnalysis.savings / (costAnalysis.copilotCost + 0.001); // Avoid divide by zero
    const complexityPenalty =
      taskProfile.complexity === "expert"
        ? 0.3
        : taskProfile.complexity === "complex"
          ? 0.6
          : 1.0;

    let confidence = Math.min(95, savingsFactor * complexityPenalty * 100 + 40);

    // Make decision
    let recommendedAgent: "Copilot" | "Continue" | "Codex" | "Hybrid";
    let reason: string;
    let shouldPromptUser = false;

    if (
      costAnalysis.savings > 0.05 &&
      localAgentsCapable.includes("Continue")
    ) {
      // Strong recommendation for Continue
      recommendedAgent = "Continue";
      reason = `Continue can handle this task locally, saving ~$${costAnalysis.savings.toFixed(4)}`;
      confidence = Math.min(95, confidence + 10);
    } else if (
      costAnalysis.savings > 0.01 &&
      localAgentsCapable.includes("Codex")
    ) {
      // Consider Codex if savings are meaningful
      recommendedAgent = "Codex";
      reason = `Codex is more cost-effective ($${costAnalysis.continueOrCodexCost.toFixed(4)} vs $${costAnalysis.copilotCost.toFixed(4)})`;
      confidence = Math.min(85, confidence);
    } else if (
      taskProfile.complexity === "medium" &&
      costAnalysis.savings > 0
    ) {
      // For medium complexity with savings, suggest hybrid
      recommendedAgent = "Hybrid";
      reason = `Consider starting with ${localAgentsCapable[0]} and escalate to Copilot if needed`;
      shouldPromptUser = true;
      confidence = Math.min(80, confidence);
    } else {
      // Default to Copilot
      recommendedAgent = "Copilot";
      reason =
        taskProfile.requiresLatestModel || taskProfile.requiresInternet
          ? "Task requires cutting-edge model or internet access"
          : "Complexity warrants using Copilot for reliability";
      confidence = 75;
    }

    return {
      recommendedAgent,
      confidence: Math.max(45, confidence),
      reason,
      tokenSavings:
        costAnalysis.savings > 0
          ? Math.ceil(
              taskProfile.estimatedTokensCopilot -
                taskProfile.estimatedTokensContinue,
            )
          : 0,
      estimatedCost: {
        cloud: costAnalysis.copilotCost,
        local: costAnalysis.continueOrCodexCost,
        savings: costAnalysis.savings,
      },
      handoffInstructions:
        recommendedAgent !== "Copilot"
          ? this.generateHandoffInstructions(
              recommendedAgent,
              taskProfile,
              localAgentsCapable,
            )
          : undefined,
      shouldPromptUser,
      localAgentsCapable,
      cloudAgentsNeeded:
        recommendedAgent === "Copilot" || recommendedAgent === "Hybrid",
    };
  }

  private applyDelegationPolicy(
    recommendation: RoutingRecommendation,
    currentAgent: string,
    options?: DelegationOptions,
  ): RoutingRecommendation {
    const policy = this.normalizeDelegationOptions(options);
    const normalizedCurrent = this.normalizeAgentName(currentAgent);
    const normalizedMaster = this.normalizeAgentName(policy.masterAgent);

    let blockedReason: string | undefined;

    if (!policy.allowDelegation) {
      blockedReason = "Delegation disabled by policy";
    } else if (normalizedCurrent !== normalizedMaster) {
      blockedReason = `Delegation restricted to master agent: ${normalizedMaster}`;
    } else if (policy.delegationChain.length >= policy.maxHops) {
      blockedReason = `Max delegation hops (${policy.maxHops}) reached`;
    }

    let adjusted = recommendation;

    if (!blockedReason && policy.preferredAgents.length > 0) {
      const preferred = policy.preferredAgents
        .map((agent) => this.normalizeAgentName(agent))
        .filter((agent, index, list) => list.indexOf(agent) === index);
      const preferredCandidate = preferred.find(
        (agent) =>
          agent === "Copilot" ||
          recommendation.localAgentsCapable.includes(agent),
      );
      if (
        preferredCandidate &&
        preferredCandidate !== recommendation.recommendedAgent
      ) {
        adjusted = {
          ...recommendation,
          recommendedAgent: preferredCandidate,
          reason: `${recommendation.reason} (preferred agent: ${preferredCandidate})`,
          shouldPromptUser: true,
        };
      }
    }

    if (blockedReason) {
      adjusted = {
        ...recommendation,
        recommendedAgent: normalizedCurrent,
        reason: `${blockedReason}. Staying on ${normalizedCurrent}.`,
        tokenSavings: 0,
        estimatedCost: {
          cloud: recommendation.estimatedCost.cloud,
          local: recommendation.estimatedCost.local,
          savings: 0,
        },
        shouldPromptUser: false,
        cloudAgentsNeeded:
          normalizedCurrent === "Copilot" || normalizedCurrent === "Hybrid",
      };
    }

    return {
      ...adjusted,
      delegation: {
        allowed: !blockedReason,
        blockedReason,
        masterAgent: normalizedMaster,
        maxHops: policy.maxHops,
        delegationChain: policy.delegationChain,
        requireUserConfirm:
          policy.requireUserConfirm ?? adjusted.shouldPromptUser,
      },
    };
  }

  private normalizeDelegationOptions(
    options?: DelegationOptions,
  ): Required<DelegationOptions> {
    return {
      masterAgent: options?.masterAgent || "Copilot",
      allowDelegation: options?.allowDelegation ?? true,
      maxHops: options?.maxHops ?? 1,
      delegationChain: Array.isArray(options?.delegationChain)
        ? options?.delegationChain
        : [],
      preferredAgents: Array.isArray(options?.preferredAgents)
        ? options?.preferredAgents
        : [],
      requireUserConfirm: options?.requireUserConfirm ?? false,
    };
  }

  private normalizeAgentName(
    agentName?: string,
  ): "Copilot" | "Continue" | "Codex" | "Hybrid" {
    const normalized = (agentName || "").toLowerCase();

    if (normalized.includes("continue")) {
      return "Continue";
    }

    if (normalized.includes("codex")) {
      return "Codex";
    }

    if (normalized.includes("hybrid")) {
      return "Hybrid";
    }

    return "Copilot";
  }

  /**
   * Generate instructions for handing off work to another agent
   */
  private generateHandoffInstructions(
    recommendedAgent: string,
    taskProfile: TaskProfile,
    capableAgents: string[],
  ): string {
    if (recommendedAgent === "Continue") {
      return `Open the Continue chat in VS Code (Ctrl+L or Cmd+L) and run your query there. Continue has access to your project context and can handle this ${taskProfile.complexity} task locally.`;
    } else if (recommendedAgent === "Codex") {
      return `For better cost efficiency, consider using OpenAI Codex directly or through a compatible editor. Your query is suitable for its capabilities.`;
    }

    return `Consider using ${capableAgents[0]} which can handle this task more efficiently.`;
  }

  /**
   * Get all available agents and their capabilities
   */
  public getAvailableAgents(): Array<{
    name: string;
    type: string;
    costPerMillion: number;
    latency: string;
    strengths: string[];
  }> {
    const agents: Array<{
      name: string;
      type: string;
      costPerMillion: number;
      latency: string;
      strengths: string[];
    }> = [];

    this.agentCapabilities.forEach((cap) => {
      agents.push({
        name: cap.name,
        type: cap.type,
        costPerMillion: cap.costsPerMillionTokens,
        latency: `${cap.latencyMs}ms`,
        strengths: cap.specialties,
      });
    });

    return agents;
  }

  /**
   * Check if a saved learning indicates local agent capability
   */
  public isLocalAgentOptimal(learning: Learning): boolean {
    // Check if learning has low complexity or is pattern-based
    if (
      learning.difficulty === "beginner" ||
      learning.difficulty === "intermediate"
    ) {
      return true;
    }

    // Check if tags suggest local handling
    const localFriendlyTags = [
      "pattern",
      "refactoring",
      "completion",
      "inline-edit",
    ];
    if (
      learning.tags?.some((tag) =>
        localFriendlyTags.some((lfTag) => tag.toLowerCase().includes(lfTag)),
      )
    ) {
      return true;
    }

    // High reliability simple solutions work well locally
    if (learning.reliability >= 85 && learning.difficulty !== "expert") {
      return true;
    }

    return false;
  }
}
