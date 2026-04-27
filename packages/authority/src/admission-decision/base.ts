import type { AdmissionDecisionOutcome } from "./outcome.js";

export type GateName =
  | "intent"
  | "planning"
  | "capability"
  | "repo-scope"
  | "workspace-trust";

export const GATE_NAMES: readonly GateName[] = Object.freeze([
  "intent",
  "planning",
  "capability",
  "repo-scope",
  "workspace-trust"
]);

export interface PrecedenceResolutionSummary {
  readonly status: "no-conflict" | "resolved" | "blocked-by-tier";
  readonly precedenceDecisionPath?: string;
}

export interface AdmissionDecisionBase<E extends object = object> {
  readonly schemaVersion: "1.0.0";
  readonly runId: string;
  readonly gate: GateName;
  readonly outcome: AdmissionDecisionOutcome;
  readonly timestamp: string;
  readonly precedenceResolution: PrecedenceResolutionSummary;
  readonly evidence: E;
}
