// Fuzzed-bad rejection coverage (Plan 01-09 Q-05, PLAN-A-02 + INTENT-01).
//
// Each mutation kind is applied to the good scaffold fixture (planning side)
// or scaffold draft (intent side), then run through the full admission flow.
// The test asserts the resulting refusal carries an error string matching
// the rule's expected token. The mutator is also pinned as deterministic.

import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import {
  promoteIntentDraft,
  type ConfirmedIntent,
  type IntentDraft
} from "@protostar/intent";
import {
  admitCandidatePlans,
  parsePlanningPileResult,
  type PlanningPileResult
} from "@protostar/planning";

import {
  applyIntentMutation,
  applyPlanningMutation,
  INTENT_MUTATION_KINDS,
  PLANNING_MUTATION_KINDS,
  type IntentMutationKind,
  type PlanningMutationKind
} from "./snapshot-mutator.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const examplesRoot = resolve(repoRoot, "examples");

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function loadScaffoldConfirmedIntent(): Promise<ConfirmedIntent> {
  const draft = await readJson<IntentDraft>(
    resolve(examplesRoot, "intents/scaffold.draft.json")
  );
  const promoted = promoteIntentDraft({ draft });
  if (!promoted.ok) {
    throw new Error("scaffold.draft.json must promote for fuzzed planning tests");
  }
  return promoted.intent;
}

async function loadScaffoldPlanningResult(): Promise<PlanningPileResult> {
  return readJson<PlanningPileResult>(
    resolve(examplesRoot, "planning-results/scaffold.json")
  );
}

interface PlanningRejectionResult {
  readonly rejected: boolean;
  readonly reason: string;
}

function runPlanningAdmission(
  result: PlanningPileResult,
  intent: ConfirmedIntent
): PlanningRejectionResult {
  let parsed;
  try {
    parsed = parsePlanningPileResult(result, {
      intent,
      defaultPlanId: "plan_admission_e2e_fuzzed"
    });
  } catch (error) {
    return { rejected: true, reason: (error as Error).message };
  }
  if (!parsed.ok) {
    return { rejected: true, reason: parsed.errors.join("; ") };
  }
  const admission = admitCandidatePlans({
    candidatePlans: [parsed.candidatePlan],
    intent,
    planGraphUri: "plan.json"
  });
  if (!admission.ok) {
    return { rejected: true, reason: admission.errors.join("; ") };
  }
  return { rejected: false, reason: "admitted" };
}

interface IntentRejectionResult {
  readonly rejected: boolean;
  readonly reason: string;
}

function runIntentAdmission(draft: IntentDraft): IntentRejectionResult {
  const promoted = promoteIntentDraft({ draft });
  if (promoted.ok) {
    return { rejected: false, reason: "admitted" };
  }
  const errors = [...promoted.errors];
  for (const clarification of promoted.requiredClarifications) {
    errors.push(`${clarification.fieldPath}: ${clarification.prompt ?? ""}`);
  }
  for (const reason of promoted.hardZeroReasons) {
    errors.push(`${reason.dimensionId}: hard-zero`);
  }
  return { rejected: true, reason: errors.join("; ") };
}

const PLANNING_RULE_TOKENS: Record<PlanningMutationKind, RegExp> = {
  "drop-required-field": /strategy|required|missing/i,
  "duplicate-task-id": /duplicate|unique|task[-_ ]?id/i,
  "inject-unknown-acceptance-criterion": /unknown|acceptance|criterion|cover/i,
  "violate-capability-envelope": /capability|envelope|grant|authority|execute/i
};

const INTENT_RULE_TOKENS: Record<IntentMutationKind, RegExp> = {
  "mutate-ambiguity-score": /ambigu|threshold|context|constraint/i,
  "drop-goal-statement": /goal|title|problem/i,
  "drop-acceptance-criteria": /acceptance|criteria/i
};

describe("snapshot-mutator: fuzzed-bad planning admission rejection", () => {
  it("planning mutator is deterministic across invocations", async () => {
    const fixture = await loadScaffoldPlanningResult();
    for (const kind of PLANNING_MUTATION_KINDS) {
      const first = applyPlanningMutation({ fixture, kind });
      const second = applyPlanningMutation({ fixture, kind });
      assert.deepEqual(first, second, `planning mutation ${kind} must be deterministic`);
    }
  });

  for (const kind of PLANNING_MUTATION_KINDS) {
    it(`rejects planning fixture mutated with kind: ${kind}`, async () => {
      const fixture = await loadScaffoldPlanningResult();
      const intent = await loadScaffoldConfirmedIntent();
      const mutated = applyPlanningMutation({ fixture, kind });
      const result = runPlanningAdmission(mutated, intent);
      assert.equal(
        result.rejected,
        true,
        `planning mutation ${kind} must reject; got: ${result.reason}`
      );
      const expected = PLANNING_RULE_TOKENS[kind];
      assert.match(
        result.reason,
        expected,
        `planning mutation ${kind} rejection must match ${expected}; got: ${result.reason}`
      );
    });
  }
});

describe("snapshot-mutator: fuzzed-bad intent admission rejection", () => {
  it("intent mutator is deterministic across invocations", async () => {
    const fixture = await readJson<IntentDraft>(
      resolve(examplesRoot, "intents/scaffold.draft.json")
    );
    for (const kind of INTENT_MUTATION_KINDS) {
      const first = applyIntentMutation({ fixture, kind });
      const second = applyIntentMutation({ fixture, kind });
      assert.deepEqual(first, second, `intent mutation ${kind} must be deterministic`);
    }
  });

  for (const kind of INTENT_MUTATION_KINDS) {
    it(`rejects intent draft mutated with kind: ${kind}`, async () => {
      const fixture = await readJson<IntentDraft>(
        resolve(examplesRoot, "intents/scaffold.draft.json")
      );
      const mutated = applyIntentMutation({ fixture, kind });
      const result = runIntentAdmission(mutated);
      assert.equal(
        result.rejected,
        true,
        `intent mutation ${kind} must reject; got: ${result.reason}`
      );
      const expected = INTENT_RULE_TOKENS[kind];
      assert.match(
        result.reason,
        expected,
        `intent mutation ${kind} rejection must match ${expected}; got: ${result.reason}`
      );
    });
  }
});
