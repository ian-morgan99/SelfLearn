import * as vscode from "vscode";

/**
 * Manages secure storage of credentials using VS Code's SecretStorage API
 * This ensures sensitive data like GitHub tokens are encrypted and never logged
 */
export class SecureStorageManager {
  private static readonly PREFIX = "ai-learning-repo.";
  private static readonly GITHUB_TOKEN_KEY = `${SecureStorageManager.PREFIX}github-token`;
  private static readonly GITHUB_REPO_KEY = `${SecureStorageManager.PREFIX}github-repo`;
  private static readonly ENCRYPTION_KEY = `${SecureStorageManager.PREFIX}encryption-key`;
  private static readonly LICENSE_KEY = `${SecureStorageManager.PREFIX}license-key`;

  constructor(private secretStorage: vscode.SecretStorage) {}

  /**
   * Store GitHub personal access token securely
   * @param token The GitHub PAT - stored encrypted by VS Code
   */
  public async setGitHubToken(token: string): Promise<void> {
    if (!token || token.trim() === "") {
      await this.secretStorage.delete(SecureStorageManager.GITHUB_TOKEN_KEY);
      return;
    }
    await this.secretStorage.store(
      SecureStorageManager.GITHUB_TOKEN_KEY,
      token,
    );
  }

  /**
   * Retrieve GitHub token from secure storage
   * @returns The GitHub PAT or undefined if not set
   */
  public async getGitHubToken(): Promise<string | undefined> {
    return await this.secretStorage.get(SecureStorageManager.GITHUB_TOKEN_KEY);
  }

  /**
   * Check if GitHub token is configured
   */
  public async hasGitHubToken(): Promise<boolean> {
    const token = await this.getGitHubToken();
    return !!token && token.trim().length > 0;
  }

  /**
   * Clear GitHub token from storage
   */
  public async clearGitHubToken(): Promise<void> {
    await this.secretStorage.delete(SecureStorageManager.GITHUB_TOKEN_KEY);
  }

  public async setLicenseKey(key: string): Promise<void> {
    if (!key || key.trim() === "") {
      await this.secretStorage.delete(SecureStorageManager.LICENSE_KEY);
      return;
    }

    await this.secretStorage.store(SecureStorageManager.LICENSE_KEY, key);
  }

  public async getLicenseKey(): Promise<string | undefined> {
    return await this.secretStorage.get(SecureStorageManager.LICENSE_KEY);
  }

  public async hasLicenseKey(): Promise<boolean> {
    const key = await this.getLicenseKey();
    return !!key && key.trim().length > 0;
  }

  public async clearLicenseKey(): Promise<void> {
    await this.secretStorage.delete(SecureStorageManager.LICENSE_KEY);
  }

  /**
   * Store encrypted learnings data (future use)
   */
  public async setEncryptedData(key: string, data: string): Promise<void> {
    await this.secretStorage.store(
      `${SecureStorageManager.PREFIX}${key}`,
      data,
    );
  }

  /**
   * Retrieve encrypted data
   */
  public async getEncryptedData(key: string): Promise<string | undefined> {
    return await this.secretStorage.get(`${SecureStorageManager.PREFIX}${key}`);
  }

  /**
   * Clear all sensitive data
   */
  public async clearAll(): Promise<void> {
    // Note: VS Code's SecretStorage doesn't provide a way to list all keys,
    // so we clear only the known keys
    await this.secretStorage.delete(SecureStorageManager.GITHUB_TOKEN_KEY);
    await this.secretStorage.delete(SecureStorageManager.GITHUB_REPO_KEY);
    await this.secretStorage.delete(SecureStorageManager.ENCRYPTION_KEY);
    await this.secretStorage.delete(SecureStorageManager.LICENSE_KEY);
  }
}
