import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  authorizeNetworkOp,
  type AdmissionDecisionBase,
  type PrecedenceDecision
} from "@protostar/authority";
import type { CapabilityEnvelope } from "@protostar/intent";
import { preflightLmstudio, type ResolvedFactoryConfig } from "@protostar/lmstudio-adapter";

import {
  appendRefusalIndexEntry,
  buildTerminalStatusArtifact,
  REFUSAL_INDEX_SCHEMA_VERSION,
  REFUSALS_INDEX_FILE_NAME,
  TERMINAL_STATUS_ARTIFACT_NAME
} from "./refusals-index.js";
import { writeAdmissionDecision } from "./write-admission-decision.js";

export interface CoderAdapterAdmissionInput {
  readonly runId: string;
  readonly runDir: string;
  readonly outDir: string;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly factoryConfig: ResolvedFactoryConfig;
  readonly precedenceDecision: PrecedenceDecision;
  readonly signal: AbortSignal;
  readonly fetchImpl?: typeof fetch;
}

export type CoderAdapterAdmissionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: CliExitError };

export class CliExitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number
  ) {
    super(message);
  }
}

type CoderAdapterAdmissionEvidence = Record<string, unknown>;

export async function coderAdapterReadyAdmission(
  input: CoderAdapterAdmissionInput
): Promise<CoderAdapterAdmissionResult> {
  const coder = input.factoryConfig.config.adapters.coder;
  const url = `${trimTrailingSlash(coder.baseUrl)}/models`;
  const mint = authorizeNetworkOp({
    method: "GET",
    url,
    resolvedEnvelope: input.resolvedEnvelope
  });

  if (!mint.ok) {
    return block(input, "network-mint-refused", { url, errors: mint.errors });
  }

  const result = await preflightLmstudio({
    authorizedOp: mint.authorized,
    model: coder.model,
    signal: input.signal,
    ...(input.fetchImpl !== undefined ? { fetchImpl: input.fetchImpl } : {})
  });

  switch (result.outcome) {
    case "ok":
      await writeAdmissionDecision({
        runDir: input.runDir,
        gate: "coder-adapter-ready",
        decision: admissionDecision({
          input,
          outcome: "allow",
          evidence: {
            url,
            model: coder.model,
            availableModels: result.availableModels
          }
        })
      });
      return { ok: true };
    case "unreachable":
      return block(input, "lmstudio-unreachable", {
        url,
        errorClass: result.errorClass,
        errorMessage: result.errorMessage
      });
    case "model-not-loaded":
      return block(input, "lmstudio-model-not-loaded", {
        url,
        model: coder.model,
        availableModels: result.availableModels
      });
    case "empty-models":
      return block(input, "lmstudio-model-not-loaded", {
        url,
        model: coder.model,
        availableModels: []
      });
    case "http-error":
      return block(input, "lmstudio-http-error", {
        url,
        status: result.status,
        bodySnippet: result.bodySnippet
      });
    default:
      return assertExhaustive(result);
  }
}

async function block(
  input: CoderAdapterAdmissionInput,
  reason: string,
  evidence: CoderAdapterAdmissionEvidence
): Promise<CoderAdapterAdmissionResult> {
  const decision = admissionDecision({
    input,
    outcome: "block",
    evidence: {
      reason,
      ...evidence
    }
  });
  const { artifactPath } = await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "coder-adapter-ready",
    decision
  });
  await writeRefusalArtifacts({
    runDir: input.runDir,
    outDir: input.outDir,
    runId: input.runId,
    reason,
    refusalArtifact: artifactPath
  });
  return { ok: false, error: new CliExitError(reason, 1) };
}

function admissionDecision(input: {
  readonly input: CoderAdapterAdmissionInput;
  readonly outcome: AdmissionDecisionBase<CoderAdapterAdmissionEvidence>["outcome"];
  readonly evidence: CoderAdapterAdmissionEvidence;
}): AdmissionDecisionBase<CoderAdapterAdmissionEvidence> {
  return {
    schemaVersion: "1.0.0",
    runId: input.input.runId,
    gate: "coder-adapter-ready",
    outcome: input.outcome,
    timestamp: new Date().toISOString(),
    precedenceResolution: {
      status: input.input.precedenceDecision.status,
      ...(input.input.precedenceDecision.status !== "no-conflict"
        ? { precedenceDecisionPath: resolve("precedence-decision.json") }
        : {})
    },
    evidence: input.evidence
  };
}

async function writeRefusalArtifacts(input: {
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly reason: string;
  readonly refusalArtifact: string;
}): Promise<void> {
  await mkdir(input.runDir, { recursive: true });
  const artifactName = "coder-adapter-ready-admission-decision.json";
  await writeFile(
    resolve(input.runDir, TERMINAL_STATUS_ARTIFACT_NAME),
    `${JSON.stringify(buildTerminalStatusArtifact({
      runId: input.runId,
      stage: "coder-adapter-ready",
      reason: input.reason,
      refusalArtifact: artifactName
    }), null, 2)}\n`,
    "utf8"
  );
  await appendRefusalIndexEntry(resolve(input.outDir, "..", REFUSALS_INDEX_FILE_NAME), {
    runId: input.runId,
    timestamp: new Date().toISOString(),
    stage: "coder-adapter-ready",
    reason: input.reason,
    artifactPath: `runs/${input.runId}/${artifactName}`,
    schemaVersion: REFUSAL_INDEX_SCHEMA_VERSION
  });
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function assertExhaustive(value: never): never {
  throw new Error(`Unhandled preflight result: ${String(value)}`);
}
