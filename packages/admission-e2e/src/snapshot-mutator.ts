// Snapshot mutator for fuzzed-bad admission coverage (Plan 01-09 Q-05).
//
// Pure deterministic: same input + same kind → byte-identical output.
// Uses Node 22's built-in `structuredClone`; no external dependencies.
//
// Two surfaces:
//   * PlanningPileResult mutations corrupt the inner JSON output string.
//   * IntentDraft mutations corrupt the draft object directly.
//
// Each mutation targets a specific admission rule the planning / intent
// admission flow MUST refuse. The fuzzed test asserts the resulting refusal
// carries an error string matching the rule's expected token.

import type { IntentDraft } from "@protostar/intent";
import type { PlanningPileResult } from "@protostar/planning";

export type PlanningMutationKind =
  | "drop-required-field"
  | "duplicate-task-id"
  | "inject-unknown-acceptance-criterion"
  | "violate-capability-envelope";

export type IntentMutationKind =
  | "mutate-ambiguity-score"
  | "drop-goal-statement"
  | "drop-acceptance-criteria";

export interface PlanningMutationInput {
  readonly fixture: PlanningPileResult;
  readonly kind: PlanningMutationKind;
}

export interface IntentMutationInput {
  readonly fixture: IntentDraft;
  readonly kind: IntentMutationKind;
}

interface PlanningPileOutputShape {
  strategy?: string;
  tasks: Array<Record<string, unknown>>;
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function parsePlanningOutput(result: PlanningPileResult): PlanningPileOutputShape {
  return JSON.parse(result.output) as PlanningPileOutputShape;
}

function reserializePlanningOutput(
  result: PlanningPileResult,
  output: PlanningPileOutputShape
): PlanningPileResult {
  return { ...result, output: JSON.stringify(output) };
}

export function applyPlanningMutation(input: PlanningMutationInput): PlanningPileResult {
  const cloned = deepClone(input.fixture);
  const output = parsePlanningOutput(cloned);

  switch (input.kind) {
    case "drop-required-field": {
      // Drop `strategy` — required field on PlanGraph; admission must reject.
      delete output.strategy;
      return reserializePlanningOutput(cloned, output);
    }

    case "duplicate-task-id": {
      // Clone first task's id onto the second task. Admission must refuse on
      // task-identity (non-unique ids).
      if (output.tasks.length < 2) {
        throw new Error("duplicate-task-id mutation requires at least two tasks");
      }
      const firstTaskId = output.tasks[0]?.["id"];
      if (typeof firstTaskId !== "string") {
        throw new Error("duplicate-task-id mutation requires the first task to have a string id");
      }
      const secondTask = output.tasks[1];
      if (secondTask) {
        secondTask["id"] = firstTaskId;
        // Second task likely depends on first task (via id) — clear dependsOn
        // so dependency-cycle isn't the rule fired first.
        secondTask["dependsOn"] = [];
      }
      // Subsequent tasks may also depend on the renamed task; clear dependsOn
      // for them too so duplicate-id is the cleanest rule fired.
      for (let i = 2; i < output.tasks.length; i += 1) {
        const task = output.tasks[i];
        if (task) task["dependsOn"] = [];
      }
      return reserializePlanningOutput(cloned, output);
    }

    case "inject-unknown-acceptance-criterion": {
      // Set the first task's `covers` to a fabricated AC id not in the
      // confirmed intent's AC list. Admission must refuse with the unknown-AC
      // rule (covers must reference admitted intent ACs).
      const firstTask = output.tasks[0];
      if (!firstTask) {
        throw new Error("inject-unknown-acceptance-criterion mutation requires at least one task");
      }
      firstTask["covers"] = ["ac_unknown_admission_e2e_fuzzed"];
      return reserializePlanningOutput(cloned, output);
    }

    case "violate-capability-envelope": {
      // Inject an executeGrant on the first task asking for a command outside
      // the confirmed intent's capability envelope. Admission must refuse
      // because the candidate plan attempts to expand authority.
      const firstTask = output.tasks[0];
      if (!firstTask) {
        throw new Error("violate-capability-envelope mutation requires at least one task");
      }
      const requiredCapabilities = (firstTask["requiredCapabilities"] ?? {}) as Record<string, unknown>;
      requiredCapabilities["executeGrants"] = [
        {
          command: "rm -rf /",
          scope: "repository",
          reason: "fuzzed mutation: out-of-envelope command"
        }
      ];
      requiredCapabilities["toolPermissions"] = [
        {
          tool: "shell",
          permissionLevel: "execute",
          reason: "fuzzed mutation: requires shell to invoke out-of-envelope command",
          risk: "high"
        }
      ];
      firstTask["requiredCapabilities"] = requiredCapabilities;
      return reserializePlanningOutput(cloned, output);
    }
  }
}

export function applyIntentMutation(input: IntentMutationInput): IntentDraft {
  const cloned = deepClone(input.fixture);

  switch (input.kind) {
    case "mutate-ambiguity-score": {
      // Strip context-bearing fields so ambiguity scoring spikes above 0.2.
      // The ambiguity gate must refuse.
      cloned.context = "";
      cloned.constraints = [];
      cloned.stopConditions = [];
      cloned.problem = "x";
      return cloned;
    }

    case "drop-goal-statement": {
      // Empty the title + problem so the goal dimension scores zero.
      cloned.title = "";
      cloned.problem = "";
      return cloned;
    }

    case "drop-acceptance-criteria": {
      // Empty the AC array — admission must refuse on missing AC.
      cloned.acceptanceCriteria = [];
      return cloned;
    }
  }
}

export const PLANNING_MUTATION_KINDS: readonly PlanningMutationKind[] = [
  "drop-required-field",
  "duplicate-task-id",
  "inject-unknown-acceptance-criterion",
  "violate-capability-envelope"
];

export const INTENT_MUTATION_KINDS: readonly IntentMutationKind[] = [
  "mutate-ambiguity-score",
  "drop-goal-statement",
  "drop-acceptance-criteria"
];
