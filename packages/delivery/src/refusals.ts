/**
 * Delivery refusal taxonomy (Phase 7 Q-08, Q-09, Q-20).
 *
 * Each variant carries its own evidence shape so callers can narrow on `kind`
 * and keep refusal artifacts precise.
 */
export type DeliveryRefusal =
  | { readonly kind: "invalid-branch"; readonly evidence: { readonly input: string; readonly regex: string } }
  | { readonly kind: "invalid-title"; readonly evidence: { readonly input: string; readonly position?: number } }
  | { readonly kind: "invalid-body"; readonly evidence: { readonly input: string; readonly position?: number } }
  | { readonly kind: "oversized-body"; readonly evidence: { readonly byteLength: number; readonly limit: 60_000 } }
  | {
      readonly kind: "control-character";
      readonly evidence: {
        readonly field: "branch" | "title" | "body";
        readonly position: number;
        readonly codepoint: number;
      };
    }
  | { readonly kind: "token-missing"; readonly evidence: { readonly envVar: "PROTOSTAR_GITHUB_TOKEN" } }
  | { readonly kind: "token-invalid"; readonly evidence: { readonly reason: "format" | "401" } }
  | {
      readonly kind: "repo-inaccessible";
      readonly evidence: { readonly status: 403 | 404; readonly owner: string; readonly repo: string };
    }
  | { readonly kind: "base-branch-missing"; readonly evidence: { readonly baseBranch: string } }
  | {
      readonly kind: "excessive-pat-scope";
      readonly evidence: { readonly scopes: readonly string[]; readonly forbidden: readonly string[] };
    }
  | { readonly kind: "pr-already-closed"; readonly evidence: { readonly prUrl: string; readonly prNumber: number } }
  | { readonly kind: "pr-ambiguous"; readonly evidence: { readonly prs: readonly string[] } }
  | {
      readonly kind: "remote-diverged";
      readonly evidence: { readonly branch: string; readonly expectedSha: string | null; readonly remoteSha: string };
    }
  | { readonly kind: "push-failed"; readonly evidence: { readonly phase: "fetch" | "push"; readonly message: string } }
  | {
      readonly kind: "github-api-error";
      readonly evidence: {
        readonly phase: "preflight" | "push" | "pr-create" | "comment" | "poll";
        readonly status?: number;
        readonly message: string;
      };
    }
  | {
      readonly kind: "delivery-authorization-mismatch";
      readonly evidence: { readonly expectedRunId: string; readonly actualRunId: string };
    }
  | {
      readonly kind: "cancelled";
      readonly evidence: {
        readonly reason: "sigint" | "timeout" | "sentinel" | "parent-abort";
        readonly phase: "preflight" | "push" | "pr-create" | "comment" | "poll";
      };
    };

export function assertExhaustiveDeliveryRefusal(refusal: never): never {
  throw new Error(`Unhandled DeliveryRefusal kind: ${(refusal as DeliveryRefusal).kind}`);
}
