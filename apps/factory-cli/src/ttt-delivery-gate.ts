import type { ToyVerificationPreflightResult } from "./toy-verification-preflight.js";
import {
  detectStressCapBreach,
  resolveStressCaps,
  type FactoryStressCapsConfig,
  type StressCapBreach,
  type StressCapSource,
  type TttDeliveryResolvedCaps
} from "./stress/stress-caps.js";

type PassVerdict = "pass";

export interface TttDeliveryEvidence {
  readonly sessionId?: string;
  readonly runId?: string;
  readonly seedId: string;
  readonly draftPath: string;
  readonly confirmedIntentPath: string;
  readonly prUrl: string;
  readonly ciVerdict: string;
  readonly playwrightE2e: string;
  readonly propertyTest: string;
  readonly tauriDebugBuild: string;
  readonly immutablePreflight: ToyVerificationPreflightResult;
  readonly checkedAt: string;
}

export type TttDeliveredResult =
  | {
      readonly ok: true;
      readonly tttDelivered: true;
      readonly label: "ttt-delivered";
      readonly blockers: readonly [];
    }
  | {
      readonly ok: false;
      readonly tttDelivered: false;
      readonly blockers: readonly string[];
    };

export interface EvaluateTttDeliveryCapsInput {
  readonly sessionId: string;
  readonly attemptCount: number;
  readonly startedAt: string;
  readonly now?: string;
  readonly cli?: Partial<Pick<TttDeliveryResolvedCaps, "maxAttempts" | "maxWallClockDays">>;
  readonly config?: FactoryStressCapsConfig;
}

export type TttDeliveryCapsResult =
  | {
      readonly ok: true;
      readonly caps: TttDeliveryResolvedCaps;
      readonly sources: {
        readonly maxAttempts: StressCapSource;
        readonly maxWallClockDays: StressCapSource;
      };
    }
  | {
      readonly ok: false;
      readonly caps: TttDeliveryResolvedCaps;
      readonly sources: {
        readonly maxAttempts: StressCapSource;
        readonly maxWallClockDays: StressCapSource;
      };
      readonly breach: StressCapBreach;
      readonly capSource: StressCapSource;
      readonly capBreachPath: string;
      readonly blockers: readonly string[];
    };

export type Phase11DeliveryGateResult =
  | {
      readonly ok: true;
      readonly tttDelivered: true;
      readonly stressClean: true;
    }
  | {
      readonly ok: false;
      readonly code: "phase-11-gate-not-met";
      readonly tttDelivered: boolean;
      readonly stressClean: boolean;
      readonly blockers: readonly string[];
    };

export function evaluateTttDelivered(evidence: TttDeliveryEvidence): TttDeliveredResult {
  const blockers: string[] = [];
  const stressInputsPrefix = expectedStressInputsPrefix(evidence);

  if (evidence.seedId !== "ttt-game") blockers.push("seedId");
  if (stressInputsPrefix === null || !isUnderStressInputs(evidence.draftPath, stressInputsPrefix)) {
    blockers.push("draftPath");
  }
  if (stressInputsPrefix === null || !isUnderStressInputs(evidence.confirmedIntentPath, stressInputsPrefix)) {
    blockers.push("confirmedIntentPath");
  }
  if (evidence.prUrl.trim().length === 0) blockers.push("missing-prUrl");
  requirePass(blockers, "ciVerdict", evidence.ciVerdict);
  requirePass(blockers, "playwrightE2e", evidence.playwrightE2e);
  requirePass(blockers, "propertyTest", evidence.propertyTest);
  requirePass(blockers, "tauriDebugBuild", evidence.tauriDebugBuild);
  if (evidence.immutablePreflight.ok !== true) blockers.push("immutable-preflight");
  if (evidence.checkedAt.trim().length === 0) blockers.push("missing-checkedAt");

  if (blockers.length > 0) {
    return {
      ok: false,
      tttDelivered: false,
      blockers
    };
  }

  return {
    ok: true,
    tttDelivered: true,
    label: "ttt-delivered",
    blockers: []
  };
}

export function evaluateTttDeliveryCaps(input: EvaluateTttDeliveryCapsInput): TttDeliveryCapsResult {
  const resolveInput: Parameters<typeof resolveStressCaps>[0] = {};
  if (input.cli !== undefined) Object.assign(resolveInput, { cli: { "ttt-delivery": input.cli } });
  if (input.config !== undefined) Object.assign(resolveInput, { config: input.config });
  const resolved = resolveStressCaps(resolveInput);
  const caps = resolved["ttt-delivery"];
  const sources = resolved.sources["ttt-delivery"];
  const breachInput: Parameters<typeof detectStressCapBreach>[0] = {
    shape: "ttt-delivery",
    count: input.attemptCount,
    startedAt: input.startedAt,
    caps: resolved
  };
  if (input.now !== undefined) Object.assign(breachInput, { now: input.now });
  const breach = detectStressCapBreach(breachInput);

  if (breach === null) {
    return {
      ok: true,
      caps,
      sources
    };
  }

  const capSource = breach.kind === "run-count" ? sources.maxAttempts : sources.maxWallClockDays;
  return {
    ok: false,
    caps,
    sources,
    breach,
    capSource,
    capBreachPath: phase11CapBreachPath(input.sessionId),
    blockers: [
      `ttt-delivery-cap-breach:${breach.kind}`,
      `requires:${phase11CapBreachPath(input.sessionId)}`
    ]
  };
}

export function evaluatePhase11DeliveryGate(input: {
  readonly tttDelivered: boolean;
  readonly stressClean: boolean;
  readonly blockers?: readonly string[];
}): Phase11DeliveryGateResult {
  if (input.tttDelivered && input.stressClean) {
    return {
      ok: true,
      tttDelivered: true,
      stressClean: true
    };
  }

  return {
    ok: false,
    code: "phase-11-gate-not-met",
    tttDelivered: input.tttDelivered,
    stressClean: input.stressClean,
    blockers: input.blockers ?? []
  };
}

export function phase11CapBreachPath(sessionId: string): string {
  return `.protostar/stress/${normalizeSegment(sessionId)}/phase-11-cap-breach.json`;
}

function requirePass(blockers: string[], field: string, value: string): void {
  if (value !== ("pass" satisfies PassVerdict)) blockers.push(field);
}

function expectedStressInputsPrefix(evidence: TttDeliveryEvidence): string | null {
  if (evidence.sessionId !== undefined && evidence.runId !== undefined) {
    return `.protostar/stress/${normalizeSegment(evidence.sessionId)}/inputs/${normalizeSegment(evidence.runId)}/`;
  }
  const match = /^\.protostar\/stress\/([^/]+)\/inputs\/([^/]+)\//.exec(normalizePath(evidence.draftPath));
  if (match === null) return null;
  return `.protostar/stress/${match[1]}/inputs/${match[2]}/`;
}

function isUnderStressInputs(path: string, prefix: string): boolean {
  const normalizedPath = normalizePath(path);
  if (normalizedPath.length === 0) return false;
  return normalizedPath.startsWith(prefix) && normalizedPath.length > prefix.length;
}

function normalizePath(path: string): string {
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "");
}

function normalizeSegment(segment: string): string {
  return normalizePath(segment).replace(/^\/+/, "").replace(/\/+$/, "");
}
