import * as vscode from "vscode";
import { LearningManager, Learning } from "../managers/learningManager";
import { ContextAnalyzer } from "../analyzers/contextAnalyzer";

export interface AIInteractionContext {
  interaction: {
    question: string;
    response: string;
    source: string;
  };
  relevantLearnings: Learning[];
  similarQuestions: Learning[];
  relatedSolutions: Learning[];
  enrichmentSuggestions: {
    problemTypes: string[];
    concepts: string[];
    frameworks: string[];
    languages: string[];
  };
  confidenceScore: number; // 0-100
  contextSummary: string;
}

export class ContextInjector {
  private learningManager: LearningManager;
  private contextAnalyzer: ContextAnalyzer;
  private context: vscode.ExtensionContext;

  constructor(
    learningManager: LearningManager,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;
    this.contextAnalyzer = new ContextAnalyzer(learningManager, context);
    this.context = context;
  }

  /**
   * Enriches an AI interaction with relevant context from the learning repository
   * This is called before processing an AI interaction to provide context-aware analysis
   */
  public async enrichAIInteraction(interaction: {
    question: string;
    response: string;
    source: string;
  }): Promise<AIInteractionContext> {
    try {
      // Step 1: Extract signals from the interaction
      const signals = this.extractSignalsFromInteraction(interaction);

      // Step 2: Find relevant learnings based on detected signals
      const relevantLearnings =
        await this.findRelevantLearningsBySignals(signals);

      // Step 3: Find similar questions in repository
      const similarQuestions = await this.findSimilarQuestions(
        interaction.question,
      );

      // Step 4: Find related solutions by metadata matching
      const relatedSolutions = await this.findRelatedSolutions(signals);

      // Step 5: Generate enrichment suggestions
      const enrichmentSuggestions = this.generateEnrichmentSuggestions(
        signals,
        relevantLearnings,
      );

      // Step 6: Calculate confidence score
      const confidenceScore = this.calculateConfidenceScore(
        relevantLearnings,
        similarQuestions,
        relatedSolutions,
        signals,
      );

      // Step 7: Generate context summary
      const contextSummary = this.generateContextSummary(
        interaction,
        signals,
        relevantLearnings,
        confidenceScore,
      );

      return {
        interaction,
        relevantLearnings,
        similarQuestions,
        relatedSolutions,
        enrichmentSuggestions,
        confidenceScore,
        contextSummary,
      };
    } catch (error) {
      console.error("Error enriching AI interaction:", error);
      return {
        interaction,
        relevantLearnings: [],
        similarQuestions: [],
        relatedSolutions: [],
        enrichmentSuggestions: {
          problemTypes: [],
          concepts: [],
          frameworks: [],
          languages: [],
        },
        confidenceScore: 0,
        contextSummary: "Unable to generate context",
      };
    }
  }

  /**
   * Extracts key signals from an AI interaction for pattern matching
   */
  private extractSignalsFromInteraction(interaction: {
    question: string;
    response: string;
    source: string;
  }): {
    languages: string[];
    problemTypes: string[];
    concepts: string[];
    frameworks: string[];
    keywords: string[];
  } {
    const combined = (
      interaction.question +
      " " +
      interaction.response
    ).toLowerCase();

    return {
      languages: this.detectLanguages(combined),
      problemTypes: this.detectProblemTypes(combined),
      concepts: this.detectConcepts(combined),
      frameworks: this.detectFrameworks(combined),
      keywords: this.extractKeywords(
        interaction.question,
        interaction.response,
      ),
    };
  }

  /**
   * Finds learnings relevant to the detected signals
   */
  private async findRelevantLearningsBySignals(signals: {
    languages: string[];
    problemTypes: string[];
    concepts: string[];
    frameworks: string[];
    keywords: string[];
  }): Promise<Learning[]> {
    const results = await this.learningManager.searchByMultipleCriteria({
      languages: signals.languages.length > 0 ? signals.languages : undefined,
      problemTypes:
        signals.problemTypes.length > 0 ? signals.problemTypes : undefined,
      concepts: signals.concepts.length > 0 ? signals.concepts : undefined,
      frameworks:
        signals.frameworks.length > 0 ? signals.frameworks : undefined,
      minReliability: 60,
    });

    // Also search by keywords
    if (signals.keywords.length > 0) {
      const keywordResults = await this.learningManager.searchByKeywords(
        signals.keywords.slice(0, 10),
      );
      results.push(...keywordResults);
    }

    // Remove duplicates and sort by relevance
    const uniqueMap = new Map<string, Learning>();
    results.forEach((l) => uniqueMap.set(l.id, l));

    return Array.from(uniqueMap.values())
      .sort((a, b) => {
        const scoreA = (a.usageCount || 0) * 2 + a.reliability;
        const scoreB = (b.usageCount || 0) * 2 + b.reliability;
        return scoreB - scoreA;
      })
      .slice(0, 10);
  }

  /**
   * Finds similar questions already in the learning repository
   */
  private async findSimilarQuestions(question: string): Promise<Learning[]> {
    const allLearnings = await this.learningManager.getAllLearnings();
    const scored = allLearnings
      .map((learning) => ({
        learning,
        similarity: this.calculateStringSimilarity(question, learning.question),
      }))
      .filter((item) => item.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    return scored.map((item) => item.learning);
  }

  /**
   * Finds related solutions by metadata matching
   */
  private async findRelatedSolutions(signals: {
    languages: string[];
    problemTypes: string[];
    concepts: string[];
    frameworks: string[];
    keywords: string[];
  }): Promise<Learning[]> {
    const allLearnings = await this.learningManager.getAllLearnings();
    const scored = allLearnings
      .map((learning) => ({
        learning,
        score: this.calculateMetadataMatchScore(learning, signals),
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    return scored.map((item) => item.learning);
  }

  /**
   * Calculates similarity between two strings (0-1)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    const terms1 = this.extractTerms(str1);
    const terms2 = this.extractTerms(str2);

    if (terms1.length === 0 || terms2.length === 0) return 0;

    const common = terms1.filter((t) => terms2.includes(t)).length;
    return common / Math.max(terms1.length, terms2.length);
  }

  /**
   * Calculates how well a learning matches the interaction signals
   */
  private calculateMetadataMatchScore(
    learning: Learning,
    signals: {
      languages: string[];
      problemTypes: string[];
      concepts: string[];
      frameworks: string[];
      keywords: string[];
    },
  ): number {
    let score = 0;

    // Language match (30 points)
    if (
      signals.languages.some(
        (l) => l.toLowerCase() === learning.language.toLowerCase(),
      )
    ) {
      score += 30;
    }

    // Problem type match (20 points each)
    const matchedProblems = learning.problemType.filter((p) =>
      signals.problemTypes.some((sp) => sp.toLowerCase() === p.toLowerCase()),
    );
    score += matchedProblems.length * 20;

    // Concept match (15 points each)
    const matchedConcepts = learning.concepts.filter((c) =>
      signals.concepts.some((sc) => sc.toLowerCase() === c.toLowerCase()),
    );
    score += matchedConcepts.length * 15;

    // Framework match (25 points each)
    const matchedFrameworks = learning.frameworks.filter((f) =>
      signals.frameworks.some((sf) => sf.toLowerCase() === f.toLowerCase()),
    );
    score += matchedFrameworks.length * 25;

    // Apply reliability weight
    score = score * (learning.reliability / 100);

    return score;
  }

  /**
   * Generates enrichment suggestions based on repository patterns
   */
  private generateEnrichmentSuggestions(
    signals: {
      languages: string[];
      problemTypes: string[];
      concepts: string[];
      frameworks: string[];
      keywords: string[];
    },
    relevantLearnings: Learning[],
  ): {
    problemTypes: string[];
    concepts: string[];
    frameworks: string[];
    languages: string[];
  } {
    const suggestions = {
      languages: new Set(signals.languages),
      problemTypes: new Set(signals.problemTypes),
      concepts: new Set(signals.concepts),
      frameworks: new Set(signals.frameworks),
    };

    // Add common problem types from relevant learnings
    relevantLearnings.forEach((learning) => {
      learning.problemType.forEach((p) => suggestions.problemTypes.add(p));
      learning.concepts.forEach((c) => suggestions.concepts.add(c));
      learning.frameworks.forEach((f) => suggestions.frameworks.add(f));
    });

    return {
      languages: Array.from(suggestions.languages),
      problemTypes: Array.from(suggestions.problemTypes),
      concepts: Array.from(suggestions.concepts),
      frameworks: Array.from(suggestions.frameworks),
    };
  }

  /**
   * Calculates confidence score (0-100) based on context quality
   */
  private calculateConfidenceScore(
    relevantLearnings: Learning[],
    similarQuestions: Learning[],
    relatedSolutions: Learning[],
    signals: {
      languages: string[];
      problemTypes: string[];
      concepts: string[];
      frameworks: string[];
      keywords: string[];
    },
  ): number {
    let score = 0;

    // Found relevant learnings (+35)
    if (relevantLearnings.length >= 3) score += 35;
    else if (relevantLearnings.length > 0) score += 20;

    // Found similar questions (+30)
    if (similarQuestions.length > 0) score += 30;

    // Found related solutions (+25)
    if (relatedSolutions.length > 0) score += 25;

    // Strong signal detection (+10)
    if (signals.languages.length > 0) score += 5;
    if (signals.problemTypes.length > 1) score += 5;

    return Math.min(100, score);
  }

  /**
   * Generates a readable summary of the enrichment context
   */
  private generateContextSummary(
    interaction: {
      question: string;
      response: string;
      source: string;
    },
    signals: {
      languages: string[];
      problemTypes: string[];
      concepts: string[];
      frameworks: string[];
      keywords: string[];
    },
    relevantLearnings: Learning[],
    confidenceScore: number,
  ): string {
    const lines: string[] = [];

    lines.push(`Source: ${interaction.source}`);
    lines.push(`Confidence: ${confidenceScore}%`);
    lines.push("");

    if (signals.languages.length > 0) {
      lines.push(`Languages: ${signals.languages.join(", ")}`);
    }
    if (signals.problemTypes.length > 0) {
      lines.push(`Problem Types: ${signals.problemTypes.join(", ")}`);
    }
    if (signals.frameworks.length > 0) {
      lines.push(`Frameworks: ${signals.frameworks.join(", ")}`);
    }
    if (signals.concepts.length > 0) {
      lines.push(`Concepts: ${signals.concepts.join(", ")}`);
    }

    if (relevantLearnings.length > 0) {
      lines.push("");
      lines.push(
        `Repository Context: Found ${relevantLearnings.length} relevant learnings`,
      );
      relevantLearnings.slice(0, 3).forEach((learning, idx) => {
        lines.push(
          `  ${idx + 1}. [${learning.language}] ${learning.question.substring(0, 60)}...`,
        );
      });
    } else {
      lines.push("");
      lines.push("Repository Context: No directly matching learnings found");
    }

    return lines.join("\n");
  }

  /**
   * Extracts key terms from text
   */
  private extractTerms(text: string): string[] {
    const commonWords = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "is",
      "are",
      "was",
      "were",
      "be",
      "how",
      "what",
      "when",
    ]);

    return text
      .toLowerCase()
      .split(/[\s\-_\.\/]+/)
      .filter((term) => term.length > 2 && !commonWords.has(term))
      .slice(0, 50);
  }

  /**
   * Extracts searchable keywords from interaction
   */
  private extractKeywords(question: string, response: string): string[] {
    const keywords = new Set<string>();

    // Extract code-like identifiers
    const identifiers = response.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g) || [];
    identifiers.slice(0, 15).forEach((id) => keywords.add(id.toLowerCase()));

    // Extract from question terms
    this.extractTerms(question)
      .slice(0, 10)
      .forEach((t) => keywords.add(t));

    // Detect patterns
    if (/async|await|promise/.test(response)) keywords.add("async");
    if (/error|exception|catch/.test(response)) keywords.add("error-handling");
    if (/test|jest|mocha/.test(response)) keywords.add("testing");

    return Array.from(keywords).slice(0, 20);
  }

  /**
   * Detects programming languages
   */
  private detectLanguages(content: string): string[] {
    const languages: string[] = [];
    const patterns: { [key: string]: RegExp } = {
      TypeScript: /typescript|interface\s|type\s|:\s*\w+\s*[=;]/i,
      JavaScript: /javascript|const\s|let\s|=>|\.js/i,
      Python: /python|def\s|class\s|import\s|\.py/i,
      Java: /java|public\s+class|extends\s|@Override/i,
      "C#": /csharp|namespace|using\s|async\s+Task|class\s|^\[/i,
      Go: /golang|func\s|package\s|import/i,
      Rust: /rust|fn\s|impl\s|cargo/i,
      Ruby: /ruby|def\s|class\s|require/i,
      PHP: /php|\$|function|class\s/i,
      SQL: /sql|SELECT|INSERT|UPDATE|DELETE/i,
      "Power Query": /let\s+\w+\s*=|each|in|#\"/i,
      DAX: /EVALUATE|CALCULATE|MEASURE|RETURN/i,
      KQL: /find|search|where|project|summarize/i,
      "T-SQL": /SELECT|INSERT|UPDATE|DELETE|CREATE|sp_|@\w+/i,
      Bicep: /param\s+|var\s+|resource\s+|output\s+/i,
      PowerShell: /\$\w+|Get-|Set-|-Path|-Value/i,
      JSON: /^\{|\^\[|":\s*(?:\{|\[)/,
      XML: /^\<\?xml|<\w+[^>]*>|xmlns=/i,
      YAML: /^\w+:\s*|^\s*-\s+/m,
    };

    for (const [lang, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) languages.push(lang);
    }

    return languages;
  }

  /**
   * Detects problem types
   */
  private detectProblemTypes(content: string): string[] {
    const types: string[] = [];
    const patterns: { [key: string]: RegExp } = {
      // General programming
      async: /async|await|promise|concurrent|non-blocking/i,
      "error-handling": /error|exception|catch|try|fail|throw/i,
      "state-management": /state|useState|reducer|context|store/i,
      performance: /optimize|cache|memo|efficient|bottleneck/i,
      testing: /test|jest|mocha|unit|mock|coverage/i,
      security: /auth|encrypt|password|token|secure/i,
      "api-integration": /api|fetch|http|request|rest|graphql/i,
      database: /database|sql|query|orm|mongo|postgres/i,
      // Microsoft Dynamics ecosystem
      "dynamics-365": /dynamics 365|D365|dynamics|CRM|sales|customer/i,
      "business-central": /business central|NAV|navision|BC|E1|E2|E3/i,
      "finance-supply-chain":
        /finance|supply chain|inventory|purchasing|procurement|SCM|ax/i,
      "customer-engagement":
        /customer engagement|CE|sales|service|marketing|insights/i,
      "power-platform":
        /power platform|powerapps|power automate|power bi|dynamics/i,
      powerapps: /powerapps|canvas|model-driven|app designer/i,
      "power-automate":
        /power automate|logic apps|workflow|flow|trigger|action/i,
      "power-bi":
        /power bi|business intelligence|dashboard|report|visualization|dax|measure/i,
      "copilot-studio": /copilot studio|copilot|bot|chatbot|virtual agent/i,
      "azure-functions":
        /azure functions|function app|serverless|trigger|binding/i,
      "logic-apps": /logic apps|workflow|integration|connector|trigger/i,
      connectors:
        /connector|connection|integration|data source|linked service/i,
      "azure-integration":
        /azure|integration|service bus|event hub|message|queue/i,
      "power-query": /power query|M language|let|each|transformation|ETL/i,
      "dax-analysis": /dax|measure|evaluate|calculate|context|filter/i,
      customization: /customize|customize|extension|plugin|event|hook/i,
      "data-integration":
        /data integration|synapse|dataflow|data pipeline|ETL/i,
      "security-compliance":
        /security|compliance|GDPR|encryption|audit|permissions/i,
    };

    for (const [type, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) types.push(type);
    }

    return types;
  }

  /**
   * Detects concepts from content
   */
  private detectConcepts(content: string): string[] {
    const concepts: string[] = [];
    const patterns: { [key: string]: RegExp } = {
      "async-await": /async|await/i,
      promises: /promise|\.then|\.catch/i,
      closures: /closure|scope/i,
      recursion: /recursion|recursive/i,
      "higher-order-functions": /map|filter|reduce|higher-order/i,
      "functional-programming": /functional|pure|immutable/i,
      "design-patterns": /pattern|singleton|factory|observer/i,
      "type-system": /type|interface|generic|typed/i,
    };

    for (const [concept, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) concepts.push(concept);
    }

    return concepts;
  }

  /**
   * Detects frameworks
   */
  private detectFrameworks(content: string): string[] {
    const frameworks: string[] = [];
    const patterns: { [key: string]: RegExp } = {
      React: /react|useState|useEffect|jsx/i,
      Vue: /vue|v-if|v-for|computed/i,
      Angular: /angular|@component|@service/i,
      Express: /express|app\.get|app\.post|middleware/i,
      Django: /django|views\.py|models\.py|urls\.py/i,
      Flask: /flask|@app\.route|render_template/i,
      "Next.js": /next\.js|getServerSideProps|getStaticProps/i,
      FastAPI: /fastapi|@app\.get|pydantic/i,
      Spring: /spring|@bean|@service|spring boot/i,
      Rails: /rails|activerecord|erb|migrate/i,
    };

    for (const [framework, pattern] of Object.entries(patterns)) {
      if (pattern.test(content)) frameworks.push(framework);
    }

    return frameworks;
  }

  public async injectContextForCurrentProject(): Promise<void> {
    try {
      // Analyze current project
      const projectContext = await this.contextAnalyzer.analyzeProjectContext();

      // Find relevant learnings
      const relevantLearnings =
        await this.contextAnalyzer.findRelevantLearnings(projectContext);

      if (relevantLearnings.length === 0) {
        vscode.window.showInformationMessage(
          "No relevant learnings found for your current project type.",
        );
        return;
      }

      // Generate context document
      const contextDocument = this.generateContextDocument(
        projectContext,
        relevantLearnings,
      );

      // Create a new file with the context
      await this.createContextFile(contextDocument);

      vscode.window.showInformationMessage(
        `Injected ${relevantLearnings.length} relevant learnings for your project!`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to inject context: ${error}`);
    }
  }

  private generateContextDocument(
    projectContext: any,
    relevantLearnings: any[],
  ): string {
    const document: string[] = [];

    document.push("# AI Learning Repository - Injected Context");
    document.push("");
    document.push(`Generated for: ${projectContext.projectName}`);
    document.push(`Project Type: ${projectContext.projectType}`);
    document.push(
      `Languages: ${projectContext.languages.join(", ") || "None detected"}`,
    );
    document.push(
      `Frameworks: ${projectContext.frameworks.join(", ") || "None detected"}`,
    );
    document.push("");
    document.push("---");
    document.push("");
    document.push("## Relevant Learnings");
    document.push("");
    document.push(
      `Found ${relevantLearnings.length} relevant learning(s) from your repository:`,
    );
    document.push("");

    relevantLearnings.forEach((learning, index) => {
      document.push(`### ${index + 1}. ${learning.question}`);
      document.push("");
      document.push(`**Language:** ${learning.language}`);
      document.push(`**Tags:** ${learning.tags.join(", ")}`);
      document.push(`**Outcome:** ${learning.outcome}`);
      document.push(
        `**Date:** ${new Date(learning.timestamp).toLocaleDateString()}`,
      );
      document.push("");
      document.push("**Solution:**");
      document.push("```");
      document.push(learning.solution.substring(0, 500)); // Truncate for readability
      if (learning.solution.length > 500) {
        document.push("... (truncated)");
      }
      document.push("```");
      document.push("");
      if (learning.context) {
        document.push(`**Context:** ${learning.context}`);
        document.push("");
      }
      if (learning.notes) {
        document.push(`**Notes:** ${learning.notes}`);
        document.push("");
      }
      document.push("---");
      document.push("");
    });

    document.push("## How to Use This Context");
    document.push("");
    document.push(
      "1. Review the relevant learnings above for patterns and solutions",
    );
    document.push("2. Apply similar approaches to your current challenges");
    document.push(
      "3. Mark learnings as helpful or update them based on results",
    );
    document.push("4. New learnings will be automatically added as you code");
    document.push("");

    return document.join("\n");
  }

  private async createContextFile(content: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder open");
    }

    const fileName = `AI-LEARNINGS-${Date.now()}.md`;
    const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);

    const data = new TextEncoder().encode(content);
    await vscode.workspace.fs.writeFile(fileUri, data);

    // Open the file
    const document = await vscode.workspace.openTextDocument(fileUri);
    await vscode.window.showTextDocument(document);
  }

  public async generateSystemPrompt(): Promise<string> {
    try {
      const projectContext = await this.contextAnalyzer.analyzeProjectContext();
      const relevantLearnings =
        await this.contextAnalyzer.findRelevantLearnings(projectContext);

      const prompt: string[] = [];

      prompt.push(
        "Based on my learning repository, here are relevant patterns and solutions:",
      );
      prompt.push("");

      relevantLearnings.slice(0, 5).forEach((learning, index) => {
        prompt.push(`${index + 1}. Problem: ${learning.question}`);
        prompt.push(
          `   Solution approach: ${learning.solution.substring(0, 200)}`,
        );
        prompt.push(`   Outcome: ${learning.outcome}`);
        prompt.push("");
      });

      prompt.push("Consider these patterns when providing suggestions.");

      return prompt.join("\n");
    } catch (error) {
      console.error("Error generating system prompt:", error);
      return "";
    }
  }
}
