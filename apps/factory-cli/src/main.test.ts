import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { createAcceptanceCriterionId, parseConfirmedIntent } from "@protostar/intent";

interface CliResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

const distDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(distDir, "../../..");
const cliPath = resolve(distDir, "main.js");
const sampleFactoryDraftFixtureRelativePath = "examples/intents/scaffold.draft.json";
const legacySampleConfirmedIntentFixtureRelativePath = "examples/intents/scaffold.json";
const suppressedIntentOutputFiles = [
  "intent-draft.json",
  "clarification-report.json",
  "intent-ambiguity.json",
  "intent-archetype-suggestion.json",
  "intent.json",
  "manifest.json"
] as const;
const downstreamArtifactFiles = [
  "planning-mission.txt",
  "planning-result.json",
  "plan.json",
  "execution-plan.json",
  "execution-events.json",
  "execution-result.json",
  "review-execution-loop.json",
  "review-gate.json",
  "evaluation-report.json",
  "evolution-decision.json",
  "delivery-plan.json",
  "delivery/pr-body.md"
] as const;

describe("factory CLI draft admission hardening", () => {
  it("serializes only the normalized ConfirmedIntent JSON on successful draft admission", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_confirmed_intent_payload";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--planning-fixture",
        planningFixturePath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const payload = parseJsonObject(result.stdout);
      assert.deepEqual(
        Object.keys(payload).sort(),
        [
          "acceptanceCriteria",
          "capabilityEnvelope",
          "confirmedAt",
          "constraints",
          "context",
          "goalArchetype",
          "id",
          "mode",
          "problem",
          "requester",
          "sourceDraftId",
          "stopConditions",
          "title"
        ].sort()
      );
      for (const unexpectedKey of [
        "runId",
        "runDir",
        "artifacts",
        "ambiguityAssessment",
        "questions",
        "policyFindings",
        "archetypeSuggestion"
      ]) {
        assert.equal(hasOwn(payload, unexpectedKey), false, `stdout leaked ${unexpectedKey}.`);
      }
      assert.equal(payload["id"], "intent_cli_clear_cosmetic");
      assert.equal(payload["sourceDraftId"], "draft_cli_clear_cosmetic");
      assert.equal(payload["mode"], "brownfield");
      assert.equal(payload["goalArchetype"], "cosmetic-tweak");
      assertNoWeakAcceptanceCriteria(payload);

      const intentArtifact = await readJson(resolve(outDir, runId, "intent.json"));
      assert.deepEqual(payload, intentArtifact);
      const confirmedIntentOutput = await readJson(confirmedIntentOutputPath);
      assert.deepEqual(payload, confirmedIntentOutput);
      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["schemaVersion"], "protostar.intent.admission-decision.v1");
      assert.equal(admissionDecision["artifact"], "admission-decision.json");
      assert.equal(admissionDecision["decision"], "allow");
      assert.equal(admissionDecision["admitted"], true);
      assert.equal(admissionDecision["draftId"], draft["draftId"]);
      assert.equal(admissionDecision["confirmedIntentId"], payload["id"]);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["ambiguityPassed"], true);
      assert.equal(admissionGate["requiredChecklistPassed"], true);
      assert.equal(admissionGate["policyPassed"], true);
      assert.equal(admissionGate["confirmedIntentCreated"], true);
    });
  });

  it("admits the cosmetic-tweak example fixture end-to-end as a ConfirmedIntent", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(repoRoot, "examples/intents/cosmetic-tweak.draft.json");
      const draft = await readJsonObject(draftPath);
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_cosmetic_tweak_fixture_e2e";

      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--planning-fixture",
        planningFixturePath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const payload = parseJsonObject(result.stdout);
      const parsed = parseConfirmedIntent(payload);
      assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join("; "));
      if (!parsed.ok) {
        return;
      }

      const intent = parsed.intent;
      assert.ok(intent, "ConfirmedIntent parse result should include intent.");
      const expectedAcceptanceCriterionIds = acceptanceCriterionIdsForDraft(draft);

      assert.equal(intent.id, "intent_cosmetic_settings_copy");
      assert.equal(intent.sourceDraftId, "draft_cosmetic_settings_copy");
      assert.equal(intent.goalArchetype, "cosmetic-tweak");
      assert.equal(intent.mode, "brownfield");
      assert.deepEqual(
        intent.acceptanceCriteria.map((criterion) => criterion.id),
        expectedAcceptanceCriterionIds
      );
      assertNoWeakAcceptanceCriteria(payload);

      const intentArtifact = await readJson(resolve(outDir, runId, "intent.json"));
      assert.deepEqual(payload, intentArtifact);
      const confirmedIntentOutput = await readJson(confirmedIntentOutputPath);
      assert.deepEqual(payload, confirmedIntentOutput);

      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "allow");
      assert.equal(admissionDecision["admitted"], true);
      assert.equal(admissionDecision["draftId"], draft["draftId"]);
      assert.equal(admissionDecision["confirmedIntentId"], intent.id);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["ambiguityPassed"], true);
      assert.equal(admissionGate["requiredChecklistPassed"], true);
      assert.equal(admissionGate["policyPassed"], true);
      assert.equal(admissionGate["confirmedIntentCreated"], true);

      const ambiguityArtifact = await readJsonObject(resolve(outDir, runId, "intent-ambiguity.json"));
      assert.equal(ambiguityArtifact["accepted"], true);
      assert.equal(ambiguityArtifact["ambiguity"], 0);
    });
  });

  it("drives the sample factory fixture through draft clarification and admission before composition", async () => {
    await withTempDir(async (tempDir) => {
      await assertSampleFactoryScriptUsesDraftAdmission();

      const draftPath = resolve(repoRoot, sampleFactoryDraftFixtureRelativePath);
      const legacyConfirmedIntentFixturePath = resolve(repoRoot, legacySampleConfirmedIntentFixtureRelativePath);
      const draft = await readJsonObject(draftPath);
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_sample_factory_draft_admission";

      const sampleFactoryArgs = [
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ] as const;

      assertSampleFactoryArgsAvoidLegacyBypass(sampleFactoryArgs, {
        draftPath,
        legacyConfirmedIntentFixturePath
      });

      const result = await runCli(sampleFactoryArgs);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const confirmedIntent = parseJsonObject(result.stdout);
      const legacyConfirmedIntentFixture = await readJsonObject(legacyConfirmedIntentFixturePath);
      assert.notDeepEqual(
        confirmedIntent,
        legacyConfirmedIntentFixture,
        "The sample factory run must promote the draft instead of replaying the legacy confirmed-intent fixture."
      );
      assert.equal(
        hasOwn(confirmedIntent, "metadata"),
        false,
        "The promoted sample intent must not carry legacy fixture metadata."
      );
      const parsed = parseConfirmedIntent(confirmedIntent);
      assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join("; "));
      if (!parsed.ok) {
        return;
      }

      const intent = parsed.intent;
      assert.ok(intent, "ConfirmedIntent parse result should include intent.");
      assert.equal(intent.id, "intent_dark_factory_scaffold");
      assert.equal(intent.sourceDraftId, draft["draftId"]);
      assert.equal(intent.goalArchetype, "cosmetic-tweak");
      assert.equal(intent.mode, "brownfield");
      assert.deepEqual(
        intent.acceptanceCriteria.map((criterion) => criterion.id),
        acceptanceCriterionIdsForDraft(draft)
      );

      const runDir = resolve(outDir, runId);
      const intentArtifact = await readJsonObject(resolve(runDir, "intent.json"));
      assert.deepEqual(intentArtifact, confirmedIntent);
      const parsedIntentArtifact = parseConfirmedIntent(intentArtifact);
      assert.equal(
        parsedIntentArtifact.ok,
        true,
        parsedIntentArtifact.ok ? undefined : parsedIntentArtifact.errors.join("; ")
      );
      if (!parsedIntentArtifact.ok) {
        return;
      }
      const artifactIntent = parsedIntentArtifact.intent;
      assert.ok(artifactIntent, "ConfirmedIntent artifact parse result should include intent.");
      assert.equal(artifactIntent.id, intent.id);

      const capturedDraft = await readJsonObject(resolve(runDir, "intent-draft.json"));
      assert.deepEqual(capturedDraft, draft);
      const clarificationReport = await readJsonObject(resolve(runDir, "clarification-report.json"));
      assert.equal(clarificationReport["artifact"], "clarification-report.json");
      assert.equal(clarificationReport["draftId"], draft["draftId"]);

      const admissionDecision = await readJsonObject(resolve(runDir, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "allow");
      assert.equal(admissionDecision["admitted"], true);
      assert.equal(admissionDecision["draftId"], draft["draftId"]);
      assert.equal(admissionDecision["confirmedIntentId"], intent.id);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.deepEqual(
        {
          ambiguityPassed: admissionGate["ambiguityPassed"],
          requiredChecklistPassed: admissionGate["requiredChecklistPassed"],
          policyPassed: admissionGate["policyPassed"],
          confirmedIntentCreated: admissionGate["confirmedIntentCreated"]
        },
        {
          ambiguityPassed: true,
          requiredChecklistPassed: true,
          policyPassed: true,
          confirmedIntentCreated: true
        }
      );

      const manifest = await readJsonObject(resolve(runDir, "manifest.json"));
      assert.equal(manifest["intentId"], intent.id);
      const manifestStages = readObjectArrayProperty(manifest, "stages");
      const intentStage = manifestStages.find((stage) => stage["stage"] === "intent");
      assert.notEqual(intentStage, undefined, "Expected manifest to include intent stage.");
      assert.equal(intentStage?.["status"], "passed");
      const intentArtifacts = readObjectArrayProperty(intentStage as Record<string, unknown>, "artifacts");
      assert.deepEqual(
        intentArtifacts.map((artifactEntry) => artifactEntry["kind"]),
        [
          "intent-draft",
          "clarification-report",
          "admission-decision",
          "confirmed-intent",
          "intent-ambiguity",
          "intent-archetype-suggestion"
        ]
      );

      await assertDownstreamArtifactsWritten(outDir, runId);
    });
  });

  it("continues an admitted draft into sample composition only after ConfirmedIntent creation", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_composition_after_confirmation";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--planning-fixture",
        planningFixturePath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const confirmedIntent = parseJsonObject(result.stdout);
      const parsed = parseConfirmedIntent(confirmedIntent);
      assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join("; "));
      if (!parsed.ok) {
        return;
      }

      const runDir = resolve(outDir, runId);
      const admissionDecision = await readJsonObject(resolve(runDir, "admission-decision.json"));
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionDecision["decision"], "allow");
      assert.equal(admissionDecision["confirmedIntentId"], confirmedIntent["id"]);
      assert.deepEqual(
        {
          ambiguityPassed: admissionGate["ambiguityPassed"],
          requiredChecklistPassed: admissionGate["requiredChecklistPassed"],
          policyPassed: admissionGate["policyPassed"],
          confirmedIntentCreated: admissionGate["confirmedIntentCreated"]
        },
        {
          ambiguityPassed: true,
          requiredChecklistPassed: true,
          policyPassed: true,
          confirmedIntentCreated: true
        }
      );

      await assertDownstreamArtifactsWritten(outDir, runId);

      const manifest = await readJsonObject(resolve(runDir, "manifest.json"));
      assert.equal(manifest["intentId"], confirmedIntent["id"]);
      const manifestStages = readObjectArrayProperty(manifest, "stages");
      assertStageStatus(manifestStages, "intent", "passed");
      assertStageStatus(manifestStages, "planning", "passed");
      assertStageStatus(manifestStages, "execution", "passed");
      assertStageStatus(manifestStages, "review", "passed");
      assertStageStatus(manifestStages, "release", "passed");

      const plan = await readJsonObject(resolve(runDir, "plan.json"));
      assert.equal(plan["intentId"], confirmedIntent["id"]);
      const executionPlan = await readJsonObject(resolve(runDir, "execution-plan.json"));
      assert.equal(executionPlan["runId"], runId);
      assert.equal(executionPlan["planId"], plan["planId"]);
      const executionResult = await readJsonObject(resolve(runDir, "execution-result.json"));
      assert.equal(executionResult["runId"], runId);
      assert.equal(executionResult["planId"], plan["planId"]);
      assert.equal(executionResult["status"], "passed");
      const reviewGate = await readJsonObject(resolve(runDir, "review-gate.json"));
      assert.equal(reviewGate["runId"], runId);
      assert.equal(reviewGate["planId"], plan["planId"]);
      assert.equal(reviewGate["verdict"], "pass");
    });
  });

  it("stops a rejected draft before sample composition stages can write artifacts", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clarificationBlockedDraft();
      const draftPath = resolve(tempDir, "needs-clarification.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_composition_stops_rejected_draft";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(clearCosmeticDraft())));

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--planning-fixture",
        planningFixturePath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.doesNotMatch(result.stderr, /Invalid planning pile result/);

      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "block");
      assert.equal(admissionDecision["admitted"], false);
      assert.equal(hasOwn(admissionDecision, "confirmedIntentId"), false);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["confirmedIntentCreated"], false);
      assert.equal(admissionGate["requiredChecklistPassed"], false);

      await assertIntentOutputFilesSuppressed(outDir, runId);
      await assertDownstreamArtifactsSuppressed(outDir, runId);
    });
  });

  it("emits admission-decision.json when an admitted draft fails after admission", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "invalid-planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_post_admission_failure";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, {
        kind: "not-a-planning-pile-result"
      });

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--planning-fixture",
        planningFixturePath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.notEqual(result.stderr, "");

      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "allow");
      assert.equal(admissionDecision["admitted"], true);
      assert.equal(admissionDecision["draftId"], draft["draftId"]);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["policyPassed"], true);
      assert.equal(admissionGate["confirmedIntentCreated"], true);
    });
  });

  it("writes admission-decision.json with expected details for allow, block, and escalate policy outcomes", async () => {
    const testCases = [
      {
        label: "allow",
        draft: clearCosmeticDraft(),
        runId: "run_cli_admission_decision_allow",
        expectedExitCode: 0,
        expectedDecision: "allow",
        expectedAdmitted: true,
        expectedGate: {
          ambiguityPassed: true,
          requiredChecklistPassed: true,
          policyPassed: true,
          structurallyMissingAutoFail: false,
          confirmedIntentCreated: true
        },
        expectedPolicyFindingCodes: [],
        expectedFailureState: undefined
      },
      {
        label: "block",
        draft: featureAddDraft(),
        runId: "run_cli_admission_decision_block",
        expectedExitCode: 1,
        expectedDecision: "block",
        expectedAdmitted: false,
        expectedGate: {
          ambiguityPassed: true,
          requiredChecklistPassed: true,
          policyPassed: false,
          structurallyMissingAutoFail: false,
          confirmedIntentCreated: false
        },
        expectedPolicyFindingCodes: ["unsupported-goal-archetype"],
        expectedFailureState: "checklist-only"
      },
      {
        label: "escalate",
        draft: policyBlockedDraft(),
        runId: "run_cli_admission_decision_escalate",
        expectedExitCode: 1,
        expectedDecision: "escalate",
        expectedAdmitted: false,
        expectedGate: {
          ambiguityPassed: false,
          requiredChecklistPassed: true,
          policyPassed: false,
          structurallyMissingAutoFail: false,
          confirmedIntentCreated: false
        },
        expectedPolicyFindingCodes: ["tool-authority-overage"],
        expectedFailureState: "ambiguity-only"
      }
    ] as const;

    for (const testCase of testCases) {
      await withTempDir(async (tempDir) => {
        const draftPath = resolve(tempDir, `${testCase.label}.json`);
        const planningFixturePath = resolve(tempDir, "planning-fixture.json");
        const outDir = resolve(tempDir, "out");

        await writeJson(draftPath, testCase.draft);
        await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(testCase.draft)));

        const result = await runCli([
          "run",
          "--draft",
          draftPath,
          "--out",
          outDir,
          "--planning-fixture",
          planningFixturePath,
          "--run-id",
          testCase.runId,
          "--intent-mode",
          "brownfield"
        ]);

        assert.equal(result.exitCode, testCase.expectedExitCode, `${testCase.label}: ${result.stderr}`);
        if (testCase.expectedExitCode === 0) {
          assert.notEqual(result.stdout, "", `${testCase.label}: successful admission should print the intent.`);
          assert.equal(result.stderr, "", `${testCase.label}: successful admission should not print stderr.`);
        } else {
          assert.equal(result.stdout, "", `${testCase.label}: refused admission should not print an intent.`);
          assert.match(result.stderr, /Draft intent refused by admission gate\./, testCase.label);
        }

        const admissionDecisionPath = resolve(outDir, testCase.runId, "admission-decision.json");
        assert.equal(await pathExists(admissionDecisionPath), true, `${testCase.label}: admission decision missing.`);
        const admissionDecision = await readJsonObject(admissionDecisionPath);
        assert.equal(admissionDecision["schemaVersion"], "protostar.intent.admission-decision.v1", testCase.label);
        assert.equal(admissionDecision["artifact"], "admission-decision.json", testCase.label);
        assert.equal(admissionDecision["decision"], testCase.expectedDecision, testCase.label);
        assert.equal(admissionDecision["admitted"], testCase.expectedAdmitted, testCase.label);
        assert.equal(admissionDecision["draftId"], testCase.draft["draftId"], testCase.label);
        assert.equal(admissionDecision["goalArchetype"], testCase.draft["goalArchetype"], testCase.label);
        assert.equal(admissionDecision["mode"], "brownfield", testCase.label);
        assert.equal(hasOwn(admissionDecision, "confirmedIntentId"), testCase.expectedAdmitted, testCase.label);

        const details = readObjectProperty(admissionDecision, "details");
        const gate = readObjectProperty(details, "gate");
        assert.deepEqual(
          {
            ambiguityPassed: gate["ambiguityPassed"],
            requiredChecklistPassed: gate["requiredChecklistPassed"],
            policyPassed: gate["policyPassed"],
            structurallyMissingAutoFail: gate["structurallyMissingAutoFail"],
            confirmedIntentCreated: gate["confirmedIntentCreated"]
          },
          testCase.expectedGate,
          testCase.label
        );

        const ambiguity = readObjectProperty(details, "ambiguity");
        assert.equal(ambiguity["threshold"], 0.2, testCase.label);
        assert.equal(ambiguity["accepted"], testCase.expectedGate.ambiguityPassed, testCase.label);
        assert.equal(ambiguity["finite"], true, testCase.label);

        const policyFindingCodes = readObjectArrayProperty(details, "policyFindings").map((finding) => {
          const code = finding["code"];
          assert.equal(typeof code, "string", testCase.label);
          return code;
        });
        assert.deepEqual([...new Set(policyFindingCodes)], testCase.expectedPolicyFindingCodes, testCase.label);
        assert.equal(
          policyFindingCodes.length > 0,
          testCase.expectedPolicyFindingCodes.length > 0,
          testCase.label
        );

        if (testCase.expectedFailureState === undefined) {
          assert.equal(hasOwn(details, "failure"), false, testCase.label);
          assert.deepEqual(admissionDecision["errors"], [], testCase.label);
        } else {
          const failure = readObjectProperty(details, "failure");
          assert.equal(failure["state"], testCase.expectedFailureState, testCase.label);
          assert.equal(failure["confirmedIntentCreated"], false, testCase.label);
          const errors = admissionDecision["errors"];
          assert.equal(Array.isArray(errors), true, testCase.label);
          assert.ok((errors as readonly unknown[]).length > 0, `${testCase.label}: expected refusal errors.`);
        }
      });
    }
  });

  it("suppresses intent output files when clarification blocks draft promotion", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "needs-clarification.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_clarification_block";

      await writeJson(draftPath, clarificationBlockedDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /Required clarifications:/);
      assert.match(result.stderr, /context/);
      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "block");
      assert.equal(admissionDecision["admitted"], false);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["requiredChecklistPassed"], false);
      assert.equal(admissionGate["confirmedIntentCreated"], false);
      await assertIntentOutputFilesSuppressed(outDir, runId);
      assert.equal(await pathExists(confirmedIntentOutputPath), false);
    });
  });

  it("blocks draft admission before reading the downstream planning fixture", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "needs-clarification.json");
      const missingPlanningFixturePath = resolve(tempDir, "missing-planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_gate_before_planning";

      await writeJson(draftPath, clarificationBlockedDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--planning-fixture",
        missingPlanningFixturePath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.doesNotMatch(result.stderr, /ENOENT|missing-planning-fixture/);

      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "block");
      assert.equal(admissionDecision["admitted"], false);
      await assertIntentOutputFilesSuppressed(outDir, runId);
    });
  });

  it("rejects ambiguous confirmed-intent output filenames before a run can write them", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const outDir = resolve(tempDir, "out");
      const unsupportedOutputPath = resolve(tempDir, "hardened-draft.json");

      await writeJson(draftPath, clearCosmeticDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        unsupportedOutputPath
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /confirmed-intent\.json or intent\.json/);
      assert.equal(await pathExists(unsupportedOutputPath), false);
    });
  });

  it("suppresses intent output files when acceptance-criteria normalization fails", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "normalization-failed.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_normalization_block";

      await writeJson(draftPath, normalizationBlockedDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /acceptanceCriteria\.0\.verification/);
      assert.match(result.stderr, /test, evidence, or manual/);
      await assertIntentOutputFilesSuppressed(outDir, runId);
      assert.equal(await pathExists(confirmedIntentOutputPath), false);
    });
  });

  it("suppresses intent output files when policy hardening rejects authority overage", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "policy-overage.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_policy_block";

      await writeJson(draftPath, policyBlockedDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /Policy findings:/);
      assert.match(result.stderr, /tool-authority-overage/);
      const admissionDecision = await readJsonObject(resolve(outDir, runId, "admission-decision.json"));
      assert.equal(admissionDecision["decision"], "escalate");
      assert.equal(admissionDecision["admitted"], false);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["requiredChecklistPassed"], true);
      assert.equal(admissionGate["ambiguityPassed"], false);
      assert.equal(admissionGate["policyPassed"], false);
      await assertIntentOutputFilesSuppressed(outDir, runId);
      assert.equal(await pathExists(confirmedIntentOutputPath), false);
    });
  });

  it("routes feature-add drafts through the unsupported admission decision", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "feature-add.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_feature_add_block";

      await writeJson(draftPath, featureAddDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /Feature-add admission path is unsupported in v0\.0\.1/);
      assert.match(result.stderr, /Policy findings:/);
      await assertIntentOutputFilesSuppressed(outDir, runId);
      assert.equal(await pathExists(confirmedIntentOutputPath), false);
    });
  });

  it("routes refactor drafts through the unsupported admission decision", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "refactor.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_refactor_block";

      await writeJson(draftPath, refactorDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /Refactor admission path is unsupported in v0\.0\.1/);
      assert.match(result.stderr, /Policy findings:/);
      await assertIntentOutputFilesSuppressed(outDir, runId);
      assert.equal(await pathExists(confirmedIntentOutputPath), false);
    });
  });

  it("routes bugfix drafts through the unsupported admission decision", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "bugfix.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const runId = "run_cli_bugfix_block";

      await writeJson(draftPath, bugfixDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--confirmed-intent-output",
        confirmedIntentOutputPath,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /Bugfix admission path is unsupported in v0\.0\.1/);
      assert.match(result.stderr, /Policy findings:/);
      await assertIntentOutputFilesSuppressed(outDir, runId);
      assert.equal(await pathExists(confirmedIntentOutputPath), false);
    });
  });
});

function clarificationBlockedDraft(): Record<string, unknown> {
  const draft = clearCosmeticDraft();
  delete draft["context"];
  delete draft["stopConditions"];

  return {
    ...draft,
    draftId: "draft_cli_clarification_block",
    title: "Polish",
    problem: "Make the operator report better.",
    acceptanceCriteria: [
      {
        statement: "Looks good",
        verification: "manual"
      }
    ]
  };
}

function normalizationBlockedDraft(): Record<string, unknown> {
  return {
    ...clearCosmeticDraft(),
    draftId: "draft_cli_normalization_block",
    acceptanceCriteria: [
      {
        statement: "The CLI refuses malformed draft acceptance criteria before writing intent artifacts.",
        verification: "inspection"
      }
    ]
  };
}

function policyBlockedDraft(): Record<string, unknown> {
  const draft = clearCosmeticDraft();
  const capabilityEnvelope = draft["capabilityEnvelope"] as Record<string, unknown>;

  return {
    ...draft,
    draftId: "draft_cli_policy_block",
    capabilityEnvelope: {
      ...capabilityEnvelope,
      toolPermissions: [
        {
          tool: "shell",
          permissionLevel: "admin",
          reason: "Exercise the CLI policy-hardening failure path for excessive authority.",
          risk: "high"
        }
      ]
    }
  };
}

function featureAddDraft(): Record<string, unknown> {
  return {
    draftId: "draft_cli_feature_add_block",
    title: "Add draft import CLI flag",
    problem:
      "Operators need a new CLI flag that accepts draft intent input and routes it through admission control before confirmation.",
    requester: "local-operator",
    mode: "brownfield",
    goalArchetype: "feature-add",
    context:
      "Protostar already has a factory CLI and intent admission packages; this draft exercises the v0.0.1 feature-add policy row.",
    acceptanceCriteria: [
      {
        statement: "The CLI accepts a draft input path and routes it through admission before creating a confirmed intent.",
        verification: "test"
      },
      {
        statement: "The admission result reports the selected feature-add policy row when the request is evaluated.",
        verification: "evidence"
      }
    ],
    constraints: ["Keep changes inside the intent front door and policy admission surface."],
    stopConditions: [
      "Stop if feature-add admission remains unsupported or if the stub cap cannot be reported deterministically."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused policy admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120000,
        maxRepairLoops: 1
      }
    }
  };
}

function refactorDraft(): Record<string, unknown> {
  return {
    draftId: "draft_cli_refactor_block",
    title: "Refactor policy admission helpers",
    problem:
      "The policy admission helpers need internal cleanup so future policy rows can be wired without changing operator-visible behavior.",
    requester: "local-operator",
    mode: "brownfield",
    goalArchetype: "refactor",
    context:
      "Protostar already has a factory CLI and intent admission packages; this draft exercises the v0.0.1 refactor policy row.",
    acceptanceCriteria: [
      {
        statement: "The CLI routes refactor drafts through admission before any confirmed intent artifact is written.",
        verification: "test"
      },
      {
        statement: "The admission refusal reports the selected refactor policy row and unsupported decision.",
        verification: "evidence"
      }
    ],
    constraints: ["Keep changes inside the intent front door and policy admission surface."],
    stopConditions: [
      "Stop if refactor admission remains unsupported or if the stub cap cannot be reported deterministically."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused policy admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120000,
        maxRepairLoops: 1
      }
    }
  };
}

function bugfixDraft(): Record<string, unknown> {
  return {
    draftId: "draft_cli_bugfix_block",
    title: "Fix policy admission regression",
    problem:
      "The policy admission front door must report that bugfix requests use an unsupported v0.0.1 stub cap before any confirmed intent is written.",
    requester: "local-operator",
    mode: "brownfield",
    goalArchetype: "bugfix",
    context:
      "Protostar already routes feature-add and refactor drafts through unsupported admission decisions; this draft exercises the bugfix policy row.",
    acceptanceCriteria: [
      {
        statement: "The CLI routes bugfix drafts through admission before any confirmed intent artifact is written.",
        verification: "test"
      },
      {
        statement: "The admission refusal reports the selected bugfix policy row and unsupported decision.",
        verification: "evidence"
      }
    ],
    constraints: ["Keep changes inside the intent front door and policy admission surface."],
    stopConditions: [
      "Stop if bugfix admission remains unsupported or if the stub cap cannot be reported deterministically."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "packages/policy",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused policy admission tests.",
          risk: "low"
        }
      ],
      budget: {
        timeoutMs: 120000,
        maxRepairLoops: 1
      }
    }
  };
}

function clearCosmeticDraft(): Record<string, unknown> {
  return {
    draftId: "draft_cli_clear_cosmetic",
    title: "Polish operator admission copy",
    problem:
      "Make the operator-facing intent admission copy easier to scan while keeping the CLI behavior and factory run contracts unchanged.",
    requester: "local-operator",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    context:
      "Protostar is an existing TypeScript workspace with a factory CLI that routes draft intents through deterministic admission before writing run artifacts.",
    acceptanceCriteria: [
      {
        statement: "The CLI admission hardening tests pass and verify no failed draft writes intent artifacts.",
        verification: "test"
      },
      {
        statement: "The stderr refusal includes concrete fields or policy findings that explain how to repair the draft.",
        verification: "evidence"
      }
    ],
    constraints: [
      "Protostar authority is limited to packages/intent, packages/policy, examples/intents, intent CLI flags, and confirmed-intent contract docs."
    ],
    stopConditions: [
      "Stop if admission reports ambiguity above 0.20, if any required checklist field fails, or if policy flags unapproved authority overage."
    ],
    capabilityEnvelope: {
      repoScopes: [
        {
          workspace: "protostar",
          path: "apps/factory-cli",
          access: "write"
        }
      ],
      toolPermissions: [
        {
          tool: "node:test",
          permissionLevel: "use",
          reason: "Run focused CLI admission-hardening tests.",
          risk: "low"
        }
      ],
      budget: {
        maxUsd: 0,
        timeoutMs: 300000,
        maxRepairLoops: 1
      }
    }
  };
}

async function withTempDir<T>(callback: (tempDir: string) => Promise<T>): Promise<T> {
  const tempDir = await mkdtemp(resolve(tmpdir(), "protostar-cli-test-"));
  try {
    return await callback(tempDir);
  } finally {
    await rm(tempDir, {
      recursive: true,
      force: true
    });
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value) as unknown;
  assert.equal(isRecord(parsed), true);
  return parsed as Record<string, unknown>;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const parsed = await readJson(path);
  assert.equal(isRecord(parsed), true);
  return parsed as Record<string, unknown>;
}

function readObjectProperty(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key];
  assert.equal(isRecord(value), true);
  return value as Record<string, unknown>;
}

function readObjectArrayProperty(record: Record<string, unknown>, key: string): readonly Record<string, unknown>[] {
  const value = record[key];
  assert.equal(Array.isArray(value), true);
  for (const entry of value as readonly unknown[]) {
    assert.equal(isRecord(entry), true);
  }
  return value as readonly Record<string, unknown>[];
}

function cosmeticPlanningFixture(acceptanceCriterionIds: readonly string[]): Record<string, unknown> {
  return {
    kind: "planning-pile-result",
    source: "fixture",
    modelProviderId: "deterministic-cli-success-fixture",
    output: JSON.stringify({
      strategy: "Use a focused deterministic fixture to verify the CLI success payload contract.",
      tasks: acceptanceCriterionIds.map((criterionId, index) => ({
        id: `task-cli-success-${index + 1}`,
        title: `Cover CLI success acceptance criterion ${index + 1}`,
        kind: "verification",
        dependsOn: index === 0 ? [] : [`task-cli-success-${index}`],
        covers: [criterionId],
        requiredCapabilities: {},
        risk: "low"
      }))
    })
  };
}

function acceptanceCriterionIdsForDraft(draft: Record<string, unknown>): readonly string[] {
  const criteria = draft["acceptanceCriteria"];
  assert.equal(Array.isArray(criteria), true);
  return (criteria as readonly unknown[]).map((criterion, index) => {
    assert.equal(isRecord(criterion), true);
    const statement = (criterion as Record<string, unknown>)["statement"];
    if (typeof statement !== "string") {
      throw new Error(`acceptanceCriteria.${index}.statement must be a string.`);
    }
    return createAcceptanceCriterionId(statement, index);
  });
}

function assertNoWeakAcceptanceCriteria(payload: Record<string, unknown>): void {
  const criteria = payload["acceptanceCriteria"];
  assert.equal(Array.isArray(criteria), true);
  for (const criterion of criteria as readonly unknown[]) {
    assert.equal(isRecord(criterion), true);
    assert.equal(hasOwn(criterion as Record<string, unknown>, "weak"), false);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

async function assertSampleFactoryScriptUsesDraftAdmission(): Promise<void> {
  const rootPackageJson = await readJsonObject(resolve(repoRoot, "package.json"));
  const scripts = readObjectProperty(rootPackageJson, "scripts");
  const factoryScript = scripts["factory"];
  if (typeof factoryScript !== "string") {
    assert.fail("package.json scripts.factory must be a string.");
  }
  assert.match(
    factoryScript,
    new RegExp(`--draft\\s+${escapeRegExp(sampleFactoryDraftFixtureRelativePath)}`),
    "The sample factory script must route through the draft admission flag."
  );
  assert.doesNotMatch(
    factoryScript,
    new RegExp(`--intent\\s+${escapeRegExp(legacySampleConfirmedIntentFixtureRelativePath)}`),
    "The sample factory script must not use the legacy confirmed-intent bypass flag."
  );
  assert.doesNotMatch(
    factoryScript,
    new RegExp(`(?:^|\\s)${escapeRegExp(legacySampleConfirmedIntentFixtureRelativePath)}(?:\\s|$)`),
    "The sample factory script must not consume the legacy confirmed-intent fixture."
  );
}

function assertSampleFactoryArgsAvoidLegacyBypass(
  args: readonly string[],
  input: {
    readonly draftPath: string;
    readonly legacyConfirmedIntentFixturePath: string;
  }
): void {
  assert.equal(args.includes("--draft"), true, "The sample factory run must pass a draft input.");
  assert.equal(args[args.indexOf("--draft") + 1], input.draftPath);
  assert.equal(args.includes("--intent"), false, "The sample factory run must not use the legacy --intent bypass.");
  assert.equal(
    args.includes(input.legacyConfirmedIntentFixturePath),
    false,
    "The sample factory run must not pass the legacy confirmed-intent fixture path."
  );
  assert.equal(
    args.includes(legacySampleConfirmedIntentFixtureRelativePath),
    false,
    "The sample factory run must not pass the legacy confirmed-intent fixture."
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertIntentOutputFilesSuppressed(outDir: string, runId: string): Promise<void> {
  for (const fileName of suppressedIntentOutputFiles) {
    const outputPath = resolve(outDir, runId, fileName);
    assert.equal(await pathExists(outputPath), false, `Expected ${outputPath} not to be written.`);
  }
}

async function assertDownstreamArtifactsWritten(outDir: string, runId: string): Promise<void> {
  for (const fileName of downstreamArtifactFiles) {
    const outputPath = resolve(outDir, runId, fileName);
    assert.equal(await pathExists(outputPath), true, `Expected downstream artifact ${outputPath} to be written.`);
  }
}

async function assertDownstreamArtifactsSuppressed(outDir: string, runId: string): Promise<void> {
  for (const fileName of downstreamArtifactFiles) {
    const outputPath = resolve(outDir, runId, fileName);
    assert.equal(await pathExists(outputPath), false, `Expected downstream artifact ${outputPath} not to be written.`);
  }
}

function assertStageStatus(
  stages: readonly Record<string, unknown>[],
  stageName: string,
  expectedStatus: string
): void {
  const stage = stages.find((entry) => entry["stage"] === stageName);
  assert.notEqual(stage, undefined, `Expected manifest to include ${stageName} stage.`);
  assert.equal(stage?.["status"], expectedStatus, `${stageName} stage should be ${expectedStatus}.`);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function runCli(args: readonly string[]): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        INIT_CWD: repoRoot
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolveResult({
        exitCode,
        stdout,
        stderr
      });
    });
  });
}
