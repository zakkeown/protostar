import { parseConfirmedIntent, type ConfirmedIntent } from "@protostar/intent";

import type { AdmissionDecisionBase, GateName } from "../admission-decision/base.js";
import type { PrecedenceDecision } from "../precedence/precedence-decision.js";
import type { PolicySnapshot } from "../signature/policy-snapshot.js";
import {
  verifyConfirmedIntentSignature,
  type VerifyConfirmedIntentSignatureResult
} from "../signature/verify.js";
import { type FsAdapter, StageReaderError } from "./fs-adapter.js";

/** Parsed but unverified intent — for diagnostics and legacy inspection only. */
export type ParsedConfirmedIntent = ConfirmedIntent;

export interface AdmissionDecisionIndexEntry {
  readonly gate: GateName;
  readonly artifactPath: string;
  readonly [key: string]: unknown;
}

export interface AuthorityStageReader {
  intentAdmissionDecision(): Promise<AdmissionDecisionBase>;
  planningAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  capabilityAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  repoScopeAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  workspaceTrustAdmissionDecision(): Promise<AdmissionDecisionBase | null>;
  precedenceDecision(): Promise<PrecedenceDecision | null>;
  policySnapshot(): Promise<PolicySnapshot | null>;
  /**
   * Reads and parses intent.json without signature verification.
   * Use ONLY for diagnostics or legacy inspection. Not authority.
   */
  readParsedConfirmedIntent(): Promise<ParsedConfirmedIntent>;
  /**
   * Returns a verified, branded ConfirmedIntent. Throws StageReaderError if
   * signature verification fails, snapshot is missing, or intent is malformed.
   */
  confirmedIntent(): Promise<ConfirmedIntent>;
  verifyConfirmedIntent(): Promise<VerifyConfirmedIntentSignatureResult>;
  admissionDecisionsIndex(): Promise<readonly AdmissionDecisionIndexEntry[]>;
}

export function createAuthorityStageReader(runDir: string, fs: FsAdapter): AuthorityStageReader {
  async function optionalAdmissionDecision(filename: string, gate: GateName): Promise<AdmissionDecisionBase | null> {
    const path = `${runDir}/${filename}`;
    if (!(await fs.exists(path))) return null;
    return validateAdmissionDecision(await fs.readFile(path), gate, path);
  }

  return {
    async intentAdmissionDecision() {
      const newPath = `${runDir}/intent-admission-decision.json`;
      if (await fs.exists(newPath)) {
        return validateAdmissionDecision(await fs.readFile(newPath), "intent", newPath);
      }

      const legacyPath = `${runDir}/admission-decision.json`;
      if (await fs.exists(legacyPath)) {
        return validateLegacyIntentAdmissionDecision(await fs.readFile(legacyPath), legacyPath);
      }

      throw new StageReaderError(
        "intent-admission-decision",
        "neither intent-admission-decision.json nor admission-decision.json present",
        newPath
      );
    },

    planningAdmissionDecision() {
      return optionalAdmissionDecision("planning-admission-decision.json", "planning");
    },

    capabilityAdmissionDecision() {
      return optionalAdmissionDecision("capability-admission-decision.json", "capability");
    },

    repoScopeAdmissionDecision() {
      return optionalAdmissionDecision("repo-scope-admission-decision.json", "repo-scope");
    },

    workspaceTrustAdmissionDecision() {
      return optionalAdmissionDecision("workspace-trust-admission-decision.json", "workspace-trust");
    },

    async precedenceDecision() {
      const path = `${runDir}/precedence-decision.json`;
      if (!(await fs.exists(path))) return null;
      return validatePrecedenceDecision(await fs.readFile(path), path);
    },

    async policySnapshot() {
      const path = `${runDir}/policy-snapshot.json`;
      if (!(await fs.exists(path))) return null;
      return validatePolicySnapshot(await fs.readFile(path), path);
    },

    async readParsedConfirmedIntent() {
      const path = `${runDir}/intent.json`;
      return parsedConfirmedIntent(await fs.readFile(path), path);
    },

    async confirmedIntent() {
      const path = `${runDir}/intent.json`;
      const result = await this.verifyConfirmedIntent();
      if (!result.ok) {
        throw new StageReaderError(
          "intent.json",
          `confirmed intent signature verification failed: ${result.errors.join("; ")}`,
          path
        );
      }
      return result.verified.intent;
    },

    async verifyConfirmedIntent() {
      const intent = await this.readParsedConfirmedIntent();
      const snapshot = await this.policySnapshot();
      if (snapshot === null) {
        return {
          ok: false,
          errors: ["policy-snapshot.json missing - cannot verify signature"],
          mismatch: { field: "policySnapshotHash" as const, expected: "present", actual: "missing" }
        };
      }

      const precedence = await this.precedenceDecision();
      const resolvedEnvelope = precedence?.resolvedEnvelope ?? snapshot.resolvedEnvelope;
      return verifyConfirmedIntentSignature(intent, snapshot, resolvedEnvelope);
    },

    async admissionDecisionsIndex() {
      const path = `${runDir}/admission-decisions.jsonl`;
      if (!(await fs.exists(path))) return [];
      return (await fs.readFile(path))
        .split("\n")
        .filter((line) => line.length > 0)
        .map((line, index) => validateAdmissionDecisionIndexEntry(line, path, index + 1));
    }
  };
}

function validateAdmissionDecision(raw: string, gate: GateName, path: string): AdmissionDecisionBase {
  const parsed = parseJsonObject(raw, "admission-decision", path);
  if (parsed["schemaVersion"] !== "1.0.0") {
    throw new StageReaderError("admission-decision", "schemaVersion must be \"1.0.0\"", path);
  }
  if (parsed["gate"] !== gate) {
    throw new StageReaderError("admission-decision", `gate must be "${gate}"`, path);
  }
  if (typeof parsed["runId"] !== "string") {
    throw new StageReaderError("admission-decision", "runId must be a string", path);
  }
  if (!isAdmissionOutcome(parsed["outcome"])) {
    throw new StageReaderError("admission-decision", "outcome must be allow, block, or escalate", path);
  }
  if (typeof parsed["timestamp"] !== "string") {
    throw new StageReaderError("admission-decision", "timestamp must be a string", path);
  }
  if (!isRecord(parsed["precedenceResolution"])) {
    throw new StageReaderError("admission-decision", "precedenceResolution must be an object", path);
  }
  if (!isRecord(parsed["evidence"])) {
    throw new StageReaderError("admission-decision", "evidence must be an object", path);
  }
  return parsed as unknown as AdmissionDecisionBase;
}

function validateLegacyIntentAdmissionDecision(raw: string, path: string): AdmissionDecisionBase {
  const parsed = parseJsonObject(raw, "admission-decision", path);
  if (parsed["gate"] === undefined) {
    return validateAdmissionDecision(JSON.stringify({ ...parsed, gate: "intent" }), "intent", path);
  }
  return validateAdmissionDecision(raw, "intent", path);
}

function validatePrecedenceDecision(raw: string, path: string): PrecedenceDecision {
  const parsed = parseJsonObject(raw, "precedence-decision", path);
  if (parsed["schemaVersion"] !== "1.0.0") {
    throw new StageReaderError("precedence-decision", "schemaVersion must be \"1.0.0\"", path);
  }
  if (!["no-conflict", "resolved", "blocked-by-tier"].includes(String(parsed["status"]))) {
    throw new StageReaderError("precedence-decision", "status must be no-conflict, resolved, or blocked-by-tier", path);
  }
  if (!isRecord(parsed["resolvedEnvelope"])) {
    throw new StageReaderError("precedence-decision", "resolvedEnvelope must be an object", path);
  }
  if (!Array.isArray(parsed["tiers"])) {
    throw new StageReaderError("precedence-decision", "tiers must be an array", path);
  }
  if (!Array.isArray(parsed["blockedBy"])) {
    throw new StageReaderError("precedence-decision", "blockedBy must be an array", path);
  }
  return parsed as unknown as PrecedenceDecision;
}

function validatePolicySnapshot(raw: string, path: string): PolicySnapshot {
  const parsed = parseJsonObject(raw, "policy-snapshot", path);
  if (parsed["schemaVersion"] !== "1.0.0") {
    throw new StageReaderError("policy-snapshot", "schemaVersion must be \"1.0.0\"", path);
  }
  if (typeof parsed["capturedAt"] !== "string") {
    throw new StageReaderError("policy-snapshot", "capturedAt must be a string", path);
  }
  if (!isRecord(parsed["policy"])) {
    throw new StageReaderError("policy-snapshot", "policy must be an object", path);
  }
  if (!isRecord(parsed["resolvedEnvelope"])) {
    throw new StageReaderError("policy-snapshot", "resolvedEnvelope must be an object", path);
  }
  if (parsed["repoPolicyHash"] !== undefined && typeof parsed["repoPolicyHash"] !== "string") {
    throw new StageReaderError("policy-snapshot", "repoPolicyHash must be a string when present", path);
  }
  return parsed as unknown as PolicySnapshot;
}

/**
 * Reads and parses intent.json. Applies legacy 1.0.0 upconversion.
 * Returns parsed (unverified) intent — not authority. Only for diagnostics.
 */
function parsedConfirmedIntent(raw: string, path: string): ParsedConfirmedIntent {
  const parsed = parseJsonObject(raw, "intent.json", path);
  const intentInput = upconvertLegacyConfirmedIntent(parsed, path);
  const result = parseConfirmedIntent(intentInput);
  if (!result.ok) {
    throw new StageReaderError("intent.json", result.errors.join("; "), path);
  }
  return result.data as ParsedConfirmedIntent;
}

function upconvertLegacyConfirmedIntent(parsed: Record<string, unknown>, path: string): Record<string, unknown> {
  if (parsed["schemaVersion"] !== "1.0.0") return parsed;
  if (parsed["signature"] !== null) {
    throw new StageReaderError(
      "intent.json",
      "legacy 1.0.0 with non-null signature is unsupported - pre-Phase-2 fixtures must have signature: null",
      path
    );
  }
  const capabilityEnvelope = isRecord(parsed["capabilityEnvelope"])
    ? {
        ...parsed["capabilityEnvelope"],
        workspace: isRecord(parsed["capabilityEnvelope"]["workspace"])
          ? parsed["capabilityEnvelope"]["workspace"]
          : { allowDirty: false },
        network: isRecord(parsed["capabilityEnvelope"]["network"])
          ? parsed["capabilityEnvelope"]["network"]
          : { allow: "loopback" },
        budget: {
          ...(isRecord(parsed["capabilityEnvelope"]["budget"]) ? parsed["capabilityEnvelope"]["budget"] : {}),
          adapterRetriesPerTask: 4,
          taskWallClockMs: 180_000,
          maxRepairLoops: isRecord(parsed["capabilityEnvelope"]["budget"]) &&
            typeof parsed["capabilityEnvelope"]["budget"]["maxRepairLoops"] === "number"
            ? parsed["capabilityEnvelope"]["budget"]["maxRepairLoops"]
            : 0
        }
      }
    : parsed["capabilityEnvelope"];
  return { ...parsed, capabilityEnvelope, schemaVersion: "1.3.0" };
}

function validateAdmissionDecisionIndexEntry(raw: string, path: string, line: number): AdmissionDecisionIndexEntry {
  const parsed = parseJsonObject(raw, "admission-decisions.jsonl", `${path}:${line}`);
  if (!isGateName(parsed["gate"])) {
    throw new StageReaderError("admission-decisions.jsonl", "gate must be a known gate literal", `${path}:${line}`);
  }
  if (typeof parsed["artifactPath"] === "string") {
    return parsed as unknown as AdmissionDecisionIndexEntry;
  }
  // Legacy fallback: old writers emitted `path` instead of `artifactPath`
  if (typeof parsed["path"] === "string") {
    return { ...parsed, artifactPath: parsed["path"] } as unknown as AdmissionDecisionIndexEntry;
  }
  throw new StageReaderError("admission-decisions.jsonl", "artifactPath must be a string", `${path}:${line}`);
}

function parseJsonObject(raw: string, artifact: string, path: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new StageReaderError(artifact, `invalid JSON: ${error instanceof Error ? error.message : String(error)}`, path);
  }
  if (!isRecord(parsed)) {
    throw new StageReaderError(artifact, "artifact must contain a JSON object", path);
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGateName(value: unknown): value is GateName {
  return value === "intent" ||
    value === "planning" ||
    value === "capability" ||
    value === "repo-scope" ||
    value === "workspace-trust";
}

function isAdmissionOutcome(value: unknown): value is AdmissionDecisionBase["outcome"] {
  return value === "allow" || value === "block" || value === "escalate";
}
