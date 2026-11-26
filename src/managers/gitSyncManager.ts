import * as vscode from "vscode";
import * as path from "path";
import { execSync } from "child_process";
import { SecureStorageManager } from "./secureStorageManager";
import { GitHubAPIManager } from "./gitHubAPIManager";

export class GitSyncManager {
  private context: vscode.ExtensionContext;
  private enableGitHubSync: boolean = false;
  private autoCommit: boolean = true;
  private autoPush: boolean = false;
  private syncBranch: string = "main";
  private enablePrivateGitHubRepo: boolean = false;
  private gitHubRepoUrl: string = "";
  private secureStorage: SecureStorageManager;
  private gitHubAPI: GitHubAPIManager;

  constructor(
    context: vscode.ExtensionContext,
    secureStorage: SecureStorageManager,
  ) {
    this.context = context;
    this.secureStorage = secureStorage;
    this.gitHubAPI = new GitHubAPIManager(secureStorage);
    this.updateConfig();
  }

  public updateConfig(): void {
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    this.enableGitHubSync = config.get("enableGitHubSync", false);
    this.autoCommit = config.get("gitHubAutoCommit", true);
    this.autoPush = config.get("gitHubAutoPush", false);
    this.syncBranch = config.get("gitHubSyncBranch", "main");
    this.enablePrivateGitHubRepo = config.get("enablePrivateGitHubRepo", false);
    this.gitHubRepoUrl = config.get("gitHubRepoUrl", "");
  }

  /**
   * Check if the current workspace is a git repository
   */
  public async isGitRepository(workspacePath: string): Promise<boolean> {
    try {
      execSync("git rev-parse --git-dir", {
        cwd: workspacePath,
        stdio: "pipe",
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the git repository root path
   */
  public async getRepositoryRoot(
    workspacePath: string,
  ): Promise<string | null> {
    try {
      const result = execSync("git rev-parse --show-toplevel", {
        cwd: workspacePath,
        stdio: "pipe",
        encoding: "utf8",
      });
      return result.trim();
    } catch {
      return null;
    }
  }

  /**
   * Stage and commit learnings.json if it has changed
   */
  public async syncLearningsToGit(learningsPath: string): Promise<boolean> {
    if (!this.enableGitHubSync) {
      return false;
    }

    try {
      const workspacePath =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || ".";
      const isGitRepo = await this.isGitRepository(workspacePath);

      if (!isGitRepo) {
        console.log("Not a git repository, skipping git sync");
        return false;
      }

      const repoRoot = await this.getRepositoryRoot(workspacePath);
      if (!repoRoot) {
        return false;
      }

      // Get relative path from git root to learnings file
      const relativePath = path.relative(repoRoot, learningsPath);

      // Check if file has changes
      const hasChanges = await this.hasChanges(relativePath, repoRoot);
      if (!hasChanges) {
        return false;
      }

      // Stage the file
      if (this.autoCommit) {
        execSync(`git add "${relativePath}"`, { cwd: repoRoot, stdio: "pipe" });

        // Commit with timestamp
        const timestamp = new Date().toISOString();
        const commitMessage = `chore: sync learnings - ${timestamp}`;

        try {
          execSync(`git commit -m "${commitMessage}"`, {
            cwd: repoRoot,
            stdio: "pipe",
          });
          console.log(`Git commit successful: ${commitMessage}`);

          // Push if enabled
          if (this.autoPush) {
            try {
              execSync(`git push origin ${this.syncBranch}`, {
                cwd: repoRoot,
                stdio: "pipe",
              });
              console.log(`Git push successful to ${this.syncBranch}`);
              vscode.window.showInformationMessage(
                "Learnings synced and pushed to GitHub",
              );
            } catch (pushError) {
              console.warn("Failed to push to git:", pushError);
              vscode.window.showWarningMessage(
                "Learnings committed but failed to push to GitHub",
              );
            }
          } else {
            vscode.window.showInformationMessage("Learnings committed to Git");
          }

          return true;
        } catch (commitError) {
          console.warn("Failed to commit to git:", commitError);
          // This might happen if there are no changes to commit
          return false;
        }
      }

      return false;
    } catch (error) {
      console.warn("Git sync error:", error);
      return false;
    }
  }

  /**
   * Check if a file has uncommitted changes
   */
  private async hasChanges(
    filePath: string,
    repoRoot: string,
  ): Promise<boolean> {
    try {
      // Check both staged and unstaged changes
      const statusOutput = execSync(`git status --porcelain "${filePath}"`, {
        cwd: repoRoot,
        stdio: "pipe",
        encoding: "utf8",
      });

      return statusOutput.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Pull latest changes from git
   */
  public async pullLatestLearnings(workspacePath: string): Promise<boolean> {
    if (!this.enableGitHubSync) {
      return false;
    }

    try {
      const isGitRepo = await this.isGitRepository(workspacePath);
      if (!isGitRepo) {
        return false;
      }

      const repoRoot = await this.getRepositoryRoot(workspacePath);
      if (!repoRoot) {
        return false;
      }

      // Fetch and pull
      execSync("git fetch origin", { cwd: repoRoot, stdio: "pipe" });
      execSync(`git pull origin ${this.syncBranch}`, {
        cwd: repoRoot,
        stdio: "pipe",
      });

      console.log("Successfully pulled latest learnings from Git");
      return true;
    } catch (error) {
      console.warn("Failed to pull from git:", error);
      return false;
    }
  }

  /**
   * Get secure storage reference
   */
  public getSecureStorage(): SecureStorageManager {
    return this.secureStorage;
  }

  /**
   * Setup private GitHub repository
   * Validates token, creates repo if needed, and configures git remote
   */
  public async setupPrivateGitHubRepository(token: string): Promise<{
    success: boolean;
    message: string;
    repoUrl?: string;
  }> {
    try {
      // Validate token
      const user = await this.gitHubAPI.validateToken(token);
      if (!user) {
        return {
          success: false,
          message:
            "Invalid GitHub token. Please check your personal access token.",
        };
      }

      console.log(`GitHub authentication successful for user: ${user.login}`);

      // Store token securely
      await this.secureStorage.setGitHubToken(token);

      // Check if repo URL is configured
      if (!this.gitHubRepoUrl || !this.gitHubRepoUrl.trim()) {
        // Auto-create if enabled
        const config = vscode.workspace.getConfiguration("ai-learning-repo");
        const autoCreate = config.get("gitHubAutoCreateRepo", false);

        if (autoCreate) {
          const description = config.get(
            "gitHubRepositoryDescription",
            "AI Learning Repository",
          );
          const repo = await this.gitHubAPI.createPrivateRepository(
            token,
            "ai-learnings",
            description,
          );

          if (repo) {
            // Update config with new repo URL
            await config.update(
              "gitHubRepoUrl",
              `https://github.com/${repo.owner}/${repo.repo}`,
              vscode.ConfigurationTarget.Global,
            );
            this.gitHubRepoUrl = `https://github.com/${repo.owner}/${repo.repo}`;

            return {
              success: true,
              message: `Private repository created successfully: ${repo.url}`,
              repoUrl: repo.url,
            };
          } else {
            return {
              success: false,
              message: "Failed to create private repository",
            };
          }
        }

        return {
          success: false,
          message:
            "No repository configured. Please set gitHubRepoUrl or enable auto-creation.",
        };
      }

      // Validate existing repo
      const parsed = this.gitHubAPI.parseRepositoryUrl(this.gitHubRepoUrl);
      if (!parsed) {
        return {
          success: false,
          message: "Invalid repository URL format",
        };
      }

      const hasAccess = await this.gitHubAPI.hasRepositoryAccess(
        parsed.owner,
        parsed.repo,
        token,
      );

      if (!hasAccess) {
        return {
          success: false,
          message: `No push access to repository: ${this.gitHubRepoUrl}`,
        };
      }

      return {
        success: true,
        message: `Successfully authenticated with repository: ${this.gitHubRepoUrl}`,
        repoUrl: `https://github.com/${parsed.owner}/${parsed.repo}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Setup failed: ${error}`,
      };
    }
  }

  /**
   * Check private GitHub repo status
   */
  public async checkPrivateRepoStatus(): Promise<{
    configured: boolean;
    authenticated: boolean;
    hasAccess: boolean;
    repoUrl?: string;
  }> {
    const configured =
      !!this.gitHubRepoUrl && this.gitHubRepoUrl.trim().length > 0;
    const hasToken = await this.secureStorage.hasGitHubToken();

    if (!configured || !hasToken) {
      return {
        configured,
        authenticated: false,
        hasAccess: false,
      };
    }

    const token = await this.secureStorage.getGitHubToken();
    if (!token) {
      return {
        configured,
        authenticated: false,
        hasAccess: false,
      };
    }

    const parsed = this.gitHubAPI.parseRepositoryUrl(this.gitHubRepoUrl);
    if (!parsed) {
      return {
        configured,
        authenticated: false,
        hasAccess: false,
      };
    }

    const hasAccess = await this.gitHubAPI.hasRepositoryAccess(
      parsed.owner,
      parsed.repo,
      token,
    );

    return {
      configured,
      authenticated: true,
      hasAccess,
      repoUrl: this.gitHubRepoUrl,
    };
  }

  /**
   * Configure git remote for private repo
   */
  public async configurePrivateRepoRemote(
    workspacePath: string,
  ): Promise<boolean> {
    if (!this.gitHubRepoUrl) {
      return false;
    }

    try {
      const token = await this.secureStorage.getGitHubToken();
      if (!token) {
        console.warn("No GitHub token available");
        return false;
      }

      // Check if already a git repo
      const isGitRepo = await this.isGitRepository(workspacePath);
      if (!isGitRepo) {
        // Initialize git repo
        try {
          execSync("git init", { cwd: workspacePath, stdio: "pipe" });
          execSync('git config user.email "ai-learning-repo@local"', {
            cwd: workspacePath,
            stdio: "pipe",
          });
          execSync('git config user.name "AI Learning Repository"', {
            cwd: workspacePath,
            stdio: "pipe",
          });
        } catch (e) {
          console.warn("Failed to initialize git repo:", e);
          return false;
        }
      }

      // Add remote with token (for authentication)
      const repoUrl = this.gitHubRepoUrl;
      const urlWithToken = repoUrl.replace(
        "https://github.com/",
        `https://x-access-token:${token}@github.com/`,
      );

      try {
        // Remove existing origin if present
        execSync("git remote remove origin 2>/dev/null || true", {
          cwd: workspacePath,
          shell: "/bin/bash",
          stdio: "pipe",
        });
      } catch {
        // Ignore if remote doesn't exist
      }

      // Add new remote
      execSync(`git remote add origin "${urlWithToken}"`, {
        cwd: workspacePath,
        stdio: "pipe",
      });

      console.log("Git remote configured for private repository");
      return true;
    } catch (error) {
      console.warn("Failed to configure private repo remote:", error);
      return false;
    }
  }

  /**
   * Get git status summary
   */
  public async getGitStatus(workspacePath: string): Promise<{
    isGitRepo: boolean;
    branch?: string;
    hasChanges: boolean;
    stagedChanges: number;
    unstagedChanges: number;
  }> {
    const isGitRepo = await this.isGitRepository(workspacePath);

    if (!isGitRepo) {
      return {
        isGitRepo: false,
        hasChanges: false,
        stagedChanges: 0,
        unstagedChanges: 0,
      };
    }

    try {
      const repoRoot = await this.getRepositoryRoot(workspacePath);
      if (!repoRoot) {
        return {
          isGitRepo: true,
          hasChanges: false,
          stagedChanges: 0,
          unstagedChanges: 0,
        };
      }

      // Get current branch
      const branchOutput = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd: repoRoot,
        stdio: "pipe",
        encoding: "utf8",
      });
      const branch = branchOutput.trim();

      // Get status
      const statusOutput = execSync("git status --porcelain", {
        cwd: repoRoot,
        stdio: "pipe",
        encoding: "utf8",
      });

      const lines = statusOutput
        .trim()
        .split("\n")
        .filter((l) => l);
      const staged = lines.filter((l) => l.match(/^[MADRC]/)).length;
      const unstaged = lines.filter((l) => l.match(/^.[MADRC]/)).length;

      return {
        isGitRepo: true,
        branch,
        hasChanges: lines.length > 0,
        stagedChanges: staged,
        unstagedChanges: unstaged,
      };
    } catch {
      return {
        isGitRepo: true,
        hasChanges: false,
        stagedChanges: 0,
        unstagedChanges: 0,
      };
    }
  }
}
