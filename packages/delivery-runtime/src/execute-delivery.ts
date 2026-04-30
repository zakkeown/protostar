import type { StageArtifactRef } from "@protostar/artifacts";
import type { BranchName, DeliveryRefusal, EvidenceCommentKind, PrBody, PrTitle } from "@protostar/delivery";
import type { DeliveryAuthorization } from "@protostar/review";

import { findExistingPr } from "./find-existing-pr.js";
import { mapOctokitErrorToRefusal, sanitizeDeliveryErrorMessage } from "./map-octokit-error.js";
import type { ProtostarOctokit } from "./octokit-client.js";
import { postEvidenceComment } from "./post-evidence-comment.js";
import type { DeliveryTarget } from "./preflight-full.js";
import { pushBranch } from "./push-branch.js";

export interface DeliveryExecutionPlan {
  readonly branch: BranchName;
  readonly title: PrTitle;
  readonly body: PrBody;
  readonly target: DeliveryTarget;
  readonly artifacts: readonly StageArtifactRef[];
  readonly evidenceComments: readonly { readonly kind: EvidenceCommentKind; readonly body: PrBody }[];
  readonly finalizeBodyWithPrUrl?: (prUrl: string) => PrBody;
}

export interface DeliveryRunContext {
  readonly runId: string;
  readonly token: string;
  readonly signal: AbortSignal;
  readonly fs: unknown;
  readonly octokit: ProtostarOctokit;
  readonly remoteUrl: string;
  readonly workspaceDir: string;
  readonly expectedRemoteSha: string | null;
  readonly commitFilepaths?: readonly string[];
}

export interface InitialCiSnapshot {
  readonly at: string;
  readonly checks: readonly { readonly name: string; readonly status: string; readonly conclusion: string | null }[];
  readonly captureError?: string;
}

export type DeliveryRunOutcome =
  | {
      readonly status: "delivered";
      readonly prUrl: string;
      readonly prNumber: number;
      readonly headSha: string;
      readonly baseSha: string;
      readonly initialCiSnapshot: InitialCiSnapshot;
      readonly evidenceComments: readonly { readonly kind: string; readonly commentId: number; readonly url: string }[];
      readonly commentFailures: readonly { readonly kind: string; readonly reason: string }[];
    }
  | { readonly status: "delivery-blocked"; readonly refusal: DeliveryRefusal };

const COMMENT_ORDER: readonly EvidenceCommentKind[] = [
  "mechanical-full",
  "judge-transcripts",
  "repair-history",
  "oversized-body-overflow"
];

export async function executeDelivery(
  authorization: DeliveryAuthorization,
  plan: DeliveryExecutionPlan,
  ctx: DeliveryRunContext
): Promise<DeliveryRunOutcome> {
  if (authorization.runId !== ctx.runId) {
    return blocked({
      kind: "delivery-authorization-mismatch",
      evidence: { expectedRunId: authorization.runId, actualRunId: ctx.runId }
    });
  }

  if (ctx.signal.aborted) {
    return blocked(cancelled("push", ctx.signal));
  }

  const push = await pushStep(plan, ctx);
  if (!push.ok) {
    return blocked(push.refusal);
  }

  const pr = await prCreateOrUpdateStep(plan, ctx);
  if (!pr.ok) {
    return blocked(pr.refusal);
  }

  if (plan.finalizeBodyWithPrUrl !== undefined) {
    const finalized = await prBodyUpdateStep(plan, ctx, pr.prNumber, plan.finalizeBodyWithPrUrl(pr.prUrl));
    if (!finalized.ok) {
      return blocked(finalized.refusal);
    }
  }

  const comments = await commentsStep(plan, ctx, pr.prNumber);
  const initialCiSnapshot = await initialSnapshotStep(plan.target, ctx.octokit, pr.headSha, ctx.signal).catch((error: unknown) => ({
    at: new Date().toISOString(),
    checks: [],
    captureError: sanitizeDeliveryErrorMessage(error)
  }));

  return {
    status: "delivered",
    prUrl: pr.prUrl,
    prNumber: pr.prNumber,
    headSha: pr.headSha,
    baseSha: pr.baseSha,
    initialCiSnapshot,
    evidenceComments: comments.evidenceComments,
    commentFailures: comments.commentFailures
  };
}

async function prBodyUpdateStep(
  plan: DeliveryExecutionPlan,
  ctx: DeliveryRunContext,
  prNumber: number,
  body: PrBody
): Promise<{ readonly ok: true } | { readonly ok: false; readonly refusal: DeliveryRefusal }> {
  try {
    await ctx.octokit.rest.pulls.update({
      owner: plan.target.owner,
      repo: plan.target.repo,
      pull_number: prNumber,
      body,
      request: { signal: ctx.signal }
    });
    return { ok: true };
  } catch (error: unknown) {
    return { ok: false, refusal: mapOctokitErrorToRefusal(error, { phase: "pr-create", target: plan.target }) };
  }
}

async function pushStep(plan: DeliveryExecutionPlan, ctx: DeliveryRunContext): Promise<Awaited<ReturnType<typeof pushBranch>>> {
  return pushBranch({
    workspaceDir: ctx.workspaceDir,
    branchName: plan.branch,
    remoteUrl: ctx.remoteUrl,
    token: ctx.token,
    expectedRemoteSha: ctx.expectedRemoteSha,
    ...(ctx.commitFilepaths !== undefined ? { commitFilepaths: ctx.commitFilepaths } : {}),
    signal: ctx.signal,
    fs: ctx.fs
  });
}

async function prCreateOrUpdateStep(
  plan: DeliveryExecutionPlan,
  ctx: DeliveryRunContext
): Promise<
  | { readonly ok: true; readonly prUrl: string; readonly prNumber: number; readonly headSha: string; readonly baseSha: string }
  | { readonly ok: false; readonly refusal: DeliveryRefusal }
> {
  try {
    const existing = await findExistingPr(plan.target, plan.branch, ctx.octokit, ctx.signal);
    if (existing.state === "closed") {
      return { ok: false, refusal: { kind: "pr-already-closed", evidence: { prUrl: existing.prUrl, prNumber: existing.prNumber } } };
    }
    if (existing.state === "ambiguous") {
      return { ok: false, refusal: { kind: "pr-ambiguous", evidence: { prs: existing.prUrls } } };
    }
    if (existing.state === "open") {
      const updated = await ctx.octokit.rest.pulls.update({
        owner: plan.target.owner,
        repo: plan.target.repo,
        pull_number: existing.prNumber,
        body: plan.body,
        request: { signal: ctx.signal }
      });
      return prOk(updated.data.html_url, updated.data.number, existing.headSha, updated.data.base.sha);
    }

    const created = await ctx.octokit.rest.pulls.create({
      owner: plan.target.owner,
      repo: plan.target.repo,
      head: plan.branch,
      base: plan.target.baseBranch,
      title: plan.title,
      body: plan.body,
      request: { signal: ctx.signal }
    });
    return prOk(created.data.html_url, created.data.number, created.data.head.sha, created.data.base.sha);
  } catch (error: unknown) {
    return { ok: false, refusal: mapOctokitErrorToRefusal(error, { phase: "pr-create", target: plan.target }) };
  }
}

async function commentsStep(
  plan: DeliveryExecutionPlan,
  ctx: DeliveryRunContext,
  prNumber: number
): Promise<Pick<Extract<DeliveryRunOutcome, { readonly status: "delivered" }>, "evidenceComments" | "commentFailures">> {
  const evidenceComments: { kind: string; commentId: number; url: string }[] = [];
  const commentFailures: { kind: string; reason: string }[] = [];
  const ordered = [...plan.evidenceComments].sort((a, b) => COMMENT_ORDER.indexOf(a.kind) - COMMENT_ORDER.indexOf(b.kind));

  for (const comment of ordered) {
    // postEvidenceComment threads request: { signal: ctx.signal } through list/update/create comment calls.
    const result = await postEvidenceComment({ ...comment, target: plan.target, prNumber, runId: ctx.runId, octokit: ctx.octokit, signal: ctx.signal });
    if (result.ok) {
      evidenceComments.push({ kind: comment.kind, commentId: result.commentId, url: result.url });
    } else {
      commentFailures.push({ kind: comment.kind, reason: result.reason });
    }
  }

  return { evidenceComments, commentFailures };
}

async function initialSnapshotStep(
  target: DeliveryTarget,
  octokit: ProtostarOctokit,
  headSha: string,
  signal: AbortSignal
): Promise<InitialCiSnapshot> {
  const response = await octokit.rest.checks.listForRef({
    owner: target.owner,
    repo: target.repo,
    ref: headSha,
    request: { signal }
  });

  return {
    at: new Date().toISOString(),
    checks: response.data.check_runs.map((check) => ({ name: check.name, status: check.status, conclusion: check.conclusion }))
  };
}

function prOk(
  prUrl: string,
  prNumber: number,
  headSha: string,
  baseSha: string
): { readonly ok: true; readonly prUrl: string; readonly prNumber: number; readonly headSha: string; readonly baseSha: string } {
  return { ok: true, prUrl, prNumber, headSha, baseSha };
}

function blocked(refusal: DeliveryRefusal): DeliveryRunOutcome {
  return { status: "delivery-blocked", refusal };
}

function cancelled(phase: "push", signal: AbortSignal): DeliveryRefusal {
  const reason =
    signal.reason === "sigint" || signal.reason === "timeout" || signal.reason === "sentinel" ? signal.reason : "parent-abort";
  return { kind: "cancelled", evidence: { reason, phase } };
}
