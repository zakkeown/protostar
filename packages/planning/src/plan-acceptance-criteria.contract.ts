import type { AcceptanceCriterionId } from "@protostar/intent";

import type { PlanAcceptanceCriterion, PlanGraph } from "./index.js";

type Assert<Condition extends true> = Condition;

type PlanCriteriaRequireStableIds = PlanGraph["acceptanceCriteria"][number] extends {
  readonly id: AcceptanceCriterionId;
}
  ? true
  : false;

type _PlanCriteriaRequireStableIds = Assert<PlanCriteriaRequireStableIds>;

const acceptedCriterion = {
  id: "ac_contract_stable",
  statement: "Accepted plan criteria carry stable ids.",
  verification: "test"
} as const satisfies PlanAcceptanceCriterion;

const missingStableId = {
  statement: "This must not be accepted into a PlanGraph.",
  verification: "test"
} as const;

// @ts-expect-error Accepted plan criteria must carry a stable ac_ id.
const rejectedMissingStableId: PlanAcceptanceCriterion = missingStableId;

const unstableId = {
  id: "criterion_contract_stable",
  statement: "This must not be accepted into a PlanGraph.",
  verification: "test"
} as const;

// @ts-expect-error Accepted plan criteria ids must use the stable ac_ id namespace.
const rejectedUnstableId: PlanAcceptanceCriterion = unstableId;

void acceptedCriterion;
void rejectedMissingStableId;
void rejectedUnstableId;
