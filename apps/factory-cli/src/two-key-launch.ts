import { verifyConfirmedIntentSignature, resolveCanonicalizer } from "@protostar/authority";
import type { PolicySnapshot } from "@protostar/authority";
import { parseConfirmedIntent } from "@protostar/intent/confirmed-intent";
import type { ConfirmedIntentData } from "@protostar/intent/confirmed-intent";
import type { CapabilityEnvelope } from "@protostar/intent";
import { createHash } from "node:crypto";

import type { ParsedCliArgs } from "./cli-args.js";

export interface TwoKeyLaunchRefusal {
  readonly reason: string;
  readonly missingFlag: "--confirmed-intent";
  readonly provided: {
    readonly trust: "trusted";
    readonly confirmedIntent: undefined;
  };
}

export type TwoKeyLaunchResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly refusal: TwoKeyLaunchRefusal };

export function validateTwoKeyLaunch(args: ParsedCliArgs): TwoKeyLaunchResult {
  if (args.trust === "untrusted") {
    return { ok: true };
  }
  if (args.confirmedIntent !== undefined) {
    return { ok: true };
  }

  return {
    ok: false,
    refusal: {
      reason: "--trust trusted requires --confirmed-intent <path> (two-key launch)",
      missingFlag: "--confirmed-intent",
      provided: {
        trust: "trusted",
        confirmedIntent: undefined
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Verified two-key launch
// ---------------------------------------------------------------------------

export type TrustedLaunchVerificationReason =
  | "missing-file"
  | "malformed-json"
  | "invalid-confirmed-intent"
  | "unsigned-confirmed-intent"
  | "signature-mismatch"
  | "intent-body-mismatch";

export type TrustedLaunchVerificationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: TrustedLaunchVerificationReason; readonly errors: readonly string[] };

export interface VerifyTrustedLaunchInput {
  readonly confirmedIntentPath: string;
  readonly expectedIntent: ConfirmedIntentData;
  readonly policySnapshot: PolicySnapshot;
  readonly resolvedEnvelope: CapabilityEnvelope;
  readonly readFile: (path: string) => Promise<string>;
}

/**
 * Verifies that the supplied confirmed-intent file is a valid, properly signed
 * ConfirmedIntent that matches the current run's promoted intent, resolved
 * envelope, and policy snapshot. Returns structured errors for every failure
 * case so the caller can write appropriate escalation evidence.
 */
export async function verifyTrustedLaunchConfirmedIntent(
  input: VerifyTrustedLaunchInput
): Promise<TrustedLaunchVerificationResult> {
  const { confirmedIntentPath, expectedIntent, policySnapshot, resolvedEnvelope, readFile } = input;

  // Step 1: Read the file
  let raw: string;
  try {
    raw = await readFile(confirmedIntentPath);
  } catch {
    return {
      ok: false,
      reason: "missing-file",
      errors: [`Cannot read confirmed-intent file: ${confirmedIntentPath}`]
    };
  }

  // Step 2: Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {
      ok: false,
      reason: "malformed-json",
      errors: [`Confirmed-intent file is not valid JSON: ${confirmedIntentPath}`]
    };
  }

  // Step 3: Parse as ConfirmedIntent
  const parseResult = parseConfirmedIntent(parsed);
  if (!parseResult.ok) {
    return {
      ok: false,
      reason: "invalid-confirmed-intent",
      errors: parseResult.errors
    };
  }
  const confirmedIntentData = parseResult.data;

  // Step 4: Require a non-null signature
  if (confirmedIntentData.signature === null) {
    return {
      ok: false,
      reason: "unsigned-confirmed-intent",
      errors: ["Confirmed-intent file has no signature (signature is null)"]
    };
  }

  // Step 5: Verify the signature using the current run's policy snapshot and resolved envelope.
  // verifyConfirmedIntentSignature requires a branded ConfirmedIntent; cast via unknown since
  // parseConfirmedIntent returns ConfirmedIntentData (un-branded) which is structurally identical.
  const verifyResult = verifyConfirmedIntentSignature(
    confirmedIntentData as unknown as Parameters<typeof verifyConfirmedIntentSignature>[0],
    policySnapshot,
    resolvedEnvelope
  );
  if (!verifyResult.ok) {
    return {
      ok: false,
      reason: "signature-mismatch",
      errors: verifyResult.errors
    };
  }

  // Step 6: Compare intent body to expectedIntent (strip signatures from both, then canonicalize)
  const canonicalizer = resolveCanonicalizer("json-c14n@1.0");
  if (canonicalizer === null) {
    return {
      ok: false,
      reason: "signature-mismatch",
      errors: ["Cannot resolve json-c14n@1.0 canonicalizer for intent body comparison"]
    };
  }

  const fileIntentBody = stripSignature(confirmedIntentData);
  const expectedIntentBody = stripSignature(expectedIntent);
  const fileBodyHash = sha256Hex(canonicalizer(fileIntentBody));
  const expectedBodyHash = sha256Hex(canonicalizer(expectedIntentBody));

  if (fileBodyHash !== expectedBodyHash) {
    return {
      ok: false,
      reason: "intent-body-mismatch",
      errors: [
        "Confirmed-intent body does not match the current run's promoted intent.",
        `File intent hash: ${fileBodyHash}`,
        `Expected intent hash: ${expectedBodyHash}`
      ]
    };
  }

  return { ok: true };
}

function stripSignature<T extends { readonly signature: unknown }>(intent: T): Omit<T, "signature"> {
  const { signature: _signature, ...body } = intent;
  return body;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
