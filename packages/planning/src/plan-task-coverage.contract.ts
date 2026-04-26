import type { AcceptanceCriterionId } from "@protostar/intent";

import type { PlanTask, PlanTaskCoverageLink, PlanTaskId } from "./index.js";

type Assert<Condition extends true> = Condition;

type PlanTasksRequireStableTaskIds = PlanTask["id"] extends PlanTaskId ? true : false;
type PlanDependenciesRequireStableTaskIds = PlanTask["dependsOn"][number] extends PlanTaskId ? true : false;
type PlanCoverageRequiresAcceptedCriterionIds = PlanTask["covers"][number] extends AcceptanceCriterionId
  ? true
  : false;

type _PlanTasksRequireStableTaskIds = Assert<PlanTasksRequireStableTaskIds>;
type _PlanDependenciesRequireStableTaskIds = Assert<PlanDependenciesRequireStableTaskIds>;
type _PlanCoverageRequiresAcceptedCriterionIds = Assert<PlanCoverageRequiresAcceptedCriterionIds>;

const taskId = "task-contract-stable-id" as const satisfies PlanTaskId;
const acceptedCriterionId = "ac_contract_stable_id" as const satisfies AcceptanceCriterionId;

const coverageLink = {
  taskId,
  acceptedCriterionId
} as const satisfies PlanTaskCoverageLink;

const unstableTaskId = "step-contract-stable-id" as const;

// @ts-expect-error Plan task ids must use the stable task- id namespace.
const rejectedTaskId: PlanTaskId = unstableTaskId;

const unstableCoverageLink = {
  taskId: unstableTaskId,
  acceptedCriterionId
} as const;

// @ts-expect-error Coverage links must reference stable task ids.
const rejectedUnstableCoverageLink: PlanTaskCoverageLink = unstableCoverageLink;

const unstableAcceptedCriterionCoverageLink = {
  taskId,
  acceptedCriterionId: "criterion_contract_stable_id"
} as const;

// @ts-expect-error Coverage links must reference accepted ac_ criterion ids.
const rejectedUnstableAcceptedCriterionCoverageLink: PlanTaskCoverageLink =
  unstableAcceptedCriterionCoverageLink;

void coverageLink;
void rejectedTaskId;
void rejectedUnstableCoverageLink;
void rejectedUnstableAcceptedCriterionCoverageLink;
