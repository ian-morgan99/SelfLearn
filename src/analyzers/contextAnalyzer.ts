import * as vscode from "vscode";
import * as path from "path";
import { LearningManager, Learning } from "../managers/learningManager";

export class ContextAnalyzer {
  private learningManager: LearningManager;
  private context: vscode.ExtensionContext;

  constructor(
    learningManager: LearningManager,
    context: vscode.ExtensionContext,
  ) {
    this.learningManager = learningManager;
    this.context = context;
  }

  public async analyzeProjectContext(): Promise<ProjectContext> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder open");
    }

    const projectPath = workspaceFolder.uri.fsPath;
    const projectName = path.basename(projectPath);

    // Detect project type
    const projectType = await this.detectProjectType(projectPath);

    // Detect languages
    const languages = await this.detectLanguages(projectPath);

    // Detect frameworks/libraries
    const frameworks = await this.detectFrameworks(projectPath);

    // Get recent file types
    const fileTypes = await this.detectFileTypes(projectPath);

    return {
      projectPath,
      projectName,
      projectType,
      languages,
      frameworks,
      fileTypes,
      timestamp: Date.now(),
    };
  }

  private async detectProjectType(projectPath: string): Promise<string> {
    const indicators: { [key: string]: string[] } = {
      node: ["package.json", "node_modules"],
      python: ["requirements.txt", "setup.py", "pipfile", ".venv"],
      dotnet: ["*.csproj", "*.sln"],
      java: ["pom.xml", "build.gradle"],
      rust: ["Cargo.toml"],
      go: ["go.mod"],
      "vscode-extension": ["vscode", "package.json", "tsconfig.json"],
      "dynamics-365": ["Dynamics", "packages", "plugins"],
      "business-central": ["navision.json", "al.json", "app.json"],
      "power-platform": ["solution.xml", "solutions", "connectorref.json"],
      powerapps: ["app.json", "canvas"],
      "azure-functions": ["local.settings.json", "function_app.py"],
      "logic-apps": ["workflow.json", "connections.json"],
    };

    try {
      const files = await vscode.workspace.fs.readDirectory(
        vscode.Uri.file(projectPath),
      );
      const fileNames = files.map((f) => f[0].toLowerCase());

      for (const [type, patterns] of Object.entries(indicators)) {
        if (
          patterns.some((pattern) =>
            fileNames.some((f) =>
              f.includes(pattern.toLowerCase().replace("*.", "")),
            ),
          )
        ) {
          return type;
        }
      }
    } catch (error) {
      console.error("Error detecting project type:", error);
    }

    return "unknown";
  }

  private async detectLanguages(projectPath: string): Promise<string[]> {
    const languages = new Set<string>();
    const extensionMap: { [key: string]: string } = {
      ts: "TypeScript",
      tsx: "TypeScript",
      js: "JavaScript",
      jsx: "JavaScript",
      py: "Python",
      cs: "C#",
      java: "Java",
      go: "Go",
      rs: "Rust",
      cpp: "C++",
      c: "C",
      sh: "Shell",
      json: "JSON",
      yaml: "YAML",
      yml: "YAML",
      html: "HTML",
      css: "CSS",
      scss: "SCSS",
      sql: "SQL",
      pq: "Power Query",
      dax: "DAX",
      ps1: "PowerShell",
      bicep: "Bicep",
      kql: "KQL",
      xml: "XML",
    };

    try {
      const findFiles = await vscode.workspace.findFiles(
        "**/*.{ts,tsx,js,jsx,py,cs,java,go,rs,cpp,c,pq,dax,ps1,bicep,kql}",
        "**/node_modules/**",
        100,
      );

      findFiles.forEach((file) => {
        const ext = file.fsPath.split(".").pop()?.toLowerCase();
        if (ext && extensionMap[ext]) {
          languages.add(extensionMap[ext]);
        }
      });
    } catch (error) {
      console.error("Error detecting languages:", error);
    }

    return Array.from(languages);
  }

  private async detectFrameworks(projectPath: string): Promise<string[]> {
    const frameworks: string[] = [];

    try {
      // Check package.json for Node/npm frameworks
      try {
        const packageJsonUri = vscode.Uri.file(
          path.join(projectPath, "package.json"),
        );
        const data = await vscode.workspace.fs.readFile(packageJsonUri);
        const packageJson = JSON.parse(new TextDecoder().decode(data));

        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        const frameworkKeywords = [
          // Frontend frameworks
          "react",
          "vue",
          "angular",
          "svelte",
          "next",
          "nuxt",
          "remix",
          // Backend frameworks
          "express",
          "nestjs",
          "fastify",
          "koa",
          // Python frameworks
          "django",
          "flask",
          "fastapi",
          // Java/Spring
          "spring",
          "hibernate",
          // Microsoft & Azure
          "dotnet",
          "asp.net",
          "@azure",
          // Power Platform connectors
          "@microsoft",
          "dynamics",
        ];

        frameworkKeywords.forEach((keyword) => {
          if (
            Object.keys(deps).some((dep) => dep.toLowerCase().includes(keyword))
          ) {
            frameworks.push(keyword);
          }
        });
      } catch (e) {
        // package.json not found, continue
      }

      // Check project files for Microsoft-specific frameworks
      const projectFiles = await vscode.workspace.findFiles(
        "**/*",
        "**/node_modules/**",
        100,
      );
      const fileNames = projectFiles.map((f) => f.fsPath.toLowerCase());

      // Detect Business Central
      if (
        fileNames.some(
          (f) =>
            f.includes("app.json") ||
            f.includes("navision") ||
            f.includes(".al"),
        )
      ) {
        frameworks.push("Business Central");
      }

      // Detect Dynamics 365 / Customer Engagement
      if (
        fileNames.some(
          (f) =>
            f.includes("plugins") ||
            f.includes("dynamics") ||
            f.includes("solution.xml"),
        )
      ) {
        frameworks.push("Dynamics 365");
      }

      // Detect Power Platform
      if (
        fileNames.some(
          (f) =>
            f.includes("solution") ||
            f.includes("connectorref") ||
            f.includes("workflow.json"),
        )
      ) {
        frameworks.push("Power Platform");
      }

      // Detect PowerApps
      if (
        fileNames.some(
          (f) => f.includes("canvas") || f.includes("model-driven"),
        )
      ) {
        frameworks.push("PowerApps");
      }

      // Detect Azure Functions
      if (
        fileNames.some(
          (f) =>
            f.includes("local.settings.json") || f.includes("function_app"),
        )
      ) {
        frameworks.push("Azure Functions");
      }

      // Detect Logic Apps
      if (
        fileNames.some(
          (f) => f.includes("workflow.json") || f.includes("connections.json"),
        )
      ) {
        frameworks.push("Logic Apps");
      }

      // Detect Finance & Operations / Supply Chain
      if (
        fileNames.some(
          (f) => f.includes("axmodelstore") || f.includes("metadata"),
        )
      ) {
        frameworks.push("Finance & Supply Chain");
      }

      // Detect Power BI
      if (
        fileNames.some(
          (f) =>
            f.includes(".pbix") ||
            f.includes(".pbit") ||
            f.includes("pbidataset"),
        )
      ) {
        frameworks.push("Power BI");
      }

      // Detect Copilot Studio / Bot Framework
      if (
        fileNames.some(
          (f) =>
            f.includes("bot") ||
            f.includes("botframework") ||
            f.includes("manifest.json"),
        )
      ) {
        frameworks.push("Copilot Studio");
      }
    } catch (error) {
      console.error("Error detecting frameworks:", error);
    }

    return Array.from(new Set(frameworks)); // Remove duplicates
  }

  private async detectFileTypes(projectPath: string): Promise<string[]> {
    const fileTypes = new Set<string>();

    try {
      const files = await vscode.workspace.findFiles(
        "**/*",
        "**/node_modules/**",
        50,
      );

      files.forEach((file) => {
        const ext = file.fsPath.split(".").pop()?.toLowerCase();
        if (ext) {
          fileTypes.add(ext);
        }
      });
    } catch (error) {
      console.error("Error detecting file types:", error);
    }

    return Array.from(fileTypes);
  }

  public findRelevantLearnings(
    projectContext: ProjectContext,
  ): Promise<Learning[]> {
    const relevanceScore: Map<string, number> = new Map();

    return this.learningManager.getAllLearnings().then((learnings) => {
      const scored = learnings.map((learning) => {
        let score = 0;

        // Language match
        if (projectContext.languages.includes(learning.language)) {
          score += 30;
        }

        // Project type match
        if (
          learning.tags.some((tag) => projectContext.projectType.includes(tag))
        ) {
          score += 20;
        }

        // Framework match
        if (
          projectContext.frameworks.some((fw) =>
            learning.tags.some((tag) =>
              tag.toLowerCase().includes(fw.toLowerCase()),
            ),
          )
        ) {
          score += 25;
        }

        // File type match
        if (
          projectContext.fileTypes.some((ft) =>
            learning.tags.includes(ft.toLowerCase()),
          )
        ) {
          score += 15;
        }

        // Recency bonus
        const daysSince =
          (Date.now() - learning.timestamp) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          score += 10;
        }

        // Success bonus
        if (learning.outcome === "success") {
          score += 20;
        } else if (learning.outcome === "partial") {
          score += 5;
        }

        return { learning, score };
      });

      return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10)
        .map((s) => s.learning);
    });
  }
}

export interface ProjectContext {
  projectPath: string;
  projectName: string;
  projectType: string;
  languages: string[];
  frameworks: string[];
  fileTypes: string[];
  timestamp: number;
}
