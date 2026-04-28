import { isValidGitHubTokenFormat } from "@protostar/delivery";
import type { ProtostarOctokit } from "./octokit-client.js";

export interface DeliveryTarget {
  readonly owner: string;
  readonly repo: string;
  readonly baseBranch: string;
}

export type FullPreflightResult =
  | { readonly outcome: "ok"; readonly tokenLogin: string; readonly baseSha: string; readonly tokenScopes: readonly string[] }
  | { readonly outcome: "token-invalid"; readonly reason: "format" | "401" }
  | { readonly outcome: "repo-inaccessible"; readonly status: 403 | 404 }
  | { readonly outcome: "base-branch-missing"; readonly baseBranch: string }
  | { readonly outcome: "excessive-pat-scope"; readonly scopes: readonly string[]; readonly forbidden: readonly string[] };

export const FORBIDDEN_SCOPES = ["admin:org", "admin:repo_hook", "admin:public_key", "delete_repo", "site_admin"] as const;

export async function preflightDeliveryFull(
  input: { readonly token: string; readonly target: DeliveryTarget; readonly signal: AbortSignal },
  octokit: ProtostarOctokit
): Promise<FullPreflightResult> {
  if (!isValidGitHubTokenFormat(input.token)) {
    return { outcome: "token-invalid", reason: "format" };
  }

  let auth;
  try {
    auth = await octokit.rest.users.getAuthenticated({ request: { signal: input.signal } });
  } catch (error: unknown) {
    if (hasStatus(error, 401)) {
      return { outcome: "token-invalid", reason: "401" };
    }
    throw error;
  }

  // Assumption A6: fine-grained PATs may omit X-OAuth-Scopes; treat absence as empty scopes.
  const scopes = parseScopes(auth.headers["x-oauth-scopes"]);
  const forbidden = scopes.filter((scope) => (FORBIDDEN_SCOPES as readonly string[]).includes(scope));
  if (forbidden.length > 0) {
    return { outcome: "excessive-pat-scope", scopes, forbidden };
  }

  try {
    await octokit.rest.repos.get({
      owner: input.target.owner,
      repo: input.target.repo,
      request: { signal: input.signal }
    });
  } catch (error: unknown) {
    if (hasStatus(error, 403) || hasStatus(error, 404)) {
      return { outcome: "repo-inaccessible", status: error.status };
    }
    throw error;
  }

  let branch;
  try {
    branch = await octokit.rest.repos.getBranch({
      owner: input.target.owner,
      repo: input.target.repo,
      branch: input.target.baseBranch,
      request: { signal: input.signal }
    });
  } catch (error: unknown) {
    if (hasStatus(error, 404)) {
      return { outcome: "base-branch-missing", baseBranch: input.target.baseBranch };
    }
    throw error;
  }

  return {
    outcome: "ok",
    tokenLogin: auth.data.login,
    baseSha: branch.data.commit.sha,
    tokenScopes: scopes
  };
}

function parseScopes(value: unknown): readonly string[] {
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope.length > 0);
}

function hasStatus<TStatus extends number>(error: unknown, status: TStatus): error is { readonly status: TStatus } {
  return typeof error === "object" && error !== null && "status" in error && error.status === status;
}
