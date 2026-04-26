import type { PlanTask, PlanTaskRequiredCapabilities } from "./index.js";

type Assert<Condition extends true> = Condition;

type TaskCapabilitiesExposeBudget = PlanTaskRequiredCapabilities extends {
  readonly budget: PlanTaskRequiredCapabilities["budget"];
}
  ? true
  : false;

type _TaskCapabilitiesExposeBudget = Assert<TaskCapabilitiesExposeBudget>;

const normalizedTaskCapabilities = {
  repoScopes: [],
  toolPermissions: [],
  budget: {}
} as const satisfies PlanTaskRequiredCapabilities;

const executableTask = {
  id: "task-required-capabilities-contract",
  title: "Prove executable tasks expose normalized required capabilities",
  kind: "verification",
  dependsOn: [],
  covers: ["ac_task_capabilities_shape"],
  requiredCapabilities: normalizedTaskCapabilities,
  risk: "low"
} as const satisfies PlanTask;

const missingRequiredCapabilities = {
  id: "task-missing-required-capabilities-contract",
  title: "This task must not be admitted into execution",
  kind: "verification",
  dependsOn: [],
  covers: ["ac_task_capabilities_shape"],
  risk: "low"
} as const;

// @ts-expect-error Executable plan tasks must expose requiredCapabilities.
const rejectedMissingRequiredCapabilities: PlanTask = missingRequiredCapabilities;

void executableTask;
void rejectedMissingRequiredCapabilities;
