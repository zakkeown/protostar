import { budget, convergence, firstOf } from "@dogpile/sdk";
import type { AgentSpec, DogpileOptions } from "@dogpile/sdk";
import type { AcceptanceCriterionId, CapabilityEnvelope, ConfirmedIntent, RiskLevel } from "@protostar/intent";
import { createPlanGraph, type PlanGraph, type PlanTask, type PlanTaskKind } from "@protostar/planning";

export type FactoryPileKind = "planning" | "review" | "execution-coordination";

export interface FactoryPilePreset {
  readonly kind: FactoryPileKind;
  readonly description: string;
  readonly protocol: NonNullable<DogpileOptions["protocol"]>;
  readonly tier: NonNullable<DogpileOptions["tier"]>;
  readonly agents: readonly AgentSpec[];
  readonly budget: NonNullable<DogpileOptions["budget"]>;
  readonly terminate: NonNullable<DogpileOptions["terminate"]>;
}

export interface FactoryPileMission {
  readonly preset: FactoryPilePreset;
  readonly intent: string;
}

export interface PlanningPileResult {
  readonly kind: "planning-pile-result";
  readonly output: string;
  readonly source: "fixture" | "dogpile";
  readonly modelProviderId?: string;
  readonly traceRef?: string;
}

export type PlanningPileParseResult =
  | {
      readonly ok: true;
      readonly plan: PlanGraph;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

interface PlanningPileOutput {
  readonly planId?: string;
  readonly strategy: string;
  readonly tasks: readonly PlanTask[];
  readonly createdAt?: string;
}

export const planningPilePreset: FactoryPilePreset = {
  kind: "planning",
  description: "Independent planners propose a DAG, risks, capabilities, and acceptance coverage before synthesis.",
  protocol: { kind: "broadcast", maxRounds: 2 },
  tier: "quality",
  agents: [
    { id: "planner-architecture", role: "architecture-planner" },
    { id: "planner-risk", role: "risk-planner" },
    { id: "planner-tests", role: "verification-planner" }
  ],
  budget: {
    maxTokens: 24000,
    timeoutMs: 120000
  },
  terminate: firstOf(
    budget({ maxTokens: 24000, timeoutMs: 120000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.86 })
  )
};

export const reviewPilePreset: FactoryPilePreset = {
  kind: "review",
  description: "Independent reviewers inspect artifacts for correctness, regressions, missing evidence, and release risk.",
  protocol: { kind: "broadcast", maxRounds: 2 },
  tier: "quality",
  agents: [
    { id: "review-correctness", role: "correctness-reviewer" },
    { id: "review-security", role: "security-reviewer" },
    { id: "review-release", role: "release-gate-reviewer" }
  ],
  budget: {
    maxTokens: 20000,
    timeoutMs: 120000
  },
  terminate: firstOf(
    budget({ maxTokens: 20000, timeoutMs: 120000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.9 })
  )
};

export const executionCoordinatorPilePreset: FactoryPilePreset = {
  kind: "execution-coordination",
  description: "A coordinator decomposes ready work, assigns worker slices, and synthesizes repair requests.",
  protocol: { kind: "coordinator", maxTurns: 3 },
  tier: "balanced",
  agents: [
    { id: "execution-lead", role: "execution-coordinator" },
    { id: "worker-implementation", role: "implementation-worker" },
    { id: "worker-verification", role: "verification-worker" }
  ],
  budget: {
    maxTokens: 16000,
    timeoutMs: 90000
  },
  terminate: firstOf(
    budget({ maxTokens: 16000, timeoutMs: 90000 }),
    convergence({ stableTurns: 2, minSimilarity: 0.84 })
  )
};

export function buildPlanningMission(intent: ConfirmedIntent): FactoryPileMission {
  return {
    preset: planningPilePreset,
    intent: [
      `Confirmed intent: ${intent.title}`,
      "",
      intent.problem,
      "",
      "Acceptance criteria:",
      ...intent.acceptanceCriteria.map((criterion) => `- ${criterion.id}: ${criterion.statement}`),
      "",
      "Return a plan DAG with task ids, dependencies, capability needs, verification gates, and release risks."
    ].join("\n")
  };
}

export function parsePlanningPileResult(
  result: PlanningPileResult,
  context: {
    readonly intent: ConfirmedIntent;
    readonly defaultPlanId: string;
  }
): PlanningPileParseResult {
  const parsed = parsePlanningPileOutput(result.output);
  if (!parsed.ok) {
    return parsed;
  }

  try {
    return {
      ok: true,
      plan: createPlanGraph({
        planId: parsed.output.planId ?? context.defaultPlanId,
        intent: context.intent,
        strategy: parsed.output.strategy,
        tasks: parsed.output.tasks,
        ...(parsed.output.createdAt !== undefined ? { createdAt: parsed.output.createdAt } : {})
      })
    };
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

export function assertPlanGraphFromPlanningPileResult(
  result: PlanningPileResult,
  context: {
    readonly intent: ConfirmedIntent;
    readonly defaultPlanId: string;
  }
): PlanGraph {
  const parsed = parsePlanningPileResult(result, context);
  if (!parsed.ok) {
    throw new Error(`Invalid planning pile result: ${parsed.errors.join("; ")}`);
  }
  return parsed.plan;
}

export function assertPlanningPileResult(value: unknown): PlanningPileResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    throw new Error("Invalid planning pile result: result must be a JSON object.");
  }

  const kind = readString(value, "kind", errors);
  const output = readString(value, "output", errors);
  const source = readString(value, "source", errors);
  const modelProviderId = readOptionalString(value, "modelProviderId", errors);
  const traceRef = readOptionalString(value, "traceRef", errors);

  if (kind !== undefined && kind !== "planning-pile-result") {
    errors.push("kind must be planning-pile-result.");
  }
  if (source !== undefined && !isPlanningPileResultSource(source)) {
    errors.push("source must be fixture or dogpile.");
  }
  if (errors.length > 0 || output === undefined || !isPlanningPileResultSource(source)) {
    throw new Error(`Invalid planning pile result: ${errors.join("; ")}`);
  }

  return {
    kind: "planning-pile-result",
    output,
    source,
    ...(modelProviderId !== undefined ? { modelProviderId } : {}),
    ...(traceRef !== undefined ? { traceRef } : {})
  };
}

export function buildReviewMission(intent: ConfirmedIntent, plan: PlanGraph): FactoryPileMission {
  return {
    preset: reviewPilePreset,
    intent: [
      `Review factory run for: ${intent.title}`,
      "",
      `Plan: ${plan.planId}`,
      plan.strategy,
      "",
      "Review for acceptance coverage, evidence quality, unsafe authority expansion, and release readiness."
    ].join("\n")
  };
}

function parsePlanningPileOutput(output: string):
  | {
      readonly ok: true;
      readonly output: PlanningPileOutput;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [`output must be valid JSON: ${error instanceof Error ? error.message : String(error)}`]
    };
  }

  const errors: string[] = [];
  if (!isRecord(parsed)) {
    return {
      ok: false,
      errors: ["output JSON must be an object."]
    };
  }

  const strategy = readString(parsed, "strategy", errors);
  const planId = readOptionalString(parsed, "planId", errors);
  const createdAt = readOptionalString(parsed, "createdAt", errors);
  const tasks = parsePlanTasks(parsed["tasks"], errors);

  if (tasks.length === 0) {
    errors.push("tasks must contain at least one task.");
  }
  if (errors.length > 0 || strategy === undefined) {
    return {
      ok: false,
      errors
    };
  }

  return {
    ok: true,
    output: {
      strategy,
      tasks,
      ...(planId !== undefined ? { planId } : {}),
      ...(createdAt !== undefined ? { createdAt } : {})
    }
  };
}

function parsePlanTasks(value: unknown, errors: string[]): readonly PlanTask[] {
  if (!Array.isArray(value)) {
    errors.push("tasks must be an array.");
    return [];
  }

  return value.flatMap((entry, index): PlanTask[] => {
    if (!isRecord(entry)) {
      errors.push(`tasks[${index}] must be an object.`);
      return [];
    }

    const id = readString(entry, `tasks[${index}].id`, errors);
    const title = readString(entry, `tasks[${index}].title`, errors);
    const kind = readString(entry, `tasks[${index}].kind`, errors);
    const risk = readString(entry, `tasks[${index}].risk`, errors);
    const dependsOn = readStringArray(entry, `tasks[${index}].dependsOn`, errors);
    const covers = readStringArray(entry, `tasks[${index}].covers`, errors);
    const requiredCapabilities = parseRequiredCapabilities(entry["requiredCapabilities"], `tasks[${index}].requiredCapabilities`, errors);

    if (kind !== undefined && !isPlanTaskKind(kind)) {
      errors.push(`tasks[${index}].kind must be research, design, implementation, verification, or release.`);
    }
    if (risk !== undefined && !isRiskLevel(risk)) {
      errors.push(`tasks[${index}].risk must be low, medium, or high.`);
    }
    for (const criterionId of covers) {
      if (!criterionId.startsWith("ac_")) {
        errors.push(`tasks[${index}].covers entries must start with ac_.`);
      }
    }
    if (
      id === undefined ||
      title === undefined ||
      !isPlanTaskKind(kind) ||
      !isRiskLevel(risk) ||
      covers.some((criterionId) => !criterionId.startsWith("ac_"))
    ) {
      return [];
    }

    return [
      {
        id,
        title,
        kind,
        dependsOn,
        covers: covers as AcceptanceCriterionId[],
        requiredCapabilities,
        risk
      }
    ];
  });
}

function parseRequiredCapabilities(value: unknown, path: string, errors: string[]): Partial<CapabilityEnvelope> {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push(`${path} must be an object when provided.`);
    return {};
  }
  return value as Partial<CapabilityEnvelope>;
}

function readString(record: Record<string, unknown>, path: string, errors: string[]): string | undefined {
  const value = record[path.split(".").at(-1) ?? path];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path} must be a non-empty string.`);
    return undefined;
  }
  return value;
}

function readOptionalString(record: Record<string, unknown>, key: string, errors: string[]): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${key} must be a non-empty string when provided.`);
    return undefined;
  }
  return value;
}

function readStringArray(record: Record<string, unknown>, path: string, errors: string[]): readonly string[] {
  const value = record[path.split(".").at(-1) ?? path];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) {
    errors.push(`${path} must be an array of non-empty strings.`);
    return [];
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlanTaskKind(value: unknown): value is PlanTaskKind {
  return (
    value === "research" ||
    value === "design" ||
    value === "implementation" ||
    value === "verification" ||
    value === "release"
  );
}

function isRiskLevel(value: unknown): value is RiskLevel {
  return value === "low" || value === "medium" || value === "high";
}

function isPlanningPileResultSource(value: unknown): value is PlanningPileResult["source"] {
  return value === "fixture" || value === "dogpile";
}
