import { StressEventSchema, StressReportSchema, type StressEvent, type StressReport, type StressShape } from "@protostar/artifacts";

import {
  evaluateTttDelivered,
  evaluateTttDeliveryCaps,
  type EvaluateTttDeliveryCapsInput,
  type TttDeliveryEvidence
} from "../ttt-delivery-gate.js";

export type RequiredFaultScenario = "network-drop" | "llm-timeout" | "disk-full" | "abort-signal";
export type RequiredFaultMechanism =
  | "adapter-network-refusal"
  | "llm-abort-timeout"
  | "disk-write-enospc"
  | "external-abort-signal";

export interface StressCleanInput {
  readonly reports: readonly unknown[];
  readonly faultObservationEvents: readonly unknown[];
}

export type StressCleanResult =
  | {
      readonly stressClean: true;
      readonly blockers: readonly [];
    }
  | {
      readonly stressClean: false;
      readonly blockers: readonly string[];
    };

export interface Phase11GateInput extends StressCleanInput {
  readonly tttEvidence: TttDeliveryEvidence;
  readonly tttCaps: EvaluateTttDeliveryCapsInput;
}

export type Phase11GateResult =
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

const REQUIRED_SHAPES = ["sustained-load", "concurrency", "fault-injection"] as const satisfies readonly StressShape[];
export const PHASE_11_TTT_DELIVERY_SHAPE = "ttt-delivery";
const REQUIRED_FAULT_MECHANISMS = {
  "network-drop": "adapter-network-refusal",
  "llm-timeout": "llm-abort-timeout",
  "disk-full": "disk-write-enospc",
  "abort-signal": "external-abort-signal"
} as const satisfies Readonly<Record<RequiredFaultScenario, RequiredFaultMechanism>>;

const TERMINAL_RUN_OUTCOMES = new Set(["pass", "failed", "blocked", "cancelled", "orphaned"]);

export function evaluateStressClean(input: StressCleanInput): StressCleanResult {
  const blockers: string[] = [];
  const reportsByShape = new Map<StressShape, StressReport[]>();

  input.reports.forEach((candidate, index) => {
    const parsed = StressReportSchema.safeParse(candidate);
    if (!parsed.success) {
      blockers.push(hasOwn(candidate, "finishedAt") ? `invalid-stress-report:${index}` : `missing-finished-at:${index}`);
      return;
    }

    const report = parsed.data;
    const reports = reportsByShape.get(report.shape) ?? [];
    reports.push(report);
    reportsByShape.set(report.shape, reports);

    if (report.finishedAt.trim().length === 0) {
      blockers.push(`missing-finished-at:${report.shape}`);
    }
    if (report.wedgeEvent !== undefined) {
      blockers.push(`wedge-event:${report.shape}`);
    }
    if (report.capBreached !== undefined) {
      blockers.push(`cap-breached:${report.shape}`);
    }
    if (report.perRun.some((run) => !TERMINAL_RUN_OUTCOMES.has(run.outcome))) {
      blockers.push(`nonterminal-run-outcome:${report.shape}`);
    }
  });

  for (const shape of REQUIRED_SHAPES) {
    const reports = reportsByShape.get(shape) ?? [];
    if (reports.length === 0) {
      blockers.push(`missing-stress-report:${shape}`);
    } else if (reports.length > 1) {
      blockers.push(`duplicate-stress-report:${shape}`);
    }
  }

  blockers.push(...evaluateFaultObservationCoverage(input.faultObservationEvents));

  return blockers.length === 0
    ? { stressClean: true, blockers: [] }
    : { stressClean: false, blockers };
}

export function evaluatePhase11Gate(input: Phase11GateInput): Phase11GateResult {
  const stress = evaluateStressClean(input);
  const ttt = evaluateTttDelivered(input.tttEvidence);
  const caps = evaluateTttDeliveryCaps(input.tttCaps);
  if (stress.stressClean && ttt.tttDelivered && caps.ok) {
    return {
      ok: true,
      tttDelivered: true,
      stressClean: true
    };
  }

  return {
    ok: false,
    code: "phase-11-gate-not-met",
    tttDelivered: ttt.tttDelivered,
    stressClean: stress.stressClean,
    blockers: [...ttt.blockers, ...stress.blockers, ...(caps.ok ? [] : caps.blockers)]
  };
}

function evaluateFaultObservationCoverage(candidates: readonly unknown[]): readonly string[] {
  const blockers: string[] = [];
  const observations = candidates
    .map((candidate) => StressEventSchema.safeParse(candidate))
    .filter((result): result is { readonly success: true; readonly data: StressEvent } => result.success)
    .map((result) => result.data)
    .filter((event) => event.type === "fault-observed")
    .map((event) => event.payload);

  for (const [scenario, expectedMechanism] of Object.entries(REQUIRED_FAULT_MECHANISMS) as ReadonlyArray<
    readonly [RequiredFaultScenario, RequiredFaultMechanism]
  >) {
    const observedForScenario = observations.filter((payload) => payload["scenario"] === scenario && payload["observed"] === true);
    if (observedForScenario.length === 0) {
      blockers.push(`missing-fault-observation:${scenario}`);
      continue;
    }
    if (!observedForScenario.some((payload) => payload["mechanism"] === expectedMechanism)) {
      blockers.push(`wrong-fault-mechanism:${scenario}`);
    }
  }

  return blockers;
}

function hasOwn(value: unknown, key: string): boolean {
  return typeof value === "object" && value !== null && Object.hasOwn(value, key);
}
