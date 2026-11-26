import * as vscode from "vscode";
import * as path from "path";
import { LearningManager } from "../managers/learningManager";

export class LegacyImporter {
  private learningManager: LearningManager;
  private context: vscode.ExtensionContext;

  constructor(
    learningManager: LearningManager,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;
    this.context = context;
  }

  public async importFromLegacyProject(): Promise<void> {
    try {
      vscode.window.showInformationMessage(
        "Scanning project for legacy learnings...",
      );

      let totalImported = 0;

      // 1. Extract from Markdown files
      vscode.window.showInformationMessage("Scanning markdown files...");
      const mdLearnings = await this.extractFromMarkdownFiles();
      totalImported += mdLearnings;
      vscode.window.showInformationMessage(
        `Found ${mdLearnings} learnings from markdown files`,
      );

      // 2. Extract from lessons learned files
      vscode.window.showInformationMessage("Scanning lesson files...");
      const lessonLearnings = await this.extractFromLessonFiles();
      totalImported += lessonLearnings;
      vscode.window.showInformationMessage(
        `Found ${lessonLearnings} learnings from lesson files`,
      );

      // 3. Extract from code patterns in source files
      vscode.window.showInformationMessage("Scanning source code patterns...");
      const codeLearnings = await this.extractFromSourcePatterns();
      totalImported += codeLearnings;
      vscode.window.showInformationMessage(
        `Found ${codeLearnings} learnings from source files`,
      );

      vscode.window.showInformationMessage(
        `✅ Successfully imported ${totalImported} learnings from legacy project!`,
      );
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to import legacy learnings: ${error}`,
      );
    }
  }

  private async extractFromMarkdownFiles(): Promise<number> {
    try {
      // Find all markdown files
      const mdFiles = await vscode.workspace.findFiles(
        "**/*.md",
        "**/node_modules/**",
        500,
      );

      console.log(`[Legacy Import] Found ${mdFiles.length} markdown files`);
      let count = 0;
      let processedFiles = 0;
      let skippedFiles = 0;

      for (const file of mdFiles) {
        const content = await vscode.workspace.fs.readFile(file);
        const text = new TextDecoder().decode(content);

        // Skip documentation-only files
        if (this.isDocumentationFile(file.fsPath)) {
          skippedFiles++;
          console.log(`[Legacy Import] Skipping doc file: ${path.basename(file.fsPath)}`);
          continue;
        }

        processedFiles++;
        console.log(`[Legacy Import] Processing: ${path.basename(file.fsPath)}`);

        // Extract code blocks and solutions
        const codeBlocks = this.extractCodeBlocks(text);
        const solutions = this.extractSolutions(text);
        const patterns = this.extractPatterns(text);

        console.log(`  - Found ${codeBlocks.length} code blocks, ${solutions.length} solutions, ${patterns.length} patterns`);

        // Process code blocks
        for (const block of codeBlocks) {
          const learning = await this.learningManager.addLearning(
            `Code pattern from ${path.basename(file.fsPath)}`,
            block.code,
            block.language || "unknown",
            ["legacy", "markdown", "code-example"],
            `Found in ${path.basename(file.fsPath)}`,
            "success",
            `Extracted from markdown: ${block.title}`,
          );
          // Enrich with metadata
          await this.learningManager.updateLearning(learning.id, {
            ...learning,
            source: "legacy",
            category: "pattern",
            difficulty: this.estimateDifficulty(block.code),
            reliability: 70,
            keywords: this.extractKeywords(block.code),
            sourceFile: file.fsPath,
            problemType: this.detectProblemTypes(block.code),
            concepts: this.extractConcepts(
              block.language || "unknown",
              block.code,
            ),
          });
          count++;
        }

        // Process solutions
        for (const solution of solutions) {
          const learning = await this.learningManager.addLearning(
            solution.question,
            solution.code,
            solution.language || "unknown",
            ["legacy", "solution", "markdown"],
            `Found in ${path.basename(file.fsPath)}`,
            "success",
            solution.description,
          );
          // Enrich with metadata
          await this.learningManager.updateLearning(learning.id, {
            ...learning,
            source: "legacy",
            category: "solution",
            difficulty: this.estimateDifficulty(solution.code),
            reliability: 75,
            keywords: this.extractKeywords(
              solution.question + " " + solution.code,
            ),
            sourceFile: file.fsPath,
            problemType: this.detectProblemTypes(solution.code),
            concepts: this.extractConcepts(
              solution.language || "unknown",
              solution.code,
            ),
            tags: [
              "legacy",
              "solution",
              "markdown",
              ...this.extractFrameworks(solution.code),
            ],
          });
          count++;
        }

        // Process patterns
        for (const pattern of patterns) {
          const learning = await this.learningManager.addLearning(
            pattern.name,
            pattern.example,
            pattern.language || "unknown",
            ["legacy", "pattern", "markdown"],
            `Pattern documentation`,
            "success",
            pattern.description,
          );
          // Enrich with metadata
          await this.learningManager.updateLearning(learning.id, {
            ...learning,
            source: "legacy",
            category: "pattern",
            difficulty: "intermediate",
            reliability: 80,
            keywords: this.extractKeywords(
              pattern.name + " " + pattern.description,
            ),
            sourceFile: file.fsPath,
            problemType: this.detectProblemTypes(pattern.example),
            concepts: this.extractConcepts(
              pattern.language || "unknown",
              pattern.example,
            ),
            tags: ["legacy", "pattern", "markdown", pattern.name.toLowerCase()],
          });
          count++;
        }
      }

      console.log(`[Legacy Import] Processed ${processedFiles} files, skipped ${skippedFiles}, imported ${count} learnings from markdown`);
      return count;
    } catch (error) {
      console.error("Error extracting from markdown files:", error);
      return 0;
    }
  }

  private async extractFromLessonFiles(): Promise<number> {
    try {
      // Look for lesson/learnings files
      const patterns = [
        "**/lessons-learnt.md",
        "**/lessons-learned.md",
        "**/LEARNINGS.md",
        "**/LESSONS.md",
        "**/lessons/*.md",
        "**/docs/lessons/*.md",
      ];

      let count = 0;

      for (const pattern of patterns) {
        const files = await vscode.workspace.findFiles(
          pattern,
          "**/node_modules/**",
          50,
        );

        for (const file of files) {
          const content = await vscode.workspace.fs.readFile(file);
          const text = new TextDecoder().decode(content);

          // Parse lessons in format: "## Lesson: Title" or "### What I learned"
          const lessons = this.parseLessons(text);

          for (const lesson of lessons) {
            await this.learningManager.addLearning(
              lesson.title,
              lesson.solution,
              lesson.language,
              ["legacy", "lesson-learned"],
              lesson.context,
              "success",
              lesson.notes,
            );
            count++;
          }
        }
      }

      return count;
    } catch (error) {
      console.error("Error extracting from lesson files:", error);
      return 0;
    }
  }

  private async extractFromSourcePatterns(): Promise<number> {
    try {
      // Find source files
      const sourceFiles = await vscode.workspace.findFiles(
        "**/*.{ts,tsx,js,jsx,py,cs,java,go,rs,cpp,c}",
        "**/node_modules/**",
        500,
      );

      let count = 0;

      for (const file of sourceFiles) {
        const language = this.detectLanguage(file.fsPath);
        const content = await vscode.workspace.fs.readFile(file);
        const text = new TextDecoder().decode(content);

        // Extract functions with documentation comments
        const documented = this.extractDocumentedFunctions(text, language);

        for (const item of documented) {
          await this.learningManager.addLearning(
            `Function: ${item.name}`,
            item.code,
            language,
            ["legacy", "codebase", "function"],
            `From ${path.basename(file.fsPath)}`,
            "success",
            item.docs,
          );
          count++;
        }

        // Extract common patterns (error handling, async, etc.)
        const patterns = this.extractCodePatterns(text, language);

        for (const pattern of patterns) {
          await this.learningManager.addLearning(
            `${pattern.type} pattern`,
            pattern.code,
            language,
            ["legacy", "pattern", pattern.type.toLowerCase()],
            `Pattern from ${path.basename(file.fsPath)}`,
            "success",
            `${pattern.type} pattern found in codebase`,
          );
          count++;
        }
      }

      return count;
    } catch (error) {
      console.error("Error extracting from source patterns:", error);
      return 0;
    }
  }

  private extractCodeBlocks(
    text: string,
  ): Array<{ title: string; code: string; language: string }> {
    const blocks: Array<{ title: string; code: string; language: string }> = [];
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const codeBlockMatch = /^```(\w+)?/.exec(line);
      
      if (codeBlockMatch) {
        const language = codeBlockMatch[1] || 'unknown';
        const codeLines: string[] = [];
        let title = 'Code example';
        
        // Look back up to 3 lines for a title (heading or description)
        for (let j = Math.max(0, i - 3); j < i; j++) {
          const prevLine = lines[j].trim();
          if (prevLine.match(/^#{1,6}\s+(.+)$/)) {
            title = prevLine.replace(/^#{1,6}\s+/, '').trim();
            break;
          } else if (prevLine.length > 0 && prevLine.length < 100) {
            title = prevLine;
          }
        }
        
        // Extract code content
        i++;
        while (i < lines.length && !lines[i].startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        
        const code = codeLines.join('\n').trim();
        // Only add if code is substantial (more than just whitespace)
        if (code.length > 10) {
          blocks.push({ title, code, language });
        }
      }
    }

    return blocks;
  }

  private extractSolutions(
    text: string,
  ): Array<{
    question: string;
    code: string;
    language: string;
    description: string;
  }> {
    const solutions: Array<{
      question: string;
      code: string;
      language: string;
      description: string;
    }> = [];

    // Look for various solution patterns
    const patterns = [
      /(?:##|###)\s+(?:Solution|How to|Example|Usage|Implementation)[:\s]+(.*?)\n([\s\S]*?)(?=(?:##|###)|$)/gi,
      /(?:##|###)\s+(.+?)\n([\s\S]*?)```(\w+)?\n([\s\S]*?)```/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let question: string;
        let content: string;
        let codeMatch: RegExpExecArray | null;
        
        if (match.length === 3) {
          // First pattern
          question = match[1].trim();
          content = match[2];
          codeMatch = /```(\w+)?\n([\s\S]*?)\n```/.exec(content);
          
          if (codeMatch) {
            solutions.push({
              question,
              code: codeMatch[2].trim(),
              language: codeMatch[1] || "unknown",
              description: content.split("\n")[0].trim(),
            });
          }
        } else if (match.length === 5) {
          // Second pattern (heading followed by code)
          question = match[1].trim();
          const code = match[4].trim();
          const language = match[3] || "unknown";
          
          if (code.length > 10) {
            solutions.push({
              question,
              code,
              language,
              description: match[2].split('\n')[0].trim() || question,
            });
          }
        }
      }
    }

    return solutions;
  }

  private extractPatterns(
    text: string,
  ): Array<{
    name: string;
    example: string;
    language: string;
    description: string;
  }> {
    const patterns: Array<{
      name: string;
      example: string;
      language: string;
      description: string;
    }> = [];

    // Look for pattern descriptions
    const patternRegex =
      /(?:##|###)\s+Pattern:\s+(.*?)\n([\s\S]*?)(?=(?:##|###)|$)/gi;

    let match;
    while ((match = patternRegex.exec(text)) !== null) {
      const name = match[1].trim();
      const content = match[2];
      const codeMatch = /```(\w+)?\n([\s\S]*?)\n```/.exec(content);

      if (codeMatch) {
        patterns.push({
          name,
          example: codeMatch[2],
          language: codeMatch[1] || "unknown",
          description: content.split("\n")[0].trim(),
        });
      }
    }

    return patterns;
  }

  private parseLessons(
    text: string,
  ): Array<{
    title: string;
    solution: string;
    language: string;
    context: string;
    notes: string;
  }> {
    const lessons: Array<{
      title: string;
      solution: string;
      language: string;
      context: string;
      notes: string;
    }> = [];

    // Parse structured lessons
    const lessonRegex =
      /(?:##|###)\s+(?:Lesson|What I Learned):\s+(.*?)\n([\s\S]*?)(?=(?:##|###)|$)/gi;

    let match;
    while ((match = lessonRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const content = match[2];

      // Try to find code example
      const codeMatch = /```(\w+)?\n([\s\S]*?)\n```/.exec(content);
      const code = codeMatch ? codeMatch[2] : content.split("\n")[0];
      const language = codeMatch ? codeMatch[1] || "unknown" : "unknown";

      lessons.push({
        title,
        solution: code,
        language,
        context: "Legacy project lesson",
        notes: content.split("\n")[0].trim(),
      });
    }

    return lessons;
  }

  private extractDocumentedFunctions(
    text: string,
    language: string,
  ): Array<{ name: string; code: string; docs: string }> {
    const items: Array<{ name: string; code: string; docs: string }> = [];

    if (language === "TypeScript" || language === "JavaScript") {
      // Match JSDoc + function
      const jsDocRegex =
        /(\/\*\*[\s\S]*?\*\/)\s*((?:async\s+)?function\s+\w+[\s\S]*?(?={))/g;
      let match;
      while ((match = jsDocRegex.exec(text)) !== null) {
        items.push({
          name: this.extractFunctionName(match[2]),
          code: match[2].substring(0, 200),
          docs: match[1].trim(),
        });
      }
    } else if (language === "Python") {
      // Match docstrings + def
      const pythonRegex = /("""[\s\S]*?""")\s*(def\s+\w+[\s\S]*?:)/g;
      let match;
      while ((match = pythonRegex.exec(text)) !== null) {
        items.push({
          name: this.extractFunctionName(match[2]),
          code: match[2].substring(0, 200),
          docs: match[1].trim(),
        });
      }
    }

    return items;
  }

  private extractCodePatterns(
    text: string,
    language: string,
  ): Array<{ type: string; code: string }> {
    const patterns: Array<{ type: string; code: string }> = [];

    // Error handling patterns
    if (language === "TypeScript" || language === "JavaScript") {
      if (/try\s*{[\s\S]*?}\s*catch/.test(text)) {
        patterns.push({
          type: "Error Handling",
          code: "try { ... } catch(e) { ... }",
        });
      }
      if (/async\s+function|await\s+/.test(text)) {
        patterns.push({
          type: "Async/Await",
          code: "async function() { await ... }",
        });
      }
    }

    // Common patterns across languages
    if (/class\s+\w+/.test(text)) {
      patterns.push({
        type: "Class Definition",
        code: "class pattern found",
      });
    }

    if (/interface\s+\w+|type\s+\w+\s*=/.test(text)) {
      patterns.push({
        type: "Type Definition",
        code: "interface/type pattern found",
      });
    }

    return patterns;
  }

  private extractFunctionName(text: string): string {
    const match =
      /(?:async\s+)?function\s+(\w+)|(\w+)\s*=\s*(?:async\s*)?\(/.exec(text);
    return match ? match[1] || match[2] : "Unknown Function";
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: { [key: string]: string } = {
      ".ts": "TypeScript",
      ".tsx": "TypeScript",
      ".js": "JavaScript",
      ".jsx": "JavaScript",
      ".py": "Python",
      ".cs": "C#",
      ".java": "Java",
      ".go": "Go",
      ".rs": "Rust",
      ".cpp": "C++",
      ".c": "C",
    };

    return languageMap[ext] || "unknown";
  }

  private isDocumentationFile(filePath: string): boolean {
    const fileName = path.basename(filePath).toLowerCase();
    // Only skip very obvious documentation files without code examples
    // Keep guide, api, tutorial files as they often contain valuable code
    const docFiles = [
      "readme.md",
      "contributing.md",
      "changelog.md",
      "license.md",
      "license.txt",
    ];
    return docFiles.some((doc) => fileName === doc);
  }

  // ========== Metadata Enrichment Methods ==========

  private estimateDifficulty(
    code: string,
  ): "beginner" | "intermediate" | "advanced" | "expert" {
    const lines = code.split("\n").length;
    const complexity = (
      code.match(
        /async|await|Promise|\.then|try|catch|class|interface|generic/g,
      ) || []
    ).length;

    if (lines < 5 || complexity === 0) return "beginner";
    if (lines < 20 || complexity <= 2) return "intermediate";
    if (lines < 50 || complexity <= 5) return "advanced";
    return "expert";
  }

  private extractKeywords(text: string): string[] {
    const keywords = new Set<string>();

    // Extract common programming keywords
    const commonKeywords = [
      "async",
      "await",
      "promise",
      "function",
      "class",
      "interface",
      "type",
      "error",
      "exception",
      "try",
      "catch",
      "throw",
      "return",
      "const",
      "let",
      "import",
      "export",
      "module",
      "require",
      "api",
      "http",
      "request",
      "database",
      "sql",
      "query",
      "validation",
      "security",
      "authentication",
      "render",
      "component",
      "state",
      "props",
      "hook",
      "middleware",
      "decorator",
      "factory",
      "singleton",
      "observer",
      "strategy",
    ];

    const lower = text.toLowerCase();
    commonKeywords.forEach((kw) => {
      if (lower.includes(kw)) {
        keywords.add(kw);
      }
    });

    return Array.from(keywords);
  }

  private detectProblemTypes(code: string): string[] {
    const types = new Set<string>();
    const lower = code.toLowerCase();

    if (/async|await|promise|\.then/i.test(code)) types.add("async");
    if (/try|catch|error|exception|throw/i.test(code))
      types.add("error-handling");
    if (/state|setState|useState|reducer/i.test(code))
      types.add("state-management");
    if (/performance|optimize|cache|memoize/i.test(code))
      types.add("performance");
    if (/test|mock|spy|jest|mocha/i.test(code)) types.add("testing");
    if (/security|encrypt|auth|token|password/i.test(code))
      types.add("security");
    if (/api|fetch|http|request|response/i.test(code))
      types.add("api-integration");
    if (/database|sql|query|connection/i.test(code)) types.add("database");
    if (/loop|iteration|map|filter|reduce/i.test(code)) types.add("iteration");
    if (/race|concurrent|parallel|thread/i.test(code)) types.add("concurrency");

    return Array.from(types);
  }

  private extractConcepts(language: string, code: string): string[] {
    const concepts = new Set<string>();
    const lower = code.toLowerCase();

    // Language-specific concepts
    if (language.match(/TypeScript|JavaScript/i)) {
      if (/async|await/.test(code)) concepts.add("async-await");
      if (/\.then|Promise/.test(code)) concepts.add("promises");
      if (/\[Symbol\.iterator\]|generator|function\*|yield/.test(code))
        concepts.add("generators");
      if (/class.*extends|super/.test(code)) concepts.add("inheritance");
      if (/interface|type.*=/i.test(code)) concepts.add("type-system");
      if (/@|decorator/.test(code)) concepts.add("decorators");
      if (/useEffect|useState|useReducer|useContext/.test(code))
        concepts.add("react-hooks");
    }

    if (language === "Python") {
      if (/async def|await|asyncio/.test(code)) concepts.add("async-await");
      if (/class.*:|super\(\)/.test(code)) concepts.add("inheritance");
      if (/@property|@staticmethod|@classmethod/.test(code))
        concepts.add("decorators");
      if (/def __[a-z]+__/.test(code)) concepts.add("magic-methods");
      if (/lambda/.test(code)) concepts.add("functional-programming");
      if (/with\s+/.test(code)) concepts.add("context-managers");
    }

    if (language === "Java") {
      if (/interface.*\{|implements/.test(code)) concepts.add("interfaces");
      if (/class.*extends/.test(code)) concepts.add("inheritance");
      if (/@Override|@Deprecated/.test(code)) concepts.add("annotations");
      if (/lambda|->|Stream/.test(code)) concepts.add("functional-programming");
    }

    // Universal concepts
    if (
      /design.*pattern|pattern.*design|factory|singleton|observer|strategy/i.test(
        code,
      )
    ) {
      concepts.add("design-patterns");
    }
    if (/recursi/.test(code)) concepts.add("recursion");
    if (/\.\.\.|spread|rest/.test(code)) concepts.add("spread-operator");
    if (/destruct|destructur/.test(code)) concepts.add("destructuring");

    return Array.from(concepts);
  }

  private extractFrameworks(code: string): string[] {
    const frameworks = new Set<string>();
    const lower = code.toLowerCase();

    // JavaScript/TypeScript frameworks
    if (/react|jsx|tsx|useState|useEffect/.test(code)) frameworks.add("react");
    if (/vue|v-if|v-for|defineComponent/.test(code)) frameworks.add("vue");
    if (/angular|@angular|@Component|@Service/.test(code))
      frameworks.add("angular");
    if (/svelte/.test(code)) frameworks.add("svelte");
    if (/express|app\.get|app\.post|router\./.test(code))
      frameworks.add("express");
    if (/next\.js|next\/|getServerSideProps|getStaticProps/.test(code))
      frameworks.add("next.js");
    if (/fastapi|@app\.|@router\./.test(code)) frameworks.add("fastapi");
    if (/django|django\./.test(code)) frameworks.add("django");
    if (/flask|@app\./.test(code)) frameworks.add("flask");
    if (/spring|@SpringBootApplication|@RestController/.test(code))
      frameworks.add("spring");

    return Array.from(frameworks);
  }
}
