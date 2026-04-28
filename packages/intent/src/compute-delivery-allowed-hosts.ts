export interface DeliveryEnvelope {
  readonly target: {
    readonly owner: string;
    readonly repo: string;
    readonly baseBranch: string;
  };
}

// Phase 7 Q-05: github.com is required for isomorphic-git push transport
// (https://github.com/{owner}/{repo}.git), distinct from Octokit's API host.
export function computeDeliveryAllowedHosts(
  delivery: DeliveryEnvelope | undefined,
  options?: { readonly attachmentsEnabled?: boolean }
): readonly string[] {
  if (delivery === undefined) return Object.freeze([] as string[]);
  const hosts: string[] = ["api.github.com", "github.com"];
  if (options?.attachmentsEnabled === true) hosts.push("uploads.github.com");
  return Object.freeze(hosts);
}
