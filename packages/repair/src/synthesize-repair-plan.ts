import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";
import type {
  JudgeCritique,
  ModelReviewResult,
  RepairPlan,
  ReviewFinding,
  ReviewGate
} from "@protostar/review";

export interface SynthesizeRepairPlanInput {
  readonly runId: string;
  readonly attempt: number;
  readonly plan: AdmittedPlanExecutionArtifact;
  readonly mechanical: ReviewGate;
  readonly model?: ModelReviewResult;
  readonly dependentTaskIds: readonly string[];
}

interface RepairCritiqueGroup {
  readonly mechanicalCritiques: ReviewFinding[];
  readonly modelCritiques: JudgeCritique[];
}

export class EmptyRepairSynthesisError extends Error {
  constructor() {
    super("Cannot synthesize a repair plan without mechanical findings or model critiques.");
    this.name = "EmptyRepairSynthesisError";
  }
}

export function synthesizeRepairPlan(input: SynthesizeRepairPlanInput): RepairPlan {
  const critiquesByTaskId = new Map<string, RepairCritiqueGroup>();

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

function groupFor(groups: Map<string, RepairCritiqueGroup>, taskId: string): RepairCritiqueGroup {
  const existing = groups.get(taskId);
  if (existing !== undefined) {
    return existing;
  }

  const group: RepairCritiqueGroup = {
    mechanicalCritiques: [],
    modelCritiques: []
  };
  groups.set(taskId, group);
  return group;
}
