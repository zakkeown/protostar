import type { StageArtifactRef } from "@protostar/artifacts";

export interface MechanicalCritiqueRef {
  readonly ruleId: string;
  readonly severity: "info" | "minor" | "major" | "critical";
  readonly repairTaskId?: string;
  readonly evidence?: Readonly<Record<string, unknown>>;
  readonly message: string;
}

export interface ModelCritiqueRef {
  readonly judgeId: string;
  readonly verdict: "pass" | "repair" | "block";
  readonly rationale: string;
  readonly taskRefs: readonly string[];
}

export interface AdapterAttemptRef {
  readonly planTaskId: string;
  readonly attempt: number;
  readonly evidenceArtifact?: StageArtifactRef;
}

export interface RepairContext {
  readonly previousAttempt: AdapterAttemptRef;
  readonly mechanicalCritiques: readonly MechanicalCritiqueRef[];
  readonly modelCritiques?: readonly ModelCritiqueRef[];
}
