import * as vscode from "vscode";
import { LearningManager, Learning } from "../managers/learningManager";

export class LearningsTreeProvider implements vscode.TreeDataProvider<LearningTreeItem> {
  private learningManager: LearningManager;
  private _onDidChangeTreeData: vscode.EventEmitter<
    LearningTreeItem | undefined | null | void
  > = new vscode.EventEmitter<LearningTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    LearningTreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(learningManager: LearningManager) {
    this.learningManager = learningManager;
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: LearningTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: LearningTreeItem): Promise<LearningTreeItem[]> {
    if (!element) {
      // Root level - Load index only (fast) to show categories
      const index = await this.learningManager.getStorageIndex();

      if (index.totalLearnings === 0) {
        return [
          new LearningTreeItem(
            "No learnings yet",
            "Start coding with AI to build your learning repository",
            vscode.TreeItemCollapsibleState.None,
          ),
        ];
      }

      // Show languages from index with counts
      const categories: LearningTreeItem[] = [];

      index.languages.forEach((lang) => {
        const count = index.byLanguageCount[lang] || 0;
        categories.push(
          new LearningTreeItem(
            `${lang}`,
            `${count} learning${count !== 1 ? "s" : ""}`,
            vscode.TreeItemCollapsibleState.Collapsed,
            lang,
          ),
        );
      });

      return categories;
    } else {
      // Lazy load: Only load learnings for the expanded language
      const learnings = await this.learningManager.loadLearningsByLanguage(
        element.label as string,
      );
      return learnings
        .slice(-20) // Show last 20
        .reverse()
        .map(
          (learning) =>
            new LearningTreeItem(
              `${learning.question.substring(0, 50)}...`,
              learning.id,
              vscode.TreeItemCollapsibleState.None,
              undefined,
              learning,
            ),
        );
    }
  }

  async getParent(element: LearningTreeItem): Promise<LearningTreeItem | null> {
    return null;
  }
}

export class LearningTreeItem extends vscode.TreeItem {
  public readonly learning?: Learning;
  private readonly languageCategory?: string;

  constructor(
    public readonly label: string,
    public readonly description: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    languageCategory?: string,
    learning?: Learning,
  ) {
    super(label, collapsibleState);
    this.description = description;
    this.learning = learning;
    this.languageCategory = languageCategory;

    if (learning) {
      this.tooltip = `Question: ${learning.question}\n\nOutcome: ${learning.outcome}\n\nDate: ${new Date(learning.timestamp).toLocaleString()}`;
      this.command = {
        command: "ai-learning-repo.viewLearnings",
        title: "View Learning",
        arguments: [learning],
      };
    }

    this.iconPath = this.getIconPath();
  }

  private getIconPath(): vscode.ThemeIcon | undefined {
    if (this.learning) {
      switch (this.learning.outcome) {
        case "success":
          return new vscode.ThemeIcon("check");
        case "partial":
          return new vscode.ThemeIcon("warning");
        case "failed":
          return new vscode.ThemeIcon("error");
        default:
          return new vscode.ThemeIcon("question");
      }
    }

    return new vscode.ThemeIcon("folder");
  }
}
