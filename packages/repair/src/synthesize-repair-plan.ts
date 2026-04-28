import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

export interface RepairFindingInput {
  readonly repairTaskId?: string;
}

export interface RepairGateInput {
  readonly findings: readonly RepairFindingInput[];
}

export interface RepairJudgeCritiqueInput {
  readonly taskRefs: readonly string[];
}

export interface RepairModelReviewInput {
  readonly critiques: readonly RepairJudgeCritiqueInput[];
}

export interface SynthesizedRepairTask<
  Finding extends RepairFindingInput = RepairFindingInput,
  Critique extends RepairJudgeCritiqueInput = RepairJudgeCritiqueInput
> {
  readonly planTaskId: string;
  readonly mechanicalCritiques: readonly Finding[];
  readonly modelCritiques?: readonly Critique[];
}

export interface SynthesizedRepairPlan<
  Finding extends RepairFindingInput = RepairFindingInput,
  Critique extends RepairJudgeCritiqueInput = RepairJudgeCritiqueInput
> {
  readonly runId: string;
  readonly attempt: number;
  readonly repairs: readonly SynthesizedRepairTask<Finding, Critique>[];
  readonly dependentTaskIds: readonly string[];
}

export interface SynthesizeRepairPlanInput<
  Finding extends RepairFindingInput = RepairFindingInput,
  Critique extends RepairJudgeCritiqueInput = RepairJudgeCritiqueInput
> {
  readonly runId: string;
  readonly attempt: number;
  readonly plan: AdmittedPlanExecutionArtifact;
  readonly mechanical: {
    readonly findings: readonly Finding[];
  };
  readonly model?: {
    readonly critiques: readonly Critique[];
  };
  readonly dependentTaskIds: readonly string[];
}

interface RepairCritiqueGroup<
  Finding extends RepairFindingInput,
  Critique extends RepairJudgeCritiqueInput
> {
  readonly mechanicalCritiques: Finding[];
  readonly modelCritiques: Critique[];
}

export class EmptyRepairSynthesisError extends Error {
  constructor() {
    super("Cannot synthesize a repair plan without mechanical findings or model critiques.");
    this.name = "EmptyRepairSynthesisError";
  }
}

export function synthesizeRepairPlan<
  Finding extends RepairFindingInput,
  Critique extends RepairJudgeCritiqueInput
>(input: SynthesizeRepairPlanInput<Finding, Critique>): SynthesizedRepairPlan<Finding, Critique> {
  const critiquesByTaskId = new Map<string, RepairCritiqueGroup<Finding, Critique>>();

  for (const finding of input.mechanical.findings) {
    if (finding.repairTaskId === undefined) {
      continue;
    }

    groupFor(critiquesByTaskId, finding.repairTaskId).mechanicalCritiques.push(finding);
  }

  for (const critique of input.model?.critiques ?? []) {
    for (const taskRef of critique.taskRefs) {
      groupFor(critiquesByTaskId, taskRef).modelCritiques.push(critique);
    }
  }

  if (critiquesByTaskId.size === 0) {
    throw new EmptyRepairSynthesisError();
  }

  const repairs = input.plan.tasks.flatMap((task) => {
    const group = critiquesByTaskId.get(task.planTaskId);
    if (group === undefined) {
      return [];
    }

    return [
      {
        planTaskId: task.planTaskId,
        mechanicalCritiques: group.mechanicalCritiques,
        ...(group.modelCritiques.length > 0 ? { modelCritiques: group.modelCritiques } : {})
      }
    ];
  });

  if (repairs.length === 0) {
    throw new EmptyRepairSynthesisError();
  }

  return {
    runId: input.runId,
    attempt: input.attempt,
    repairs,
    dependentTaskIds: input.dependentTaskIds
  };
}

function groupFor<Finding extends RepairFindingInput, Critique extends RepairJudgeCritiqueInput>(
  groups: Map<string, RepairCritiqueGroup<Finding, Critique>>,
  taskId: string
): RepairCritiqueGroup<Finding, Critique> {
  const existing = groups.get(taskId);
  if (existing !== undefined) {
    return existing;
  }

  const group: RepairCritiqueGroup<Finding, Critique> = {
    mechanicalCritiques: [],
    modelCritiques: []
  };
  groups.set(taskId, group);
  return group;
}
