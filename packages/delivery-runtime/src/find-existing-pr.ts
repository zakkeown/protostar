import type { BranchName } from "@protostar/delivery";

import type { ProtostarOctokit } from "./octokit-client.js";
import type { DeliveryTarget } from "./preflight-full.js";

export type ExistingPrResult =
  | { readonly state: "none" }
  | { readonly state: "open"; readonly prUrl: string; readonly prNumber: number; readonly headSha: string }
  | { readonly state: "closed"; readonly prUrl: string; readonly prNumber: number }
  | { readonly state: "ambiguous"; readonly prUrls: readonly string[] };

export async function findExistingPr(
  target: DeliveryTarget,
  branch: BranchName,
  octokit: ProtostarOctokit,
  signal: AbortSignal
): Promise<ExistingPrResult> {
  const response = await octokit.rest.pulls.list({
    owner: target.owner,
    repo: target.repo,
    head: `${target.owner}:${branch}`,
    state: "all",
    per_page: 10,
    request: { signal }
  });

  if (response.data.length === 0) {
    return { state: "none" };
  }

  if (response.data.length > 1) {
    return { state: "ambiguous", prUrls: response.data.map((pr) => pr.html_url) };
  }

  const pr = response.data[0];
  if (pr === undefined) {
    return { state: "none" };
  }

  if (pr.state === "open") {
    return { state: "open", prUrl: pr.html_url, prNumber: pr.number, headSha: pr.head.sha };
  }

  return { state: "closed", prUrl: pr.html_url, prNumber: pr.number };
}
