import * as fsPromises from "node:fs/promises";
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import { Command } from "@commander-js/extra-typings";
import { setFactoryRunStatus, sortJsonValue, type FactoryRunManifest, type FactoryRunStatus } from "@protostar/artifacts";
import { isAuthorizationPayload, type AuthorizationPayload } from "@protostar/delivery/authorization-payload";
import {
  validateBranchName,
  validatePrBody,
  validatePrTitle,
  type BranchName,
  type PrBody,
  type PrTitle
} from "@protostar/delivery";
import {
  buildOctokit,
  executeDelivery as defaultExecuteDelivery,
  type DeliveryRunOutcome,
  type ProtostarOctokit
} from "@protostar/delivery-runtime";
import {
  reAuthorizeFromPayload as defaultReAuthorizeFromPayload,
  type DeliveryAuthorization,
  type ReAuthorizeResult
} from "@protostar/review";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { assertRunIdConfined, parseRunId } from "../run-id.js";

const authorizationMissingReason = "run delivery/authorization.json absent — was the run loop reach ready-to-release?";
const deliverableStatuses = new Set<FactoryRunStatus>(["completed", "ready-to-release"]);

export interface DeliverCommandDeps {
  readonly executeDelivery?: typeof defaultExecuteDelivery;
  readonly reAuthorizeFromPayload?: (
    payload: AuthorizationPayload,
    deps: { readonly readReviewDecision: (decisionPath: string) => Promise<unknown> }
  ) => Promise<ReAuthorizeResult>;
  readonly buildOctokit?: (token: string) => ProtostarOctokit;
  readonly token?: string;
  readonly workspaceDir?: string;
  readonly signal?: AbortSignal;
}

export function buildDeliverCommand(deps: DeliverCommandDeps = {}): Command {
  const command = new Command("deliver")
    .description("Deliver or retry a ready factory run")
    .argument("<runId>", "run id to deliver")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (runId) => {
      process.exitCode = await executeDeliver(runId, deps);
    });
  return command as unknown as Command;
}

export async function executeDeliver(runIdInput: string, deps: DeliverCommandDeps = {}): Promise<number> {
  const parsedRunId = parseRunId(runIdInput);
  if (!parsedRunId.ok) {
    writeStderr(parsedRunId.reason);
    return ExitCode.UsageOrArgError;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const runsRoot = join(workspaceRoot, ".protostar", "runs");
  try {
    assertRunIdConfined(runsRoot, parsedRunId.value);
  } catch (error: unknown) {
    writeStderr(error instanceof Error ? error.message : String(error));
    return ExitCode.UsageOrArgError;
  }

  const runId = parsedRunId.value;
  const runDir = resolve(runsRoot, runId);
  const manifestPath = join(runDir, "manifest.json");
  const manifest = await readManifest(manifestPath);
  if (!manifest.ok) {
    writeStderr(`no manifest at ${runDir}`);
    return ExitCode.NotFound;
  }

  if (!deliverableStatuses.has(manifest.value.status)) {
    writeStdoutJson({
      runId,
      error: "conflict",
      manifestStatus: manifest.value.status,
      reason: `not-deliverable-from-${manifest.value.status}`
    });
    return ExitCode.Conflict;
  }

  if (manifest.value.status === "completed") {
    const delivered = await readExistingDelivered(runDir);
    if (delivered !== null) {
      writeStdoutJson({
        runId,
        action: "noop",
        prUrl: delivered.prUrl,
        reason: 'already-delivered'
      });
      return ExitCode.Success;
    }
  }

  const payloadResult = await readAuthorizationPayload(runDir);
  if (!payloadResult.ok) {
    writeStdoutJson({
      runId,
      error: 'authorization-missing',
      reason: payloadResult.reason
    });
    return ExitCode.Conflict;
  }

  const reauthorize = deps.reAuthorizeFromPayload ?? defaultReAuthorizeFromPayload;
  const reviewDecisionPath = resolveRunRelativePath(runDir, payloadResult.payload.decisionPath);
  if (reviewDecisionPath === null) {
    writeStdoutJson({
      runId,
      error: "decision-path-outside-run",
      reason: "decision-path-outside-run"
    });
    return ExitCode.Conflict;
  }
  const authorizationResult = await reauthorize(payloadResult.payload, {
    readReviewDecision: async () => JSON.parse(await readFile(reviewDecisionPath, "utf8")) as unknown
  });
  if (!authorizationResult.ok) {
    writeStdoutJson({
      runId,
      error: authorizationResult.reason,
      reason: authorizationResult.reason
    });
    return ExitCode.Conflict;
  }

  const deliveryResult = await invokeDelivery({
    runId,
    runDir,
    payload: payloadResult.payload,
    authorization: authorizationResult.authorization,
    deps
  });
  if (deliveryResult.status === "delivery-blocked") {
    writeStdoutJson({
      runId,
      error: "conflict",
      reason: "delivery-blocked"
    });
    return ExitCode.Conflict;
  }

  await persistDelivered(runDir, runId, payloadResult.payload, deliveryResult);
  if (manifest.value.status === "ready-to-release") {
    await writeManifestAtomic(manifestPath, setFactoryRunStatus(manifest.value, "completed"));
  }
  writeStdoutJson({
    runId,
    action: "delivered",
    prUrl: deliveryResult.prUrl,
    headSha: payloadResult.payload.headSha,
    baseSha: payloadResult.payload.baseSha
  });
  return ExitCode.Success;
}

function resolveRunRelativePath(runDir: string, relativePath: string): string | null {
  if (relativePath.startsWith("/") || relativePath.includes("\0")) {
    return null;
  }
  const resolvedRunDir = resolve(runDir);
  const resolvedPath = resolve(resolvedRunDir, relativePath);
  if (resolvedPath === resolvedRunDir || resolvedPath.startsWith(`${resolvedRunDir}${sep}`)) {
    return resolvedPath;
  }
  return null;
}

async function invokeDelivery(input: {
  readonly runId: string;
  readonly runDir: string;
  readonly payload: AuthorizationPayload;
  readonly authorization: DeliveryAuthorization;
  readonly deps: DeliverCommandDeps;
}): Promise<DeliveryRunOutcome> {
  const branch = validateBranchName(input.payload.branchName);
  const title = validatePrTitle(input.payload.title);
  const body = validatePrBody(input.payload.body);
  if (!branch.ok || !title.ok || !body.ok) {
    return {
      status: "delivery-blocked",
      refusal: {
        kind: "invalid-branch",
        evidence: { input: input.payload.branchName, regex: "^[a-zA-Z0-9._/-]+$" }
      }
    };
  }

  const token = input.deps.token ?? process.env["PROTOSTAR_GITHUB_TOKEN"] ?? "";
  const octokit = input.deps.buildOctokit?.(token) ?? buildOctokit(token);
  const signal = input.deps.signal ?? new AbortController().signal;
  const executeDelivery = input.deps.executeDelivery ?? defaultExecuteDelivery;
  return executeDelivery(
    input.authorization,
    {
      branch: branch.value as BranchName,
      title: title.value as PrTitle,
      body: body.value as PrBody,
      target: input.payload.target,
      artifacts: [],
      evidenceComments: []
    },
    {
      runId: input.runId,
      token,
      signal,
      fs: fsPromises,
      octokit,
      remoteUrl: `https://github.com/${input.payload.target.owner}/${input.payload.target.repo}.git`,
      workspaceDir: input.deps.workspaceDir ?? process.cwd(),
      expectedRemoteSha: input.payload.baseSha
    }
  );
}

async function readExistingDelivered(runDir: string): Promise<{ readonly prUrl: string } | null> {
  const hasCiEvents = await pathExists(join(runDir, "delivery", "ci-events.jsonl"));
  if (!hasCiEvents) return null;

  for (const fileName of ["result.json", "delivery-result.json"]) {
    const value = await readOptionalJson(join(runDir, "delivery", fileName));
    if (isDeliveredResult(value)) {
      return { prUrl: value.prUrl };
    }
  }
  return null;
}

async function readAuthorizationPayload(
  runDir: string
): Promise<{ readonly ok: true; readonly payload: AuthorizationPayload } | { readonly ok: false; readonly reason: string }> {
  const raw = await readOptionalJson(join(runDir, "delivery", "authorization.json"));
  if (raw === null) {
    return { ok: false, reason: authorizationMissingReason };
  }
  if (!isAuthorizationPayload(raw)) {
    return { ok: false, reason: "authorization.json schema mismatch" };
  }
  return { ok: true, payload: raw };
}

async function persistDelivered(
  runDir: string,
  runId: string,
  payload: AuthorizationPayload,
  outcome: Extract<DeliveryRunOutcome, { readonly status: "delivered" }>
): Promise<void> {
  const now = new Date().toISOString();
  const result = {
    schemaVersion: "1.0.0",
    runId,
    status: "delivered",
    branch: payload.branchName,
    prUrl: outcome.prUrl,
    prNumber: outcome.prNumber,
    headSha: outcome.headSha,
    baseSha: outcome.baseSha,
    baseBranch: payload.target.baseBranch,
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
  await writeJsonAtomic(join(runDir, "delivery", "result.json"), sortJsonValue(result));
  await writeJsonAtomic(join(runDir, "delivery", "delivery-result.json"), sortJsonValue(result));
  await appendJsonl(join(runDir, "delivery", "ci-events.jsonl"), {
    kind: "pr-created",
    at: now,
    prNumber: outcome.prNumber,
    prUrl: outcome.prUrl,
    headSha: outcome.headSha
  });
  await appendJsonl(join(runDir, "delivery", "ci-events.jsonl"), {
    kind: "ci-snapshot",
    at: outcome.initialCiSnapshot.at,
    checks: outcome.initialCiSnapshot.checks
  });
}

function isDeliveredResult(value: unknown): value is { readonly prUrl: string } {
  return isRecord(value) && typeof value["prUrl"] === "string" && value["prUrl"].length > 0;
}

async function readManifest(
  manifestPath: string
): Promise<{ readonly ok: true; readonly value: FactoryRunManifest } | { readonly ok: false }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(manifestPath, "utf8")) as FactoryRunManifest };
  } catch {
    return { ok: false };
  }
}

async function readOptionalJson(filePath: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fsPromises.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeManifestAtomic(manifestPath: string, manifest: FactoryRunManifest): Promise<void> {
  await writeJsonAtomic(manifestPath, sortJsonValue(manifest));
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `${filePath.split("/").at(-1) ?? "artifact"}.${process.pid}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  const fileHandle = await open(tmpPath, "r");
  try {
    await fileHandle.datasync();
  } finally {
    await fileHandle.close();
  }
  await rename(tmpPath, filePath);
}

async function appendJsonl(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const handle = await open(filePath, "a");
  try {
    await handle.appendFile(`${JSON.stringify(value)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
