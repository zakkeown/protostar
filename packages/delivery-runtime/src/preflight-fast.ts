import { isValidGitHubTokenFormat } from "@protostar/delivery";

export type FastPreflightResult =
  | { readonly outcome: "ok"; readonly tokenSource: "env" }
  | { readonly outcome: "token-missing" }
  | { readonly outcome: "token-invalid"; readonly reason: "format" };

export function preflightDeliveryFast(env: NodeJS.ProcessEnv): FastPreflightResult {
  const token = env["PROTOSTAR_GITHUB_TOKEN"];
  if (token === undefined || token.length === 0) {
    return { outcome: "token-missing" };
  }

  // Q-06 is env-only; Pitfall 2 requires accepting both classic and fine-grained PAT shapes.
  if (!isValidGitHubTokenFormat(token)) {
    return { outcome: "token-invalid", reason: "format" };
  }

  return { outcome: "ok", tokenSource: "env" };
}
