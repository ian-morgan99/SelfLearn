import * as https from "https";
import * as vscode from "vscode";
import { ConfigurationManager } from "./configurationManager";
import { SecureStorageManager } from "./secureStorageManager";

type LicenseStatus = "free" | "trial" | "licensed";
type LicensePlan = "free" | "pro" | "enterprise";

interface LicenseState {
  status: LicenseStatus;
  plan: LicensePlan;
  expiresAt?: number;
  lastChecked?: number;
  nextCheckAt?: number;
  lastError?: string;
}

interface LicenseVerifyResponse {
  valid?: boolean;
  status?: LicenseStatus;
  plan?: LicensePlan;
  expiresAt?: number;
  nextCheckAt?: number;
  message?: string;
}

export class LicenseManager {
  private static readonly GRACE_PERIOD_DAYS = 14;
  private static readonly CHECK_INTERVAL_HOURS = 24;
  private static readonly DEV_MASTER_KEY = "DEV-ONLY-OVERRIDE";
  private static readonly STATE_KEYS = {
    status: "ai-learning-repo.license.status",
    plan: "ai-learning-repo.license.plan",
    expiresAt: "ai-learning-repo.license.expiresAt",
    lastChecked: "ai-learning-repo.license.lastChecked",
    nextCheckAt: "ai-learning-repo.license.nextCheckAt",
    lastError: "ai-learning-repo.license.lastError",
    prodOverrideEnabled: "ai-learning-repo.license.prodOverrideEnabled",
    prodOverrideKey: "ai-learning-repo.license.prodOverrideKey",
  } as const;

  constructor(
    private context: vscode.ExtensionContext,
    private secureStorage: SecureStorageManager,
  ) {}

  public async verifyLicense(options?: {
    force?: boolean;
  }): Promise<LicenseState> {
    const licenseKey = await this.secureStorage.getLicenseKey();
    const state = await this.getState();
    const now = Date.now();

    if (licenseKey && this.isDevOverrideKey(licenseKey)) {
      const devState: LicenseState = {
        status: "licensed",
        plan: "pro",
        lastChecked: now,
        nextCheckAt: now + LicenseManager.CHECK_INTERVAL_HOURS * 60 * 60 * 1000,
        lastError: undefined,
      };
      await this.updateState(devState);
      return devState;
    }

    if (licenseKey && this.isProdOverrideKey(licenseKey)) {
      const prodState: LicenseState = {
        status: "licensed",
        plan: "pro",
        lastChecked: now,
        nextCheckAt: now + LicenseManager.CHECK_INTERVAL_HOURS * 60 * 60 * 1000,
        lastError: undefined,
      };
      await this.updateState(prodState);
      return prodState;
    }

    if (!licenseKey) {
      const freeState: LicenseState = {
        status: "free",
        plan: "free",
        lastError: undefined,
      };
      await this.updateState(freeState);
      return freeState;
    }

    if (
      !options?.force &&
      state.status === "licensed" &&
      state.nextCheckAt &&
      now < state.nextCheckAt
    ) {
      return state;
    }

    const verificationUrl = this.getVerificationUrl();
    if (!verificationUrl) {
      const degraded = {
        ...state,
        lastError: "License verification URL is not configured.",
      };
      return await this.applyGraceOrFree(degraded, now);
    }

    try {
      const response = await this.callVerifyEndpoint(
        verificationUrl,
        licenseKey,
      );
      const normalized = this.normalizeResponse(response);
      const updated: LicenseState = {
        status: normalized.status,
        plan: normalized.plan,
        expiresAt: normalized.expiresAt,
        lastChecked: now,
        nextCheckAt:
          normalized.nextCheckAt ??
          now + LicenseManager.CHECK_INTERVAL_HOURS * 60 * 60 * 1000,
        lastError: normalized.message,
      };

      await this.updateState(updated);
      return updated;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const degraded = {
        ...state,
        lastError: message,
      };
      return await this.applyGraceOrFree(degraded, now);
    }
  }

  private isDevOverrideKey(key: string): boolean {
    if (this.context.extensionMode === vscode.ExtensionMode.Production) {
      return false;
    }

    return key.trim() === LicenseManager.DEV_MASTER_KEY;
  }

  private isProdOverrideKey(key: string): boolean {
    if (this.context.extensionMode !== vscode.ExtensionMode.Production) {
      return false;
    }

    const enabled =
      this.context.globalState.get<boolean>(
        LicenseManager.STATE_KEYS.prodOverrideEnabled,
      ) ?? false;
    const overrideKey =
      this.context.globalState.get<string>(
        LicenseManager.STATE_KEYS.prodOverrideKey,
      ) ?? "";

    if (!enabled || !overrideKey.trim()) {
      return false;
    }

    return key.trim() === overrideKey.trim();
  }

  public async setLicenseKey(key: string): Promise<LicenseState> {
    await this.secureStorage.setLicenseKey(key);
    return await this.verifyLicense({ force: true });
  }

  public async enableTestingOverride(
    overrideKey?: string,
  ): Promise<LicenseState> {
    if (this.context.extensionMode === vscode.ExtensionMode.Production) {
      const normalizedKey = overrideKey?.trim();
      if (!normalizedKey) {
        throw new Error(
          "A temporary override key is required in production mode.",
        );
      }

      await this.context.globalState.update(
        LicenseManager.STATE_KEYS.prodOverrideEnabled,
        true,
      );
      await this.context.globalState.update(
        LicenseManager.STATE_KEYS.prodOverrideKey,
        normalizedKey,
      );

      return await this.setLicenseKey(normalizedKey);
    }

    return await this.setLicenseKey(LicenseManager.DEV_MASTER_KEY);
  }

  public async clearLicenseKey(): Promise<void> {
    await this.secureStorage.clearLicenseKey();
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.prodOverrideEnabled,
      undefined,
    );
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.prodOverrideKey,
      undefined,
    );
    await this.updateState({
      status: "free",
      plan: "free",
      lastError: undefined,
    });
  }

  public async checkProAccess(): Promise<{
    allowed: boolean;
    state: LicenseState;
    reason?: string;
  }> {
    const state = await this.verifyLicense();
    const now = Date.now();

    if (state.status === "free") {
      return { allowed: false, state, reason: "No license" };
    }

    if (state.expiresAt && now > state.expiresAt) {
      if (!this.isWithinGrace(state, now)) {
        return { allowed: false, state, reason: "License expired" };
      }
    }

    if (state.plan === "free") {
      return { allowed: false, state, reason: "Free plan" };
    }

    return { allowed: true, state };
  }

  public async getLicenseSummary(): Promise<string> {
    const state = await this.getState();
    const lastChecked = state.lastChecked
      ? new Date(state.lastChecked).toLocaleString()
      : "Never";
    const expiresAt = state.expiresAt
      ? new Date(state.expiresAt).toLocaleString()
      : "N/A";

    const lines = [
      `Status: ${state.status}`,
      `Plan: ${state.plan}`,
      `Last Check: ${lastChecked}`,
      `Expires: ${expiresAt}`,
    ];

    if (state.lastError) {
      lines.push(`Last Error: ${state.lastError}`);
    }

    return lines.join("\n");
  }

  private async getState(): Promise<LicenseState> {
    return {
      status:
        this.context.globalState.get<LicenseStatus>(
          LicenseManager.STATE_KEYS.status,
        ) ?? "free",
      plan:
        this.context.globalState.get<LicensePlan>(
          LicenseManager.STATE_KEYS.plan,
        ) ?? "free",
      expiresAt: this.context.globalState.get<number>(
        LicenseManager.STATE_KEYS.expiresAt,
      ),
      lastChecked: this.context.globalState.get<number>(
        LicenseManager.STATE_KEYS.lastChecked,
      ),
      nextCheckAt: this.context.globalState.get<number>(
        LicenseManager.STATE_KEYS.nextCheckAt,
      ),
      lastError: this.context.globalState.get<string>(
        LicenseManager.STATE_KEYS.lastError,
      ),
    };
  }

  private async updateState(state: LicenseState): Promise<void> {
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.status,
      state.status,
    );
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.plan,
      state.plan,
    );
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.expiresAt,
      state.expiresAt,
    );
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.lastChecked,
      state.lastChecked,
    );
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.nextCheckAt,
      state.nextCheckAt,
    );
    await this.context.globalState.update(
      LicenseManager.STATE_KEYS.lastError,
      state.lastError,
    );

    await this.syncConfigState(state);
  }

  private async syncConfigState(state: LicenseState): Promise<void> {
    const featureTier: "free" | "pro" | "enterprise" =
      state.plan === "enterprise"
        ? "enterprise"
        : state.status === "licensed" || state.status === "trial"
          ? "pro"
          : "free";

    try {
      await ConfigurationManager.saveConfig({
        licenseStatus: state.status,
        featureTier,
      });
    } catch (error) {
      // Ignore settings write errors on older installs without registered fields.
      console.log("[LicenseManager] Unable to persist license status:", error);
    }
  }

  private async applyGraceOrFree(
    state: LicenseState,
    now: number,
  ): Promise<LicenseState> {
    if (this.isWithinGrace(state, now)) {
      await this.updateState(state);
      return state;
    }

    const freeState: LicenseState = {
      status: "free",
      plan: "free",
      lastChecked: state.lastChecked,
      nextCheckAt: state.nextCheckAt,
      expiresAt: state.expiresAt,
      lastError: state.lastError,
    };
    await this.updateState(freeState);
    return freeState;
  }

  private isWithinGrace(state: LicenseState, now: number): boolean {
    if (state.status !== "licensed" && state.status !== "trial") {
      return false;
    }

    if (!state.lastChecked) {
      return false;
    }

    const graceMs = LicenseManager.GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    if (now - state.lastChecked > graceMs) {
      return false;
    }

    if (state.expiresAt && now > state.expiresAt + graceMs) {
      return false;
    }

    return true;
  }

  private getVerificationUrl(): string | undefined {
    const config = vscode.workspace.getConfiguration("ai-learning-repo");
    const url = config.get<string>("licenseVerificationUrl", "");
    const trimmed = url.trim();
    if (trimmed.length === 0) {
      return undefined;
    }

    if (!trimmed.startsWith("https://")) {
      return undefined;
    }

    return trimmed;
  }

  private normalizeResponse(response: LicenseVerifyResponse): {
    status: LicenseStatus;
    plan: LicensePlan;
    expiresAt?: number;
    nextCheckAt?: number;
    message?: string;
  } {
    const status: LicenseStatus = response.status
      ? response.status
      : response.valid
        ? "licensed"
        : "free";

    const plan: LicensePlan =
      response.plan ??
      (status === "licensed" || status === "trial" ? "pro" : "free");

    return {
      status,
      plan,
      expiresAt: this.normalizeTimestamp(response.expiresAt),
      nextCheckAt: this.normalizeTimestamp(response.nextCheckAt),
      message: response.message,
    };
  }

  private normalizeTimestamp(value: number | undefined): number | undefined {
    if (!value) return undefined;
    if (value < 10_000_000_000) {
      return value * 1000;
    }
    return value;
  }

  private callVerifyEndpoint(
    url: string,
    licenseKey: string,
  ): Promise<LicenseVerifyResponse> {
    const payload = JSON.stringify({
      licenseKey,
      productId: "ai-learning-repo",
      extensionVersion: this.context.extension.packageJSON.version,
      vscodeVersion: vscode.version,
    });

    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const request = https.request(
        {
          method: "POST",
          hostname: target.hostname,
          port: target.port ? Number(target.port) : 443,
          path: `${target.pathname}${target.search}`,
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(payload).toString(),
          },
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk.toString();
          });

          response.on("end", () => {
            if (!response.statusCode) {
              reject(new Error("License verification failed with no status"));
              return;
            }

            if (response.statusCode < 200 || response.statusCode >= 300) {
              reject(
                new Error(
                  `License verification failed (${response.statusCode})`,
                ),
              );
              return;
            }

            try {
              const parsed = JSON.parse(body) as LicenseVerifyResponse;
              resolve(parsed);
            } catch (error) {
              reject(new Error("Invalid license response payload"));
            }
          });
        },
      );

      request.on("error", (error) => {
        reject(error);
      });

      request.write(payload);
      request.end();
    });
  }
}
