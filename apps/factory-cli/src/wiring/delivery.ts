import * as fsPromises from "node:fs/promises";
import { resolve } from "node:path";

import {
  sortJsonValue,
  type StageArtifactRef
} from "@protostar/artifacts";
import {
  isAuthorizationPayload,
  type AuthorizationPayload
} from "@protostar/delivery/authorization-payload";
import { buildBranchName, type DeliveryResult } from "@protostar/delivery-runtime";
import type { CapabilityEnvelope } from "@protostar/intent";
import {
  loadDeliveryAuthorization,
  type ReviewGate,
  type ReviewRepairLoopResult
} from "@protostar/review";

import { assembleDeliveryBody, type DeliveryBodyInput } from "../assemble-delivery-body.js";
import { runFullDeliveryPreflight } from "../delivery-preflight-wiring.js";
import { wireExecuteDelivery } from "../execute-delivery-wiring.js";

/**
 * Phase 12 D-14 / D-07: delivery wiring extracted from
 * `apps/factory-cli/src/main.ts` (formerly an inlined block at lines
 * 1192-1267 of pre-12-06 main.ts).
 *
 * Structural assertion (D-07): PROTOSTAR_GITHUB_TOKEN is read here and
 * here only — the token stays at the Octokit / `isomorphic-git onAuth`
 * library boundary. The mechanical-command runner in
 * `wiring/command-execution.ts` MUST NOT contain this string.
 */

export type DeliveryMode = "auto" | "gated";

export interface BuildAndExecuteDeliveryInput {
  readonly runId: string;
  readonly runDir: string;
  readonly deliveryMode: DeliveryMode;
  readonly intent: {
    readonly title: string;
    readonly goalArchetype?: string;
    readonly capabilityEnvelope: CapabilityEnvelope;
  };
  readonly loop: { readonly status: string; readonly decisionPath: string } & ReviewRepairLoopResult;
  readonly review: ReviewGate;
  readonly executionEvidence: readonly StageArtifactRef[];
  readonly repoRuntime: { readonly headSha: string; readonly cloneDir: string };
  readonly signal: AbortSignal;
  readonly requiredChecks: readonly string[];
  readonly buildDeliveryArtifactList: (
    executionEvidence: readonly StageArtifactRef[]
  ) => readonly StageArtifactRef[];
  readonly buildDeliveryBodyInput: (input: {
    readonly runId: string;
    readonly target: { readonly owner: string; readonly repo: string; readonly baseBranch: string };
    readonly review: ReviewGate;
    readonly loop: ReviewRepairLoopResult;
    readonly artifacts: readonly StageArtifactRef[];
  }) => DeliveryBodyInput;
  readonly throwExit: (message: string, code: number) => never;
  readonly writeStderr: (message: string) => void;
}

export interface BuildAndExecuteDeliveryResult {
  readonly deliveryAuthorizationPayloadWritten: boolean;
  readonly deliveryWireStatus: "delivered" | "delivery-blocked" | undefined;
  readonly deliveryResult?: DeliveryResult;
}

export async function buildAndExecuteDelivery(
  input: BuildAndExecuteDeliveryInput
): Promise<BuildAndExecuteDeliveryResult> {
  const { intent, loop, runDir, runId, repoRuntime } = input;
  if (intent.capabilityEnvelope.delivery === undefined) {
    return { deliveryAuthorizationPayloadWritten: false, deliveryWireStatus: undefined };
  }
  const authorization = await loadDeliveryAuthorization({
    decisionPath: loop.decisionPath,
    readJson: async (path) =>
      JSON.parse(await fsPromises.readFile(path, "utf8")) as unknown
  });
  if (authorization === null) {
    input.throwExit(
      "Delivery authorization could not be loaded from approved review decision.",
      1
    );
  }
  const deliveryArtifacts = input.buildDeliveryArtifactList(input.executionEvidence);
  const deliveryBodyInput = input.buildDeliveryBodyInput({
    runId,
    target: intent.capabilityEnvelope.delivery.target,
    review: input.review,
    loop,
    artifacts: deliveryArtifacts
  });
  const branchName = buildBranchName({
    archetype: (intent.goalArchetype ?? "cosmetic-tweak") as
      | "cosmetic-tweak"
      | "feature-add"
      | "refactor"
      | "bugfix",
    runId
  });
  if (input.deliveryMode === "gated") {
    await writeDeliveryAuthorizationPayloadAtomic({
      runDir,
      payload: buildAuthorizationPayload({
        runId,
        decisionPath: loop.decisionPath,
        target: intent.capabilityEnvelope.delivery.target,
        branchName,
        title: intent.title || runId,
        body: assembleDeliveryBody(deliveryBodyInput).body,
        headSha: repoRuntime.headSha,
        baseSha: repoRuntime.headSha
      }),
      throwExit: input.throwExit
    });
    input.writeStderr(`gated: run \`protostar-factory deliver ${runId}\` to push.`);
    return {
      deliveryAuthorizationPayloadWritten: true,
      deliveryWireStatus: undefined
    };
  }

  // D-07: PROTOSTAR_GITHUB_TOKEN read here, then handed in-process to
  // Octokit + `isomorphic-git onAuth` — the token never crosses a
  // subprocess boundary (the mechanical-command runner explicitly passes
  // `inheritEnv: []`; see wiring/command-execution.ts).
  const token = process.env["PROTOSTAR_GITHUB_TOKEN"];
  if (token === undefined || token.length === 0) {
    input.throwExit(
      "PROTOSTAR_GITHUB_TOKEN missing — required for delivery (Octokit + onAuth library boundary).",
      1
    );
  }

  const fullResult = await runFullDeliveryPreflight({
    token: token!,
    target: intent.capabilityEnvelope.delivery.target,
    runDir,
    fs: fsPromises,
    signal: input.signal
  });
  if (!fullResult.proceed) {
    input.throwExit(`Delivery full preflight refused: ${fullResult.result.outcome}`, 1);
  }
  const { octokit, baseSha } = fullResult;
  if (octokit === undefined || baseSha === undefined) {
    input.throwExit("Delivery full preflight did not return Octokit and base SHA.", 1);
  }
  await writeDeliveryAuthorizationPayloadAtomic({
    runDir,
    payload: buildAuthorizationPayload({
      runId,
      decisionPath: loop.decisionPath,
      target: intent.capabilityEnvelope.delivery.target,
      branchName,
      title: intent.title || runId,
      body: assembleDeliveryBody(deliveryBodyInput).body,
      headSha: repoRuntime.headSha,
      baseSha: baseSha!
    }),
    throwExit: input.throwExit
  });
  const wireResult = await wireExecuteDelivery({
    runId,
    runDir,
    authorization: authorization!,
    intent: {
      title: intent.title,
      archetype: (intent.goalArchetype ?? "cosmetic-tweak") as
        | "cosmetic-tweak"
        | "feature-add"
        | "refactor"
        | "bugfix"
    },
    target: intent.capabilityEnvelope.delivery.target,
    bodyInput: { ...deliveryBodyInput },
    token: token!,
    octokit: octokit!,
    baseSha: baseSha!,
    workspaceDir: repoRuntime.cloneDir,
    commitFilepaths: deliveryCommitFilepathsForEnvelope(intent.capabilityEnvelope),
    fs: fsPromises,
    signal: input.signal,
    requiredChecks: input.requiredChecks
  });
  if (wireResult.status === "delivery-blocked") {
    input.throwExit("Delivery execution was blocked; see delivery/delivery-result.json.", 1);
  }
  return {
    deliveryAuthorizationPayloadWritten: true,
    deliveryWireStatus: wireResult.status,
    deliveryResult: wireResult.deliveryResult
  };
}

export function deliveryCommitFilepathsForEnvelope(envelope: CapabilityEnvelope): readonly string[] {
  return [...new Set(envelope.repoScopes.filter((scope) => scope.access === "write").map((scope) => scope.path))].sort();
}

export function isDeliveryCiCompletionVerdict(verdict: DeliveryResult["ciVerdict"] | undefined): boolean {
  return verdict === "pass" || verdict === "no-checks-configured";
}

export function buildAuthorizationPayload(
  input: Omit<AuthorizationPayload, "schemaVersion" | "mintedAt">
): AuthorizationPayload {
  return {
    schemaVersion: "1.0.0",
    ...input,
    mintedAt: new Date().toISOString()
  };
}

export async function writeDeliveryAuthorizationPayloadAtomic(input: {
  readonly runDir: string;
  readonly payload: AuthorizationPayload;
  readonly throwExit: (message: string, code: number) => never;
}): Promise<void> {
  if (!isAuthorizationPayload(input.payload)) {
    input.throwExit("Delivery authorization payload failed schema validation.", 1);
  }
  const path = resolve(input.runDir, "delivery", "authorization.json");
  const tmp = `${path}.tmp`;
  await fsPromises.mkdir(resolve(input.runDir, "delivery"), { recursive: true });
  await fsPromises.writeFile(tmp, JSON.stringify(sortJsonValue(input.payload), null, 2));
  await fsPromises.rename(tmp, path);
}
