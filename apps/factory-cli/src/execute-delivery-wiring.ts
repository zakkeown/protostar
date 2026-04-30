import { resolve } from "node:path";
import type * as FsPromises from "node:fs/promises";

import {
  validateBranchName,
  validatePrTitle,
  type BranchName,
  type DeliveryRefusal,
  type PrTitle
} from "@protostar/delivery";
import {
  buildBranchName,
  DELIVERY_RESULT_SCHEMA_VERSION,
  executeDelivery as defaultExecuteDelivery,
  pollCiStatus as defaultPollCiStatus,
  type CiEvent,
  type DeliveryResult,
  type DeliveryRunOutcome,
  type ProtostarOctokit
} from "@protostar/delivery-runtime";
import type { DeliveryAuthorization } from "@protostar/review";

import { assembleDeliveryBody, type DeliveryBodyInput } from "./assemble-delivery-body.js";
import { drivePollCiStatus, writeJsonAtomic } from "./poll-ci-driver.js";

export interface WireExecuteDeliveryInput {
  readonly runId: string;
  readonly runDir: string;
  readonly authorization: DeliveryAuthorization;
  readonly intent: { readonly title: string; readonly archetype: string };
  readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string };
  readonly bodyInput: DeliveryBodyInput;
  readonly token: string;
  readonly octokit: ProtostarOctokit;
  readonly baseSha: string;
  readonly workspaceDir: string;
  readonly commitFilepaths?: readonly string[];
  readonly fs: typeof FsPromises;
  readonly signal: AbortSignal;
  readonly branchSuffix?: string;
  readonly requiredChecks?: readonly string[];
}

export type WireExecuteDeliveryResult =
  | { readonly status: "delivered"; readonly deliveryResult: DeliveryResult }
  | { readonly status: "delivery-blocked" };

export async function wireExecuteDelivery(
  input: WireExecuteDeliveryInput,
  deps: {
    readonly executeDelivery?: typeof defaultExecuteDelivery;
    readonly pollCiStatus?: typeof defaultPollCiStatus;
    readonly drivePollCiStatus?: typeof drivePollCiStatus;
  } = {}
): Promise<WireExecuteDeliveryResult> {
  const deliveryDir = resolve(input.runDir, "delivery");
  const resultPath = resolve(deliveryDir, "delivery-result.json");
  const eventsPath = resolve(deliveryDir, "ci-events.jsonl");
  await input.fs.mkdir(deliveryDir, { recursive: true });

  const branch = mintBranch(input);
  if (!branch.ok) {
    await persistBlocked(input, resultPath, eventsPath, "unknown", branch.refusal);
    return { status: "delivery-blocked" };
  }

  const title = validatePrTitle(input.intent.title || input.runId);
  if (!title.ok) {
    await persistBlocked(input, resultPath, eventsPath, branch.value, title.refusal);
    return { status: "delivery-blocked" };
  }

  const assembled = assembleDeliveryBody(input.bodyInput);
  const finalizeBodyWithPrUrl = (prUrl: string) => assembleDeliveryBody({ ...input.bodyInput, prUrl }).body;
  const executeDelivery = deps.executeDelivery ?? defaultExecuteDelivery;
  const outcome = await executeDelivery(
    input.authorization,
    {
      branch: branch.value,
      title: title.value,
      body: assembled.body,
      target: input.target,
      artifacts: input.bodyInput.artifacts,
      evidenceComments: assembled.evidenceComments,
      finalizeBodyWithPrUrl
    },
    {
      runId: input.runId,
      token: input.token,
      signal: input.signal,
      fs: input.fs,
      octokit: input.octokit,
      remoteUrl: `https://github.com/${input.target.owner}/${input.target.repo}.git`,
      workspaceDir: input.workspaceDir,
      expectedRemoteSha: null,
      ...(input.commitFilepaths !== undefined ? { commitFilepaths: input.commitFilepaths } : {})
    }
  );

  if (outcome.status === "delivery-blocked") {
    await persistBlocked(input, resultPath, eventsPath, branch.value, outcome.refusal);
    return { status: "delivery-blocked" };
  }

  await persistDeliveredInitial(input, resultPath, eventsPath, branch.value, outcome);
  const poll = (deps.pollCiStatus ?? defaultPollCiStatus)({
    target: input.target,
    headSha: outcome.headSha,
    requiredChecks: input.requiredChecks ?? [],
    octokit: input.octokit,
    signal: input.signal
  });
  const deliveryResult = await (deps.drivePollCiStatus ?? drivePollCiStatus)({
    initialResult: buildInitialResult(input, branch.value, outcome),
    poll,
    runDir: input.runDir,
    fs: input.fs,
    signal: input.signal
  });

  return { status: "delivered", deliveryResult };
}

function mintBranch(
  input: WireExecuteDeliveryInput
): { readonly ok: true; readonly value: BranchName } | { readonly ok: false; readonly refusal: DeliveryRefusal } {
  try {
    const rawBranch = buildBranchName({
      archetype: input.intent.archetype || "cosmetic-tweak",
      runId: input.runId,
      ...(input.branchSuffix !== undefined ? { suffix: input.branchSuffix } : {})
    });
    const branch = validateBranchName(rawBranch);
    return branch.ok ? { ok: true, value: branch.value } : { ok: false, refusal: branch.refusal };
  } catch (error: unknown) {
    return {
      ok: false,
      refusal: {
        kind: "invalid-branch",
        evidence: { input: error instanceof Error ? error.message : String(error), regex: "^[a-zA-Z0-9._/-]+$" }
      }
    };
  }
}

async function persistDeliveredInitial(
  input: WireExecuteDeliveryInput,
  resultPath: string,
  eventsPath: string,
  branch: BranchName,
  outcome: Extract<DeliveryRunOutcome, { readonly status: "delivered" }>
): Promise<void> {
  const result = buildInitialResult(input, branch, outcome);
  await writeJsonAtomic(input.fs, resultPath, result);
  await appendJsonl(input.fs, eventsPath, {
    kind: "pr-created",
    at: result.createdAt,
    prNumber: outcome.prNumber,
    prUrl: outcome.prUrl,
    headSha: outcome.headSha
  });
  for (const comment of outcome.evidenceComments) {
    await appendJsonl(input.fs, eventsPath, {
      kind: "comment-posted",
      at: result.createdAt,
      commentKind: comment.kind,
      commentId: comment.commentId
    });
  }
  for (const failure of outcome.commentFailures) {
    await appendJsonl(input.fs, eventsPath, {
      kind: "comment-failed",
      at: result.createdAt,
      commentKind: failure.kind,
      reason: failure.reason
    });
  }
}

function buildInitialResult(
  input: WireExecuteDeliveryInput,
  branch: BranchName | string,
  outcome: Extract<DeliveryRunOutcome, { readonly status: "delivered" }>
): DeliveryResult {
  const now = new Date().toISOString();
  return {
    schemaVersion: DELIVERY_RESULT_SCHEMA_VERSION,
    runId: input.runId,
    status: "delivered",
    branch,
    prUrl: outcome.prUrl,
    prNumber: outcome.prNumber,
    headSha: outcome.headSha,
    baseSha: input.baseSha || outcome.baseSha,
    baseBranch: input.target.baseBranch,
    createdAt: now,
    ciVerdict: "pending",
    ciVerdictUpdatedAt: now,
    ciSnapshots: [{ at: outcome.initialCiSnapshot.at, checks: outcome.initialCiSnapshot.checks }],
    evidenceComments: outcome.evidenceComments,
    commentFailures: outcome.commentFailures,
    screenshots: {
      status: "deferred-v01",
      reason: "Tauri capture pipeline lands in Phase 10 with toy repo."
    }
  };
}

async function persistBlocked(
  input: WireExecuteDeliveryInput,
  resultPath: string,
  eventsPath: string,
  branch: BranchName | string,
  refusal: DeliveryRefusal
): Promise<void> {
  const at = new Date().toISOString();
  await writeJsonAtomic(input.fs, resultPath, {
    schemaVersion: DELIVERY_RESULT_SCHEMA_VERSION,
    runId: input.runId,
    status: "delivery-blocked",
    branch,
    baseBranch: input.target.baseBranch,
    createdAt: at,
    ciVerdict: "cancelled",
    ciVerdictUpdatedAt: at,
    ciSnapshots: [],
    evidenceComments: [],
    commentFailures: [],
    screenshots: {
      status: "deferred-v01",
      reason: "Tauri capture pipeline lands in Phase 10 with toy repo."
    },
    refusal
  } satisfies DeliveryResult);
  await appendJsonl(input.fs, eventsPath, { kind: "ci-cancelled", at, reason: "parent-abort" });
}

async function appendJsonl(fs: typeof FsPromises, path: string, event: CiEvent): Promise<void> {
  const handle = await fs.open(path, "a");
  try {
    await handle.appendFile(`${JSON.stringify(event)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}
