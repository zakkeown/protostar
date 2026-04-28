import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";
import { Octokit } from "@octokit/rest";

type OctokitPlugin = Parameters<typeof Octokit.plugin>[number];
type ProtostarOctokitClassType = typeof Octokit;

export function createProtostarOctokitClass(
  retryPlugin: OctokitPlugin = retry,
  throttlingPlugin: OctokitPlugin = throttling
): ProtostarOctokitClassType {
  return Octokit.plugin(retryPlugin, throttlingPlugin) as unknown as ProtostarOctokitClassType;
}

const ProtostarOctokitClass: ProtostarOctokitClassType = createProtostarOctokitClass();

export type ProtostarOctokit = InstanceType<typeof ProtostarOctokitClass>;

export function buildOctokit(token: string, options?: { readonly userAgent?: string }): ProtostarOctokit {
  return new ProtostarOctokitClass({
    auth: token,
    userAgent: options?.userAgent ?? "protostar-factory/0.0.0",
    retry: { doNotRetry: [400, 401, 403, 404, 422] },
    throttle: {
      // Phase 7 T-07-06-03: retry primary rate limits briefly, but never secondary abuse limits.
      onRateLimit: (_retryAfter, _options, _octokit, retryCount) => retryCount < 2,
      onSecondaryRateLimit: () => false
    }
  });
}
