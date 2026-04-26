import type { RiskLevel } from "@protostar/policy/capability-envelope";

import { PLAN_TASK_RISK_COMPATIBILITY_RULES } from "./index.js";
import type {
  PlanTask,
  PlanTaskRequiredCapabilities,
  PlanTaskRiskCompatibilityRule,
  PlanTaskRiskDeclaration
} from "./index.js";

type Assert<Condition extends true> = Condition;

type TaskRiskReusesPolicyRiskModel = PlanTaskRiskDeclaration extends RiskLevel
  ? RiskLevel extends PlanTaskRiskDeclaration
    ? true
    : false
  : false;

type PlanTasksExposeRiskDeclaration = PlanTask extends {
  readonly risk: PlanTaskRiskDeclaration;
}
  ? true
  : false;

type TaskRiskCompatibilityRulesCoverPolicyRiskModel = keyof typeof PLAN_TASK_RISK_COMPATIBILITY_RULES extends RiskLevel
  ? RiskLevel extends keyof typeof PLAN_TASK_RISK_COMPATIBILITY_RULES
    ? true
    : false
  : false;

type _TaskRiskReusesPolicyRiskModel = Assert<TaskRiskReusesPolicyRiskModel>;
type _PlanTasksExposeRiskDeclaration = Assert<PlanTasksExposeRiskDeclaration>;
type _TaskRiskCompatibilityRulesCoverPolicyRiskModel = Assert<TaskRiskCompatibilityRulesCoverPolicyRiskModel>;

const policyCompatibilityRules = PLAN_TASK_RISK_COMPATIBILITY_RULES satisfies Record<
  PlanTaskRiskDeclaration,
  PlanTaskRiskCompatibilityRule
>;

const noRequiredCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const declaredRisk = "medium" as const satisfies PlanTaskRiskDeclaration;

const executableTask = {
  id: "task-risk-declaration-contract",
  title: "Prove executable tasks declare their risk",
  kind: "verification",
  dependsOn: [],
  covers: ["ac_task_risk_declaration"],
  requiredCapabilities: noRequiredCapabilities,
  risk: declaredRisk
} as const satisfies PlanTask;

const missingRisk = {
  id: "task-missing-risk-declaration-contract",
  title: "This task must not be admitted into execution",
  kind: "verification",
  dependsOn: [],
  covers: ["ac_task_risk_declaration"],
  requiredCapabilities: noRequiredCapabilities
} as const;

const invalidRisk = {
  ...executableTask,
  risk: "critical"
} as const;

// @ts-expect-error Executable plan tasks must declare an explicit task risk.
const rejectedMissingRisk: PlanTask = missingRisk;

// @ts-expect-error Task risk declarations must reuse the low, medium, or high policy risk model.
const rejectedInvalidRisk: PlanTask = invalidRisk;

void executableTask;
void rejectedMissingRisk;
void rejectedInvalidRisk;
void policyCompatibilityRules;
