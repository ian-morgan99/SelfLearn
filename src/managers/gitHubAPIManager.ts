import * as vscode from "vscode";
import { SecureStorageManager } from "./secureStorageManager";

export interface GitHubRepo {
  owner: string;
  repo: string;
  url: string;
  private: boolean;
  defaultBranch: string;
}

export interface GitHubUser {
  login: string;
  id: number;
  name?: string;
}

/**
 * Manages GitHub API interactions for private repo management
 * Uses personal access tokens for secure authentication
 * All credentials are stored securely and never logged
 */
export class GitHubAPIManager {
  private static readonly GITHUB_API_BASE = "https://api.github.com";
  private secureStorage: SecureStorageManager;

  constructor(secureStorage: SecureStorageManager) {
    this.secureStorage = secureStorage;
  }

  /**
   * Validate GitHub token and get user info
   */
  public async validateToken(token: string): Promise<GitHubUser | null> {
    try {
      const response = await fetch(`${GitHubAPIManager.GITHUB_API_BASE}/user`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      if (!response.ok) {
        console.warn(`GitHub API error: ${response.status}`);
        return null;
      }

      const user = (await response.json()) as any;
      return {
        login: user.login,
        id: user.id,
        name: user.name,
      };
    } catch (error) {
      console.warn("Failed to validate GitHub token:", error);
      return null;
    }
  }

  /**
   * Get repository information
   * @param owner Repository owner (username or organization)
   * @param repo Repository name
   * @param token GitHub personal access token
   */
  public async getRepository(
    owner: string,
    repo: string,
    token: string,
  ): Promise<GitHubRepo | null> {
    try {
      const response = await fetch(
        `${GitHubAPIManager.GITHUB_API_BASE}/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        console.warn(`GitHub repo not found: ${owner}/${repo}`);
        return null;
      }

      const data = (await response.json()) as any;
      return {
        owner: data.owner.login,
        repo: data.name,
        url: data.html_url,
        private: data.private,
        defaultBranch: data.default_branch,
      };
    } catch (error) {
      console.warn("Failed to get repository:", error);
      return null;
    }
  }

  /**
   * Create a new private repository for learnings
   * @param token GitHub personal access token
   * @param repoName Name for the repository
   * @param description Repository description
   */
  public async createPrivateRepository(
    token: string,
    repoName: string = "ai-learnings",
    description: string = "Private AI learning repository",
  ): Promise<GitHubRepo | null> {
    try {
      const response = await fetch(
        `${GitHubAPIManager.GITHUB_API_BASE}/user/repos`,
        {
          method: "POST",
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: repoName,
            description: description,
            private: true, // ALWAYS private for security
            auto_init: true, // Initialize with README
            gitignore_template: "VisualStudio",
            license_template: "mit",
            topics: ["ai", "learnings", "copilot", "coding"],
          }),
        },
      );

      if (!response.ok) {
        const error = (await response.json()) as any;
        console.warn(`Failed to create repository: ${error.message}`);
        return null;
      }

      const data = (await response.json()) as any;
      return {
        owner: data.owner.login,
        repo: data.name,
        url: data.html_url,
        private: data.private,
        defaultBranch: data.default_branch,
      };
    } catch (error) {
      console.warn("Failed to create repository:", error);
      return null;
    }
  }

  /**
   * Check if user has access to a repository
   */
  public async hasRepositoryAccess(
    owner: string,
    repo: string,
    token: string,
  ): Promise<boolean> {
    try {
      const response = await fetch(
        `${GitHubAPIManager.GITHUB_API_BASE}/repos/${owner}/${repo}`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        return false;
      }

      // Also check if we have push access
      const data = (await response.json()) as any;
      return (
        data.permissions && (data.permissions.push || data.permissions.admin)
      );
    } catch {
      return false;
    }
  }

  /**
   * Parse GitHub repository URL to get owner and repo name
   * Supports formats:
   *   - https://github.com/owner/repo
   *   - https://github.com/owner/repo.git
   *   - git@github.com:owner/repo.git
   *   - owner/repo
   */
  public parseRepositoryUrl(
    url: string,
  ): { owner: string; repo: string } | null {
    try {
      // Handle owner/repo format
      if (
        !url.includes("/") ||
        (!url.includes("github.com") && !url.includes("@"))
      ) {
        const parts = url.split("/").filter((p) => p);
        if (parts.length === 2) {
          return { owner: parts[0], repo: parts[1] };
        }
      }

      // Handle https://github.com/owner/repo or https://github.com/owner/repo.git
      const httpsMatch = url.match(
        /https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/,
      );
      if (httpsMatch) {
        return { owner: httpsMatch[1], repo: httpsMatch[2] };
      }

      // Handle git@github.com:owner/repo or git@github.com:owner/repo.git
      const sshMatch = url.match(
        /git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/,
      );
      if (sshMatch) {
        return { owner: sshMatch[1], repo: sshMatch[2] };
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Get rate limit status
   */
  public async getRateLimit(token: string): Promise<{
    remaining: number;
    limit: number;
    resetTime: Date;
  } | null> {
    try {
      const response = await fetch(
        `${GitHubAPIManager.GITHUB_API_BASE}/rate_limit`,
        {
          headers: {
            Authorization: `token ${token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as any;
      return {
        remaining: data.resources.core.remaining,
        limit: data.resources.core.limit,
        resetTime: new Date(data.resources.core.reset * 1000),
      };
    } catch {
      return null;
    }
  }
}
