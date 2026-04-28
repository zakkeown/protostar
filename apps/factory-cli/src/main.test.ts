import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { describe, it, mock } from "node:test";
import { fileURLToPath } from "node:url";

import { createAcceptanceCriterionId } from "@protostar/intent/acceptance-criteria";
import { parseConfirmedIntent } from "@protostar/intent/confirmed-intent";
import {
  buildPolicySnapshot,
  buildSignatureEnvelope,
  hashPolicySnapshot,
  intersectEnvelopes,
  verifyConfirmedIntentSignature
} from "@protostar/authority";
import { promoteAndSignIntent, promoteIntentDraft } from "@protostar/intent";
import type { CapabilityEnvelope, ConfirmedIntent } from "@protostar/intent";
import {
  hashPlanGraph,
  PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
  PLAN_GRAPH_ADMISSION_VALIDATORS,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  type PlanGraph
} from "@protostar/planning/schema";

import { runFactory, type FactoryCompositionDependencies } from "./main.js";
import { loadRepoPolicy } from "./load-repo-policy.js";
import { buildTierConstraints } from "./precedence-tier-loader.js";

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
const missingAcceptanceCoveragePlanningFixtureRelativePath =
  "examples/planning-results/bad/missing-acceptance-coverage.json";
const cyclicPlanningFixtureRelativePath = "examples/planning-results/bad/cyclic-plan-graph.json";
const authorityExpansionPlanningFixtureRelativePath =
  "examples/planning-results/bad/capability-envelope-expansion.json";
const suppressedIntentOutputFiles = [
  "intent-draft.json",
  // Plan 01-08 (Q-08, INTENT-01 runtime): clarification-report.json is now
  // explicitly written on intent-side ambiguity-gate refusal so Phase 9 inspect
  // can show the unresolved clarifications. It is therefore no longer in the
  // suppression list.
  "intent-ambiguity.json",
  "intent-archetype-suggestion.json",
  "intent.json",
  "manifest.json"
] as const;
const downstreamArtifactFiles = [
  "planning-mission.txt",
  "planning-result.json",
  "plan.json",
  "planning-admission.json",
  "execution-plan.json",
  "execution-events.json",
  "execution-result.json",
  "review-execution-loop.json",
  "review-gate.json",
  "evaluation-report.json",
  "evolution-decision.json"
] as const;
const executionAndReviewArtifactFiles = [
  "execution-plan.json",
  "execution-events.json",
  "execution-result.json",
  "review-execution-loop.json",
  "execution-evidence/task-cli-capability-overage.json",
  "review-mission.txt",
  "review-gate.json",
  "evaluation-report.json",
  "evolution-decision.json"
] as const;

describe("factory CLI draft admission hardening", () => {
  it("refuses trusted launch without confirmed intent before runFactory gates", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_two_key_missing_confirmed_intent";

      await writeJson(draftPath, clearCosmeticDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--run-id",
        runId,
        "--trust",
        "trusted"
      ]);

      assert.equal(result.exitCode, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /two-key launch/);
      assert.equal(await pathExists(resolve(outDir, runId, "trust-refusal.json")), true);
      assert.equal(await pathExists(resolve(outDir, runId, "intent-admission-decision.json")), false);
      await assertRefusalTriple({
        tempDir,
        outDir,
        runId,
        expectedStage: "workspace-trust",
        expectedRefusalArtifact: "trust-refusal.json"
      });
    });
  });

  it("propagates trusted workspace when both launch keys are provided", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_two_key_trusted_success";

      await writeJson(draftPath, draft);
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));
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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      const workspaceTrustDecision = await readJsonObject(resolve(outDir, runId, "workspace-trust-admission-decision.json"));
      const evidence = readObjectProperty(workspaceTrustDecision, "evidence");
      assert.equal(evidence["declaredTrust"], "trusted");
    });
  });

  it("defaults workspace trust to untrusted when no trust flag is provided", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_default_untrusted";

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

      // Untrusted workspace now escalates (non-zero exit) as a real gate outcome.
      assert.notEqual(result.exitCode, 0, "untrusted workspace must exit non-zero");
      const workspaceTrustDecision = await readJsonObject(resolve(outDir, runId, "workspace-trust-admission-decision.json"));
      const evidence = readObjectProperty(workspaceTrustDecision, "evidence");
      assert.equal(evidence["declaredTrust"], "untrusted");
      const outcome = workspaceTrustDecision["outcome"];
      assert.ok(
        outcome === "block" || outcome === "escalate",
        `workspace-trust outcome must be block or escalate for untrusted workspace, got: ${String(outcome)}`
      );
    });
  });

  it("does not contain the hardcoded trusted workspace literal in main.ts", async () => {
    const source = await readFile(resolve(repoRoot, "apps/factory-cli/src/main.ts"), "utf8");

    assert.equal(source.includes('trust: "trusted"'), false);
    assert.match(source, /trust:\s*options\.trust/);
  });

  it("clones the delivery target repository for delivery-backed repo-runtime runs", async () => {
    const source = await readFile(resolve(repoRoot, "apps/factory-cli/src/main.ts"), "utf8");

    assert.match(source, /function cloneUrlForRepoRuntime/);
    assert.match(source, /capabilityEnvelope\.delivery\?\.target/);
    assert.match(source, /https:\/\/github\.com\/\$\{target\.owner\}\/\$\{target\.repo\}\.git/);
    assert.doesNotMatch(
      source,
      /cloneWorkspace\(\{\s*url:\s*pathToFileURL\(input\.projectRoot\)\.href/s,
      "repo-runtime must not always clone the factory checkout when a delivery target is present."
    );
  });

  it("writes an escalation marker and exits 2 for escalate outcomes", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(tempDir, "policy-overage.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_escalation_marker";

      await writeJson(draftPath, policyBlockedDraft());

      const result = await runCli([
        "run",
        "--draft",
        draftPath,
        "--out",
        outDir,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield"
      ]);

      assert.equal(result.exitCode, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      const marker = await readJsonObject(resolve(outDir, runId, "escalation-marker.json"));
      assert.equal(marker["schemaVersion"], "1.0.0");
      assert.equal(marker["runId"], runId);
      assert.equal(marker["gate"], "intent");
      assert.equal(marker["awaiting"], "operator-confirm");
      assert.equal(await pathExists(resolve(outDir, runId, "terminal-status.json")), false);
      assert.equal(await pathExists(resolve(outDir, "..", "refusals.jsonl")), false);
    });
  });

  it("writes all 6 gates admission decisions, policy snapshot, signed intent, and no legacy intent decision filename", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_all_5_gates_admission_decisions";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);

      const gates = ["intent", "planning", "capability", "repo-scope", "workspace-trust", "repo-runtime"] as const;
      for (const gate of gates) {
        const decision = await readJsonObject(resolve(runDir, `${gate}-admission-decision.json`));
        assert.equal(decision["schemaVersion"], "1.0.0");
        assert.equal(decision["runId"], runId);
        assert.equal(decision["gate"], gate);
        // workspace-trust may differ depending on --trust flag; other gates should allow
        if (gate !== "workspace-trust") {
          assert.equal(decision["outcome"], "allow");
        } else {
          assert.equal(decision["outcome"], "allow"); // trusted workspace → allow
        }
        const precStatus = readObjectProperty(decision, "precedenceResolution")["status"];
        assert.ok(
          precStatus === "no-conflict" || precStatus === "resolved",
          `unexpected precedenceResolution.status: ${String(precStatus)}`
        );
      }

      const indexLines = (await readFile(resolve(runDir, "admission-decisions.jsonl"), "utf8")).trimEnd().split("\n");
      assert.equal(indexLines.length, 6);
      assert.deepEqual(indexLines.map((line) => JSON.parse(line).gate), [...gates]);
      assert.equal(await pathExists(resolve(runDir, "admission-decision.json")), false);
      // precedence-decision.json may or may not exist depending on whether the
      // repo-policy resolves exactly to the intent's envelope (no-conflict) or
      // requires intersection resolution (resolved). Both are valid non-blocked outcomes.

      const intent = await readJsonObject(resolve(runDir, "intent.json"));
      const signature = readObjectProperty(intent, "signature");
      assert.match(String(signature["value"]), /^[0-9a-f]{64}$/);
      assert.equal(signature["canonicalForm"], "json-c14n@1.0");

      const policySnapshot = await readJsonObject(resolve(runDir, "policy-snapshot.json"));
      const resolvedEnvelope = readObjectProperty(policySnapshot, "resolvedEnvelope");
      const verified = verifyConfirmedIntentSignature(
        intent as unknown as ConfirmedIntent,
        policySnapshot as unknown as Parameters<typeof verifyConfirmedIntentSignature>[1],
        resolvedEnvelope as unknown as Parameters<typeof verifyConfirmedIntentSignature>[2]
      );
      assert.equal(verified.ok, true, verified.ok ? undefined : verified.errors.join("; "));

      const tamperedIntent = { ...intent, title: "tampered" };
      const tampered = verifyConfirmedIntentSignature(
        tamperedIntent as unknown as ConfirmedIntent,
        policySnapshot as unknown as Parameters<typeof verifyConfirmedIntentSignature>[1],
        resolvedEnvelope as unknown as Parameters<typeof verifyConfirmedIntentSignature>[2]
      );
      assert.equal(tampered.ok, false);
    });
  });

  it("blocks release when evaluation report verdict is fail", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_evaluation_fail_blocks_release";
      const runDir = resolve(outDir, runId);
      const runEvaluationStages = mock.fn<FactoryCompositionDependencies["runEvaluationStages"]>(
        async (input) => ({
          report: {
            runId: input.runId,
            verdict: "fail",
            stages: [
              {
                stage: "mechanical",
                verdict: "pass",
                score: 1,
                scores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 },
                summary: "mechanical pass"
              },
              {
                stage: "semantic",
                verdict: "fail",
                score: 0.2,
                summary: "semantic fail"
              }
            ]
          },
          evolutionDecision: { action: "continue", generation: input.generation, reason: "test" },
          snapshot: { generation: input.generation, fields: [] },
          mechanical: { verdict: "pass", score: 1, scores: { build: 1, lint: 1, diffSize: 1, acCoverage: 1 } },
          semantic: { verdict: "fail", score: 0.2, confidence: 1, judges: [] }
        })
      );

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

      await assert.rejects(
        async () => {
          await runFactory(
            {
              intentDraftPath: draftPath,
              outDir,
              planningFixturePath,
              runId,
              failTaskIds: [],
              intentMode: "brownfield",
              trust: "trusted",
              confirmedIntent: confirmedIntentPath
            },
            { runEvaluationStages }
          );
        },
        /Evaluation failed; release is blocked\./
      );

      assert.equal(runEvaluationStages.mock.callCount(), 1);
      const evaluationReport = await readJsonObject(resolve(runDir, "evaluation-report.json"));
      assert.equal(evaluationReport["verdict"], "fail");
      assert.equal(await pathExists(resolve(runDir, "evolution-decision.json")), false);
      assert.equal(await pathExists(resolve(runDir, "terminal-status.json")), false);
    });
  });

  it("serializes only the normalized ConfirmedIntent JSON on successful draft admission", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const runId = "run_cli_confirmed_intent_payload";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
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
          "schemaVersion",
          "signature",
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
      const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, runId));
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
      const baseDraft = await readJsonObject(resolve(repoRoot, "examples/intents/cosmetic-tweak.draft.json"));
      // Add createdAt for deterministic confirmedAt during signing and CLI run
      const draft: Record<string, unknown> = { ...baseDraft, createdAt: "2026-01-01T00:00:00.000Z" };
      const draftPath = resolve(tempDir, "cosmetic-tweak.draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const confirmedIntentOutputPath = resolve(tempDir, "confirmed-intent.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const runId = "run_cli_cosmetic_tweak_fixture_e2e";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const payload = parseJsonObject(result.stdout);
      const parsed = parseConfirmedIntent(payload);
      assert.equal(parsed.ok, true, parsed.ok ? undefined : parsed.errors.join("; "));
      if (!parsed.ok) {
        return;
      }

      const intent = parsed.data;
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

      const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, runId));
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

  // Phase 6 Plan 06-07 Task 3a — planning seam (PILE-01).
  it("invokes runFactoryPile in --planning-mode live and admits the parsed pile output", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "live-planning.draft.json");
      const planningFixturePath = resolve(tempDir, "unused-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_live_planning_happy";
      const acIds = acceptanceCriterionIdsForDraft(draft);
      const pileBody = cosmeticPlanningFixture(acIds);
      const providerBodies: Record<string, unknown>[] = [];

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, { kind: "must-not-be-read" });

      const runFactoryPileSpy = mock.fn<FactoryCompositionDependencies["runFactoryPile"]>(
        async (mission, ctx) => {
          assert.deepEqual(mission.preset.protocol, { kind: "coordinator", maxTurns: 3 });
          await ctx.provider.generate({
            temperature: 0,
            metadata: {},
            messages: [{ role: "user", content: "exercise structured planning provider" }]
          } as unknown as Parameters<typeof ctx.provider.generate>[0]);
          return {
            ok: true as const,
            result: { output: JSON.stringify(pileBody), eventLog: { events: [] } } as never,
            trace: { events: [] } as never,
            accounting: { totalTokens: 0 } as never,
            stopReason: null
          };
        }
      );
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async (_url, init) => {
        providerBodies.push(JSON.parse(String(init?.body)));
        return Response.json({ choices: [{ message: { content: "{}" } }] });
      }) as typeof fetch;

      // Workspace-trust gate runs AFTER the planning seam, so we expect it to
      // refuse here — what matters for THIS test is that the pile was invoked
      // and its artifacts persisted before the gate fires.
      try {
        await assert.rejects(
          () =>
            runFactory(
              {
                intentDraftPath: draftPath,
                outDir,
                planningFixturePath,
                failTaskIds: [],
                intentMode: "brownfield",
                runId,
                planningMode: "live"
              },
              { runFactoryPile: runFactoryPileSpy }
            )
        );
      } finally {
        globalThis.fetch = originalFetch;
      }

      assert.equal(runFactoryPileSpy.mock.callCount(), 1, "live mode must invoke runFactoryPile exactly once for planning");
      assert.equal(providerBodies.length, 1, "planning provider smoke call must exercise one OpenAI-compatible request");
      const responseFormat = readObjectProperty(providerBodies[0]!, "response_format");
      const jsonSchema = readObjectProperty(responseFormat, "json_schema");
      assert.deepEqual(jsonSchema["name"], "planning_pile_result");
      assert.equal(responseFormat["type"], "json_schema");
      assert.equal(jsonSchema["strict"], true);
      const schema = readObjectProperty(jsonSchema, "schema");
      const outputSchema = readObjectProperty(readObjectProperty(schema, "properties"), "output");
      assert.equal(outputSchema["type"], "object");
      assert.deepEqual(outputSchema["required"], ["strategy", "tasks"]);
      const resultJson = await readJsonObject(resolve(outDir, runId, "piles", "planning", "iter-0", "result.json"));
      assert.ok(resultJson["output"], "pile result.json must persist");
      const traceJson = await readJsonObject(resolve(outDir, runId, "piles", "planning", "iter-0", "trace.json"));
      assert.ok(traceJson, "pile trace.json must persist (Q-08)");
    });
  });

  it("refuses non-zero with stage=pile-planning when runFactoryPile returns ok=false", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "live-planning-fail.draft.json");
      const planningFixturePath = resolve(tempDir, "unused-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_live_planning_refusal";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, { kind: "must-not-be-read" });

      const runFactoryPileSpy = mock.fn<FactoryCompositionDependencies["runFactoryPile"]>(
        async () => ({
          ok: false as const,
          failure: {
            kind: "planning",
            class: "pile-timeout",
            elapsedMs: 120000,
            configuredTimeoutMs: 120000
          }
        })
      );

      await assert.rejects(
        () =>
          runFactory(
            {
              intentDraftPath: draftPath,
              outDir,
              planningFixturePath,
              failTaskIds: [],
              intentMode: "brownfield",
              runId,
              planningMode: "live"
            },
            { runFactoryPile: runFactoryPileSpy }
          ),
        /Planning pile refused/
      );

      const refusal = await readJsonObject(resolve(outDir, runId, "piles", "planning", "iter-0", "refusal.json"));
      assert.equal(refusal["stage"], "pile-planning");
      assert.equal(refusal["sourceOfTruth"], "PlanningPileResult");
      const refusalsIndex = await readFile(resolve(outDir, "..", "refusals.jsonl"), "utf8");
      assert.match(refusalsIndex, /"stage":"pile-planning"/);
    });
  });

  // Phase 6 Plan 06-07 Task 3b — review seam (PILE-02 / Q-14).
  it("swaps the ModelReviewer for the review pile when --review-mode live is set", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "review-mode-live.draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_review_mode_live";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

      // Stub runFactoryPile: return ok for both kinds. Review body matches the
      // ReviewPileBody parser contract.
      const reviewBody = JSON.stringify({
        judgeCritiques: [
          {
            judgeId: "review-correctness",
            model: "stub-model",
            rubric: {},
            verdict: "pass",
            rationale: "stub",
            taskRefs: []
          }
        ],
        aggregateVerdict: "pass"
      });
      const runFactoryPileSpy = mock.fn<FactoryCompositionDependencies["runFactoryPile"]>(
        async (mission) => ({
          ok: true as const,
          result: {
            output: mission.preset.kind === "review" ? reviewBody : "{}",
            eventLog: { events: [] }
          } as never,
          trace: { events: [] } as never,
          accounting: { totalTokens: 0 } as never,
          stopReason: null
        })
      );

      // Successful trusted dry-run cosmetic-tweak path with reviewMode=live.
      // We don't await success — we assert that runFactoryPile was called
      // with kind === "review" at least once (the seam is wired). Whether the
      // run itself completes depends on downstream plumbing not relevant here.
      await runFactory(
        {
          intentDraftPath: draftPath,
          outDir,
          planningFixturePath,
          failTaskIds: [],
          intentMode: "brownfield",
          runId,
          trust: "trusted",
          confirmedIntent: confirmedIntentPath,
          reviewMode: "live"
        },
        { runFactoryPile: runFactoryPileSpy }
      ).catch(() => {
        /* downstream gates may legitimately refuse depending on env */
      });

      const reviewCalls = runFactoryPileSpy.mock.calls.filter(
        (call) => (call.arguments[0] as { preset: { kind: string } }).preset.kind === "review"
      );
      assert.ok(reviewCalls.length >= 1, "review-mode live must invoke runFactoryPile with kind=review at least once");
      // Q-08 — review pile traces are persisted at runs/{id}/piles/review/iter-N/.
      const reviewResultJson = await readJsonObject(
        resolve(outDir, runId, "piles", "review", "iter-0", "result.json")
      );
      assert.ok(reviewResultJson, "review pile result.json must persist (Q-07/Q-08)");
      const reviewTraceJson = await readJsonObject(
        resolve(outDir, runId, "piles", "review", "iter-0", "trace.json")
      );
      assert.ok(reviewTraceJson, "review pile trace.json must persist (Q-08 always-persist)");
    });
  });

  it("invokes runFactoryPile with the run-level AbortSignal (parent abort cascades)", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "live-planning-abort.draft.json");
      const planningFixturePath = resolve(tempDir, "unused-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_live_planning_abort";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, { kind: "must-not-be-read" });

      let capturedSignal: AbortSignal | undefined;
      const acIds = acceptanceCriterionIdsForDraft(draft);
      const pileBody = cosmeticPlanningFixture(acIds);
      const runFactoryPileSpy = mock.fn<FactoryCompositionDependencies["runFactoryPile"]>(
        async (_mission, ctx) => {
          capturedSignal = ctx.signal;
          return {
            ok: true as const,
            result: { output: JSON.stringify(pileBody), eventLog: { events: [] } } as never,
            trace: { events: [] } as never,
            accounting: { totalTokens: 0 } as never,
            stopReason: null
          };
        }
      );

      // Downstream gate is expected to fail (untrusted workspace); we only care
      // that runFactoryPile was invoked with ctx.signal as the run-level
      // AbortSignal.
      await assert.rejects(() =>
        runFactory(
          {
            intentDraftPath: draftPath,
            outDir,
            planningFixturePath,
            failTaskIds: [],
            intentMode: "brownfield",
            runId,
            planningMode: "live"
          },
          { runFactoryPile: runFactoryPileSpy }
        )
      );

      assert.ok(capturedSignal, "ctx.signal must be supplied to runFactoryPile");
      assert.equal(typeof capturedSignal!.aborted, "boolean", "ctx.signal must be a real AbortSignal");
    });
  });

  it("drives the sample factory fixture through draft clarification and admission before composition", async () => {
    await withTempDir(async (tempDir) => {
      await assertSampleFactoryScriptUsesDraftAdmission();

      const draftPath = resolve(repoRoot, sampleFactoryDraftFixtureRelativePath);
      const legacyConfirmedIntentFixturePath = resolve(repoRoot, legacySampleConfirmedIntentFixtureRelativePath);
      const baseDraft = await readJsonObject(draftPath);
      // Augment with createdAt so confirmedAt is deterministic for signing and CLI run.
      // Write the augmented draft to temp so the CLI sees the same createdAt as the helper.
      const draft: Record<string, unknown> = { ...baseDraft, createdAt: "2026-01-01T00:00:00.000Z" };
      const augmentedDraftPath = resolve(tempDir, "scaffold.draft.json");
      await writeJson(augmentedDraftPath, draft);
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_sample_factory_draft_admission";

      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

      const sampleFactoryArgs = [
        "run",
        "--draft",
        augmentedDraftPath,
        "--out",
        outDir,
        "--run-id",
        runId,
        "--intent-mode",
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ] as const;

      assertSampleFactoryArgsAvoidLegacyBypass(sampleFactoryArgs, {
        draftPath: augmentedDraftPath,
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

      const intent = parsed.data;
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
      const artifactIntent = parsedIntentArtifact.data;
      assert.ok(artifactIntent, "ConfirmedIntent artifact parse result should include intent.");
      assert.equal(artifactIntent.id, intent.id);

      const capturedDraft = await readJsonObject(resolve(runDir, "intent-draft.json"));
      assert.deepEqual(capturedDraft, draft);
      const clarificationReport = await readJsonObject(resolve(runDir, "clarification-report.json"));
      assert.equal(clarificationReport["artifact"], "clarification-report.json");
      assert.equal(clarificationReport["draftId"], draft["draftId"]);

      const admissionDecision = await readIntentAdmissionEvidence(runDir);
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

      const planningStage = manifestStages.find((stage) => stage["stage"] === "planning");
      assert.notEqual(planningStage, undefined, "Expected manifest to include planning stage.");
      if (planningStage === undefined) {
        return;
      }
      assert.equal(planningStage["status"], "passed");
      const planningArtifacts = readObjectArrayProperty(planningStage, "artifacts");
      assert.deepEqual(
        planningArtifacts.map((artifactEntry) => ({
          kind: artifactEntry["kind"],
          uri: artifactEntry["uri"]
        })),
        [
          {
            kind: "pile-mission",
            uri: "planning-mission.txt"
          },
          {
            kind: "candidate-plan-source",
            uri: "planning-result.json"
          },
          {
            kind: "plan-graph",
            uri: "plan.json"
          },
          {
            kind: "planning-admission",
            uri: "planning-admission.json"
          }
        ]
      );

      await assertDownstreamArtifactsWritten(outDir, runId);
      await assertPlanningResultIsCandidatePlanSource(runDir);
      await assertPlanningAdmissionSmokeEvidence(runDir, intent.id);
    });
  });

  it("continues an admitted draft into sample composition only after ConfirmedIntent creation", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_composition_after_confirmation";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
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
      const admissionDecision = await readIntentAdmissionEvidence(runDir);
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
      assertStageStatus(manifestStages, "release", "skipped");

      const plan = await readJsonObject(resolve(runDir, "plan.json"));
      await assertPlanningResultIsCandidatePlanSource(runDir);
      assert.equal(plan["intentId"], confirmedIntent["id"]);
      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      assertThinAcceptedPlanningAdmission(planningAdmission, plan);
      const executionPlan = await readJsonObject(resolve(runDir, "execution-plan.json"));
      assert.equal(executionPlan["runId"], runId);
      assert.equal(executionPlan["planId"], plan["planId"]);
      assertExecutionPlanUsesPlanningAdmissionHandoff(executionPlan, plan);
      const executionResult = await readJsonObject(resolve(runDir, "execution-result.json"));
      assert.equal(executionResult["runId"], runId);
      assert.equal(executionResult["planId"], plan["planId"]);
      assert.equal(executionResult["status"], "succeeded");
      const reviewGate = await readJsonObject(resolve(runDir, "review-gate.json"));
      assert.equal(reviewGate["runId"], runId);
      assert.equal(reviewGate["planId"], plan["planId"]);
      assert.equal(reviewGate["verdict"], "pass");
    });
  });

  it("persists admitted planning evidence before later downstream artifact writes", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_planning_admission_durable_before_downstream";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));
      await mkdir(runDir, { recursive: true });
      await writeFile(resolve(runDir, "delivery"), "force downstream delivery artifact mkdir failure\n", "utf8");

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 1);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /delivery/);

      const plan = await readJsonObject(resolve(runDir, "plan.json"));
      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      assertThinAcceptedPlanningAdmission(planningAdmission, plan);
      assert.equal(await pathExists(resolve(runDir, "execution-plan.json")), false);
    });
  });

  it("validates every planning candidate and persists per-candidate admission results", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const acceptanceCriterionIds = acceptanceCriterionIdsForDraft(draft);
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-candidates.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_multi_candidate_planning_admission";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, multiCandidatePlanningFixture(acceptanceCriterionIds));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const plan = await readJsonObject(resolve(runDir, "plan.json"));
      assert.equal(plan["planId"], `plan_${runId}_candidate_2`);
      assert.equal(plan["strategy"], "Admit the valid middle candidate after all candidates are checked.");

      const planningResult = await readJson(resolve(runDir, "planning-result.json"));
      assert.equal(Array.isArray(planningResult), true);
      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      assert.equal(planningAdmission["artifact"], "planning-admission.json");
      assert.equal(planningAdmission["decision"], "allow");
      assert.equal(planningAdmission["admitted"], true);
      assert.equal(planningAdmission["planId"], plan["planId"]);
      assert.equal(Object.hasOwn(planningAdmission, "details"), false);
      assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
      assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);
      assert.deepEqual(readObjectProperty(planningAdmission, "candidateAdmissionSummary"), {
        allCandidatesValidated: true,
        candidateCount: 3,
        admittedCandidateIndex: 1,
        rejectedCandidateCount: 2
      });

      const candidateAdmissionResults = readObjectArrayProperty(planningAdmission, "candidateAdmissionResults");
      assert.deepEqual(
        candidateAdmissionResults.map((candidateResult) => ({
          candidateIndex: candidateResult["candidateIndex"],
          planId: candidateResult["planId"],
          decision: candidateResult["decision"],
          admitted: candidateResult["admitted"],
          violationCount: readObjectProperty(candidateResult, "validation")["violationCount"]
        })),
        [
          {
            candidateIndex: 0,
            planId: `plan_${runId}_candidate_1`,
            decision: "block",
            admitted: false,
            violationCount: acceptanceCriterionIds.length + 1
          },
          {
            candidateIndex: 1,
            planId: `plan_${runId}_candidate_2`,
            decision: "allow",
            admitted: true,
            violationCount: 0
          },
          {
            candidateIndex: 2,
            planId: `plan_${runId}_candidate_3`,
            decision: "block",
            admitted: false,
            violationCount: 1
          }
        ]
      );
      assert.deepEqual(
        readObjectArrayProperty(candidateAdmissionResults[0] ?? {}, "rejectionReasons").map(
          ({ code }) => code
        ),
        ["empty-task-coverage", ...acceptanceCriterionIds.map(() => "uncovered-acceptance-criterion")]
      );
      assert.deepEqual(
        readObjectArrayProperty(candidateAdmissionResults[2] ?? {}, "rejectionReasons").map(
          ({ code }) => code
        ),
        ["missing-task-dependency"]
      );

      const executionPlan = await readJsonObject(resolve(runDir, "execution-plan.json"));
      assert.equal(executionPlan["planId"], plan["planId"]);
      assertExecutionPlanUsesPlanningAdmissionHandoff(executionPlan, plan);
    });
  });

  it("admits Dogpile candidate plans before creating execution run plans", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "dogpile-planning-result.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_dogpile_candidate_admitted_before_execution";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, dogpilePlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");

      const planningResult = await readJsonObject(resolve(runDir, "planning-result.json"));
      assert.equal(planningResult["kind"], "planning-pile-result");
      assert.equal(planningResult["source"], "dogpile");
      assert.equal(planningResult["traceRef"], "trace-dogpile-candidate-admission-before-execution");
      await assertPlanningResultIsCandidatePlanSource(runDir);

      const plan = await readJsonObject(resolve(runDir, "plan.json"));
      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      assertThinAcceptedPlanningAdmission(planningAdmission, plan);

      const executionPlan = await readJsonObject(resolve(runDir, "execution-plan.json"));
      assert.equal(executionPlan["runId"], runId);
      assert.equal(executionPlan["planId"], plan["planId"]);
      assertExecutionPlanUsesPlanningAdmissionHandoff(executionPlan, plan);
      await assertReviewCompositionUsesPlanningAdmissionBoundary(runDir, plan);

      const manifest = await readJsonObject(resolve(runDir, "manifest.json"));
      const manifestStages = readObjectArrayProperty(manifest, "stages");
      assertStageAppearsBefore(manifestStages, "planning", "execution");
    });
  });

  it("feeds downstream composition from packages/planning admitted-plan results", async () => {
    await assertFactoryCompositionUsesPlanningAdmissionBoundary();
  });

  it("does not expose an admitted plan when planning admission evidence cannot be persisted", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_planning_admission_required_before_plan";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await mkdir(resolve(runDir, "planning-admission.json"), { recursive: true });

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
      assert.match(result.stderr, /planning-admission\.json/);
      assert.equal(
        await pathExists(resolve(runDir, "plan.json")),
        false,
        "plan.json must not be exposed before planning-admission.json is durably written."
      );
      assert.equal(await pathExists(resolve(runDir, "execution-plan.json")), false);
    });
  });

  it("prevents rejected Dogpile candidate plans from reaching execution", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_planning_capability_rejection_evidence";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(
        planningFixturePath,
        dogpileUnauthorizedCapabilityPlanningFixture(acceptanceCriterionIdsForDraft(draft))
      );

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
      assert.match(result.stderr, /Planning admission rejected plan graph:/);
      assert.match(result.stderr, /outside confirmed intent capability envelope/);

      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      const planningResult = await readJsonObject(resolve(runDir, "planning-result.json"));
      const expectedPlanId = `plan_${runId}`;
      const intentId = planningAdmission["intentId"];
      assert.equal(typeof intentId, "string");
      assert.equal(planningResult["source"], "dogpile");
      assert.equal(await pathExists(resolve(runDir, "planning-admission.json")), true);
      assert.equal(
        await pathExists(resolve(runDir, "plan.json")),
        false,
        "Rejected candidate plan must not be emitted as the admitted plan artifact."
      );
      assert.equal(planningAdmission["artifact"], "planning-admission.json");
      assert.equal(planningAdmission["decision"], "block");
      assert.equal(planningAdmission["admissionStatus"], "no-plan-admitted");
      assert.equal(planningAdmission["admitted"], false);
      assert.equal(planningAdmission["planId"], expectedPlanId);
      const planningAttempt = readObjectProperty(planningAdmission, "planningAttempt");
      assert.equal(planningAttempt["candidatePlanId"], expectedPlanId);
      assert.equal(planningAttempt["intentId"], intentId);
      assert.equal(typeof planningAttempt["candidatePlanCreatedAt"], "string");
      const candidatePlanCreatedAt = planningAttempt["candidatePlanCreatedAt"];
      assert.deepEqual(readObjectProperty(planningAdmission, "candidateSource"), {
        kind: "candidate-plan-graph",
        planId: expectedPlanId,
        uri: "plan.json",
        pointer: "#",
        createdAt: candidatePlanCreatedAt,
        sourceOfTruth: "PlanGraph"
      });
      assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
      assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);

      const details = readObjectProperty(planningAdmission, "details");
      assert.equal(Object.hasOwn(details, "taskCapabilityAdmissions"), false);
      assert.equal(Object.hasOwn(details, "acceptanceCoverage"), false);
      const validation = readObjectProperty(details, "validation");
      assert.equal(validation["validator"], "validatePlanGraph");
      assert.equal(validation["ok"], false);
      assert.equal(validation["violationCount"], 3);
      const failure = readObjectProperty(details, "failure");
      assert.equal(failure["state"], "validation-failed");
      assert.equal(failure["status"], "no-plan-admitted");
      assert.equal(failure["admittedPlanCreated"], false);
      assert.equal(failure["violationCount"], 3);
      assert.deepEqual(readObjectProperty(failure, "candidatePlan"), {
        planId: expectedPlanId,
        intentId,
        createdAt: candidatePlanCreatedAt,
        source: {
          kind: "candidate-plan-graph",
          planId: expectedPlanId,
          uri: "plan.json",
          pointer: "#",
          createdAt: candidatePlanCreatedAt,
          sourceOfTruth: "PlanGraph"
        }
      });
      assert.deepEqual(
        readObjectArrayProperty(validation, "capabilityViolationDiagnostics").map(
          ({ taskId, violatedRule, capabilityPath, severity }) => ({
            taskId,
            violatedRule,
            capabilityPath,
            severity
          })
        ),
        [
          {
            taskId: "task-cli-capability-overage",
            violatedRule: "task-required-repo-scope-outside-intent-envelope",
            capabilityPath: "tasks.task-cli-capability-overage.requiredCapabilities.repoScopes.0",
            severity: "block"
          },
          {
            taskId: "task-cli-capability-overage",
            violatedRule: "task-required-tool-permission-outside-intent-envelope",
            capabilityPath: "tasks.task-cli-capability-overage.requiredCapabilities.toolPermissions.0",
            severity: "block"
          },
          {
            taskId: "task-cli-capability-overage",
            violatedRule: "task-required-budget-outside-intent-envelope",
            capabilityPath: "tasks.task-cli-capability-overage.requiredCapabilities.budget.timeoutMs",
            severity: "block"
          }
        ]
      );
      assert.deepEqual(
        readObjectArrayProperty(validation, "violations").map(({ code, path, taskId }) => ({ code, path, taskId })),
        [
          {
            code: "task-required-repo-scope-outside-intent-envelope",
            path: "tasks.task-cli-capability-overage.requiredCapabilities.repoScopes.0",
            taskId: "task-cli-capability-overage"
          },
          {
            code: "task-required-tool-permission-outside-intent-envelope",
            path: "tasks.task-cli-capability-overage.requiredCapabilities.toolPermissions.0",
            taskId: "task-cli-capability-overage"
          },
          {
            code: "task-required-budget-outside-intent-envelope",
            path: "tasks.task-cli-capability-overage.requiredCapabilities.budget.timeoutMs",
            taskId: "task-cli-capability-overage"
          }
        ]
      );
      assert.deepEqual(
        readObjectArrayProperty(failure, "rejectionReasons").map(({ code, path, taskId }) => ({
          code,
          path,
          taskId
        })),
        readObjectArrayProperty(validation, "violations").map(({ code, path, taskId }) => ({
          code,
          path,
          taskId
        }))
      );
      assert.deepEqual(
        planningAdmission["errors"],
        readObjectArrayProperty(validation, "violations").map((violation) => violation["message"])
      );
      assert.deepEqual(
        readObjectArrayProperty(failure, "rejectionReasons").map((violation) => violation["message"]),
        planningAdmission["errors"]
      );
      await assertExecutionAndReviewArtifactsSuppressed(outDir, runId);
    });
  });

  it("spies on the execution entrypoint and proves rejected planning never invokes execution", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_rejected_planning_execution_entrypoint_spy";
      const runDir = resolve(outDir, runId);
      const prepareExecutionRunSpy = mock.fn<FactoryCompositionDependencies["prepareExecutionRun"]>(
        () => {
          throw new Error("Rejected planning result invoked the execution entrypoint.");
        }
      );

      await writeJson(draftPath, draft);
      await writeJson(
        planningFixturePath,
        dogpileUnauthorizedCapabilityPlanningFixture(acceptanceCriterionIdsForDraft(draft))
      );

      await assert.rejects(
        async () => {
          await runFactory(
            {
              intentDraftPath: draftPath,
              outDir,
              planningFixturePath,
              failTaskIds: [],
              intentMode: "brownfield",
              runId
            },
            {
              prepareExecutionRun: prepareExecutionRunSpy
            }
          );
        },
        /Planning admission rejected plan graph:/
      );

      assert.equal(
        prepareExecutionRunSpy.mock.callCount(),
        0,
        "Rejected planning results must hard-block before prepareExecutionRun is invoked."
      );

      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      assert.equal(planningAdmission["decision"], "block");
      assert.equal(planningAdmission["admissionStatus"], "no-plan-admitted");
      assert.equal(planningAdmission["admitted"], false);
      assert.equal(await pathExists(resolve(runDir, "plan.json")), false);
      await assertExecutionAndReviewArtifactsSuppressed(outDir, runId);
    });
  });

  it("rejects the missing-AC-coverage fixture before any admitted plan can be produced", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(repoRoot, sampleFactoryDraftFixtureRelativePath);
      const draft = await readJsonObject(draftPath);
      const planningFixturePath = resolve(repoRoot, missingAcceptanceCoveragePlanningFixtureRelativePath);
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_missing_ac_coverage_rejection";
      const runDir = resolve(outDir, runId);
      const missingAcceptanceCriterionId = acceptanceCriterionIdsForDraft(draft)[1];
      assert.equal(typeof missingAcceptanceCriterionId, "string");

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
      assert.match(result.stderr, /Planning admission rejected plan graph:/);
      assert.match(
        result.stderr,
        new RegExp(`Acceptance criterion ${missingAcceptanceCriterionId} is not covered by any plan task\\.`)
      );

      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      const expectedPlanId = `plan_${runId}`;
      const intentId = planningAdmission["intentId"];
      assert.equal(typeof intentId, "string");
      assert.equal(await pathExists(resolve(runDir, "planning-admission.json")), true);
      assert.equal(
        await pathExists(resolve(runDir, "plan.json")),
        false,
        "The missing-AC-coverage fixture must not produce an admitted plan artifact."
      );
      assert.equal(planningAdmission["artifact"], "planning-admission.json");
      assert.equal(planningAdmission["decision"], "block");
      assert.equal(planningAdmission["admissionStatus"], "no-plan-admitted");
      assert.equal(planningAdmission["admitted"], false);
      assert.equal(planningAdmission["planId"], expectedPlanId);
      assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
      assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);

      const details = readObjectProperty(planningAdmission, "details");
      assert.deepEqual(readObjectProperty(details, "gate"), {
        planGraphValidationPassed: false,
        taskCapabilityRequirementsExtracted: false,
        taskRiskCompatibilityEvidenceAttached: true,
        acceptanceCriterionCoverageEvidenceAttached: false
      });
      assert.equal(Object.hasOwn(details, "taskCapabilityAdmissions"), false);
      assert.equal(Object.hasOwn(details, "acceptanceCoverage"), false);
      const validation = readObjectProperty(details, "validation");
      const violations = readObjectArrayProperty(validation, "violations");
      assert.equal(validation["validator"], "validatePlanGraph");
      assert.equal(validation["ok"], false);
      assert.equal(validation["violationCount"], 1);
      assert.deepEqual(
        violations.map(({ code, path, acceptanceCriterionId }) => ({ code, path, acceptanceCriterionId })),
        [
          {
            code: "uncovered-acceptance-criterion",
            path: "acceptanceCriteria",
            acceptanceCriterionId: missingAcceptanceCriterionId
          }
        ]
      );

      const failure = readObjectProperty(details, "failure");
      assert.equal(failure["state"], "validation-failed");
      assert.equal(failure["status"], "no-plan-admitted");
      assert.equal(failure["admittedPlanCreated"], false);
      assert.equal(failure["violationCount"], 1);
      assert.deepEqual(
        readObjectArrayProperty(failure, "rejectionReasons").map(({ code, path, acceptanceCriterionId }) => ({
          code,
          path,
          acceptanceCriterionId
        })),
        violations.map(({ code, path, acceptanceCriterionId }) => ({ code, path, acceptanceCriterionId }))
      );
      assert.deepEqual(planningAdmission["errors"], [
        `Acceptance criterion ${missingAcceptanceCriterionId} is not covered by any plan task.`
      ]);
      await assertExecutionAndReviewArtifactsSuppressed(outDir, runId);
    });
  });

  it("loads the cyclic planning fixture and rejects it before any admitted-plan handoff can reach execution", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(repoRoot, sampleFactoryDraftFixtureRelativePath);
      const planningFixturePath = resolve(repoRoot, cyclicPlanningFixtureRelativePath);
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_cyclic_plan_rejection";
      const runDir = resolve(outDir, runId);

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
      assert.match(result.stderr, /Planning admission rejected plan graph:/);
      assert.match(
        result.stderr,
        /Task task-cycle-a cannot depend on task-cycle-b because task-cycle-b already depends on task-cycle-a\./
      );
      assert.match(result.stderr, /Plan graph contains a dependency cycle\./);

      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      const expectedPlanId = `plan_${runId}`;
      assert.equal(await pathExists(resolve(runDir, "planning-admission.json")), true);
      assert.equal(
        await pathExists(resolve(runDir, "plan.json")),
        false,
        "The cyclic fixture must not produce an admitted plan artifact."
      );
      assert.equal(planningAdmission["artifact"], "planning-admission.json");
      assert.equal(planningAdmission["decision"], "block");
      assert.equal(planningAdmission["admissionStatus"], "no-plan-admitted");
      assert.equal(planningAdmission["admitted"], false);
      assert.equal(planningAdmission["planId"], expectedPlanId);
      assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
      assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);

      const details = readObjectProperty(planningAdmission, "details");
      assert.deepEqual(readObjectProperty(details, "gate"), {
        planGraphValidationPassed: false,
        taskCapabilityRequirementsExtracted: false,
        taskRiskCompatibilityEvidenceAttached: true,
        acceptanceCriterionCoverageEvidenceAttached: false
      });
      assert.equal(Object.hasOwn(details, "taskCapabilityAdmissions"), false);
      assert.equal(Object.hasOwn(details, "acceptanceCoverage"), false);

      const validation = readObjectProperty(details, "validation");
      const violations = readObjectArrayProperty(validation, "violations");
      assert.equal(validation["validator"], "validatePlanGraph");
      assert.equal(validation["ok"], false);
      assert.equal(validation["violationCount"], 3);
      assert.deepEqual(
        violations.map(({ code, path, message }) => ({ code, path, message })),
        [
          {
            code: "dependency-cycle",
            path: "tasks.task-cycle-a.dependsOn.0",
            message:
              "Task task-cycle-a cannot depend on task-cycle-b because task-cycle-b already depends on task-cycle-a."
          },
          {
            code: "dependency-cycle",
            path: "tasks.task-cycle-b.dependsOn.0",
            message:
              "Task task-cycle-b cannot depend on task-cycle-a because task-cycle-a already depends on task-cycle-b."
          },
          {
            code: "dependency-cycle",
            path: "tasks.dependsOn",
            message: "Plan graph contains a dependency cycle."
          }
        ]
      );

      const failure = readObjectProperty(details, "failure");
      assert.equal(failure["state"], "validation-failed");
      assert.equal(failure["status"], "no-plan-admitted");
      assert.equal(failure["admittedPlanCreated"], false);
      assert.equal(failure["violationCount"], 3);
      assert.deepEqual(
        readObjectArrayProperty(failure, "rejectionReasons").map(({ code, path, message }) => ({
          code,
          path,
          message
        })),
        violations.map(({ code, path, message }) => ({ code, path, message }))
      );
      assert.deepEqual(
        planningAdmission["errors"],
        violations.map((violation) => violation["message"])
      );

      // Plan 01-08: refusal triple — terminal-status.json + refusals.jsonl entry alongside no-plan-admitted planning-admission.json
      await assertRefusalTriple({
        tempDir,
        outDir,
        runId,
        expectedStage: "planning",
        expectedRefusalArtifact: "planning-admission.json"
      });

      await assertExecutionAndReviewArtifactsSuppressed(outDir, runId);
    });
  });

  it("rejects the authority-expansion fixture before any admitted plan can be produced", async () => {
    await withTempDir(async (tempDir) => {
      const draftPath = resolve(repoRoot, sampleFactoryDraftFixtureRelativePath);
      const planningFixturePath = resolve(repoRoot, authorityExpansionPlanningFixtureRelativePath);
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_authority_expansion_rejection";
      const runDir = resolve(outDir, runId);

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
      assert.match(result.stderr, /Planning admission rejected plan graph:/);
      assert.match(result.stderr, /outside confirmed intent capability envelope/);

      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      const expectedPlanId = `plan_${runId}`;
      assert.equal(await pathExists(resolve(runDir, "planning-admission.json")), true);
      assert.equal(
        await pathExists(resolve(runDir, "plan.json")),
        false,
        "The authority-expansion fixture must not produce an admitted plan artifact."
      );
      assert.equal(planningAdmission["artifact"], "planning-admission.json");
      assert.equal(planningAdmission["decision"], "block");
      assert.equal(planningAdmission["admissionStatus"], "no-plan-admitted");
      assert.equal(planningAdmission["admitted"], false);
      assert.equal(planningAdmission["planId"], expectedPlanId);
      assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
      assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);

      const details = readObjectProperty(planningAdmission, "details");
      assert.deepEqual(readObjectProperty(details, "gate"), {
        planGraphValidationPassed: false,
        taskCapabilityRequirementsExtracted: false,
        taskRiskCompatibilityEvidenceAttached: true,
        acceptanceCriterionCoverageEvidenceAttached: false
      });
      assert.equal(Object.hasOwn(details, "taskCapabilityAdmissions"), false);
      assert.equal(Object.hasOwn(details, "acceptanceCoverage"), false);

      const validation = readObjectProperty(details, "validation");
      const violations = readObjectArrayProperty(validation, "violations");
      assert.equal(validation["validator"], "validatePlanGraph");
      assert.equal(validation["ok"], false);
      assert.equal(validation["violationCount"], 5);
      assert.deepEqual(
        violations.map(({ code, path, taskId }) => ({ code, path, taskId })),
        [
          {
            code: "task-required-repo-scope-outside-intent-envelope",
            path: "tasks.task-expand-beyond-envelope.requiredCapabilities.repoScopes.0",
            taskId: "task-expand-beyond-envelope"
          },
          {
            code: "task-required-tool-permission-outside-intent-envelope",
            path: "tasks.task-expand-beyond-envelope.requiredCapabilities.toolPermissions.0",
            taskId: "task-expand-beyond-envelope"
          },
          {
            code: "task-required-execute-grant-outside-intent-envelope",
            path: "tasks.task-expand-beyond-envelope.requiredCapabilities.executeGrants.0",
            taskId: "task-expand-beyond-envelope"
          },
          {
            code: "task-required-budget-outside-intent-envelope",
            path: "tasks.task-expand-beyond-envelope.requiredCapabilities.budget.timeoutMs",
            taskId: "task-expand-beyond-envelope"
          },
          {
            code: "task-required-budget-outside-intent-envelope",
            path: "tasks.task-expand-beyond-envelope.requiredCapabilities.budget.maxRepairLoops",
            taskId: "task-expand-beyond-envelope"
          }
        ]
      );

      const failure = readObjectProperty(details, "failure");
      assert.equal(failure["state"], "validation-failed");
      assert.equal(failure["status"], "no-plan-admitted");
      assert.equal(failure["admittedPlanCreated"], false);
      assert.equal(failure["violationCount"], 5);
      assert.deepEqual(
        readObjectArrayProperty(failure, "rejectionReasons").map(({ code, path, taskId }) => ({
          code,
          path,
          taskId
        })),
        violations.map(({ code, path, taskId }) => ({ code, path, taskId }))
      );
      assert.deepEqual(
        readObjectArrayProperty(validation, "capabilityViolationDiagnostics").map(
          ({ taskId, violatedRule, capabilityPath, severity }) => ({
            taskId,
            violatedRule,
            capabilityPath,
            severity
          })
        ),
        [
          {
            taskId: "task-expand-beyond-envelope",
            violatedRule: "task-required-repo-scope-outside-intent-envelope",
            capabilityPath: "tasks.task-expand-beyond-envelope.requiredCapabilities.repoScopes.0",
            severity: "block"
          },
          {
            taskId: "task-expand-beyond-envelope",
            violatedRule: "task-required-tool-permission-outside-intent-envelope",
            capabilityPath: "tasks.task-expand-beyond-envelope.requiredCapabilities.toolPermissions.0",
            severity: "block"
          },
          {
            taskId: "task-expand-beyond-envelope",
            violatedRule: "task-required-execute-grant-outside-intent-envelope",
            capabilityPath: "tasks.task-expand-beyond-envelope.requiredCapabilities.executeGrants.0",
            severity: "block"
          },
          {
            taskId: "task-expand-beyond-envelope",
            violatedRule: "task-required-budget-outside-intent-envelope",
            capabilityPath: "tasks.task-expand-beyond-envelope.requiredCapabilities.budget.timeoutMs",
            severity: "block"
          },
          {
            taskId: "task-expand-beyond-envelope",
            violatedRule: "task-required-budget-outside-intent-envelope",
            capabilityPath: "tasks.task-expand-beyond-envelope.requiredCapabilities.budget.maxRepairLoops",
            severity: "block"
          }
        ]
      );
      assert.deepEqual(
        planningAdmission["errors"],
        violations.map((violation) => violation["message"])
      );
      await assertExecutionAndReviewArtifactsSuppressed(outDir, runId);
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

      const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, runId));
      assert.equal(admissionDecision["decision"], "block");
      assert.equal(admissionDecision["admitted"], false);
      assert.equal(hasOwn(admissionDecision, "confirmedIntentId"), false);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["confirmedIntentCreated"], false);
      assert.equal(admissionGate["requiredChecklistPassed"], false);

      // Plan 01-08: refusal triple — clarification-report.json + terminal-status.json + refusals.jsonl entry
      await assertRefusalTriple({
        tempDir,
        outDir,
        runId,
        expectedStage: "intent",
        expectedRefusalArtifact: "clarification-report.json"
      });

      await assertIntentOutputFilesSuppressed(outDir, runId);
      await assertDownstreamArtifactsSuppressed(outDir, runId);
    });
  });

  it("persists planning-admission.json when candidate plan creation fails before admission", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "invalid-planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_planning_pre_admission_failure";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, {
        kind: "planning-pile-result",
        source: "fixture",
        output: JSON.stringify({
          strategy: "",
          tasks: [
            {
              id: "candidate-without-task-prefix",
              title: "",
              kind: "unsupported",
              dependsOn: ["missing-prefix"],
              covers: ["not-an-ac"],
              risk: "extreme"
            }
          ]
        })
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
      assert.match(result.stderr, /Planning admission failed before candidate PlanGraph admission:/);
      assert.match(result.stderr, /strategy must be a non-empty string/);
      assert.match(result.stderr, /requiredCapabilities must be provided/);

      const admissionDecision = await readIntentAdmissionEvidence(runDir);
      assert.equal(admissionDecision["decision"], "allow");
      assert.equal(admissionDecision["admitted"], true);
      assert.equal(admissionDecision["draftId"], draft["draftId"]);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["policyPassed"], true);
      assert.equal(admissionGate["confirmedIntentCreated"], true);

      const planningAdmission = await readJsonObject(resolve(runDir, "planning-admission.json"));
      assert.equal(planningAdmission["artifact"], "planning-admission.json");
      assert.equal(planningAdmission["decision"], "block");
      assert.equal(planningAdmission["admissionStatus"], "no-plan-admitted");
      assert.equal(planningAdmission["admitted"], false);
      assert.equal(planningAdmission["planId"], `plan_${runId}`);
      assert.equal(planningAdmission["intentId"], admissionDecision["confirmedIntentId"]);
      assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
      assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);
      assert.equal(await pathExists(resolve(runDir, "planning-admission.json")), true);
      assert.deepEqual(readObjectProperty(planningAdmission, "candidateSource"), {
        kind: "planning-pile-result",
        uri: "planning-result.json",
        pointer: "#",
        sourceOfTruth: "PlanningPileResult"
      });

      const details = readObjectProperty(planningAdmission, "details");
      assert.deepEqual(readObjectProperty(details, "gate"), {
        planGraphValidationPassed: false,
        candidatePlanCreated: false,
        taskCapabilityRequirementsExtracted: false,
        taskRiskCompatibilityEvidenceAttached: false,
        acceptanceCriterionCoverageEvidenceAttached: false
      });
      const validation = readObjectProperty(details, "validation");
      assert.equal(validation["validator"], "createCandidatePlanGraph");
      assert.equal(validation["ok"], false);
      const violations = readObjectArrayProperty(validation, "violations");
      const violationMessages = violations.map((violation) => violation["message"]);
      assert.deepEqual(violationMessages, [
        "strategy must be a non-empty string.",
        "tasks[0].title must be a non-empty string.",
        "tasks[0].requiredCapabilities must be provided in normalized capability-envelope shape.",
        "tasks[0].kind must be research, design, implementation, verification, or release.",
        "tasks[0].risk must be low, medium, or high.",
        "tasks[0].id must start with task-.",
        "tasks[0].dependsOn[0] must start with task-.",
        "tasks[0].covers entries must start with ac_."
      ]);
      assert.equal(validation["violationCount"], violationMessages.length);
      const failure = readObjectProperty(details, "failure");
      assert.equal(failure["state"], "pre-admission-failed");
      assert.equal(failure["status"], "no-plan-admitted");
      assert.equal(failure["admittedPlanCreated"], false);
      assert.equal(failure["candidatePlanCreated"], false);
      assert.equal(failure["candidatePlanId"], `plan_${runId}`);
      assert.deepEqual(
        readObjectArrayProperty(failure, "rejectionReasons").map(({ code, path, message }) => ({
          code,
          path,
          message
        })),
        violations.map(({ code, path, message }) => ({ code, path, message }))
      );
      assert.deepEqual(planningAdmission["errors"], violationMessages);
      assert.equal(await pathExists(resolve(runDir, "planning-result.json")), true);
      assert.equal(await pathExists(resolve(runDir, "plan.json")), false);
      await assertExecutionAndReviewArtifactsSuppressed(outDir, runId);
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
        expectedExitCode: 2,
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
        const confirmedIntentPath = resolve(tempDir, "intent.json");
        const outDir = resolve(tempDir, "out");

        await writeJson(draftPath, testCase.draft);
        await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(testCase.draft)));
        // Only the "allow" case reaches two-key verification; others fail at intent admission.
        if (testCase.label === "allow") {
          await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(testCase.draft));
        } else {
          await writeJson(confirmedIntentPath, { fixture: "operator-confirmed-intent" });
        }

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
          "brownfield",
          "--trust",
          "trusted",
          "--confirmed-intent",
          confirmedIntentPath
        ]);

        assert.equal(result.exitCode, testCase.expectedExitCode, `${testCase.label}: ${result.stderr}`);
        if (testCase.expectedExitCode === 0) {
          assert.notEqual(result.stdout, "", `${testCase.label}: successful admission should print the intent.`);
          assert.equal(result.stderr, "", `${testCase.label}: successful admission should not print stderr.`);
        } else {
          assert.equal(result.stdout, "", `${testCase.label}: refused admission should not print an intent.`);
          assert.match(result.stderr, /Draft intent refused by admission gate\./, testCase.label);
        }

        const admissionDecisionPath = resolve(outDir, testCase.runId, "intent-admission-decision.json");
        assert.equal(await pathExists(admissionDecisionPath), true, `${testCase.label}: admission decision missing.`);
        const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, testCase.runId));
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
      const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, runId));
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

      const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, runId));
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

      assert.equal(result.exitCode, 2);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /Draft intent refused by admission gate\./);
      assert.match(result.stderr, /Policy findings:/);
      assert.match(result.stderr, /tool-authority-overage/);
      const admissionDecision = await readIntentAdmissionEvidence(resolve(outDir, runId));
      assert.equal(admissionDecision["decision"], "escalate");
      assert.equal(admissionDecision["admitted"], false);
      const admissionDetails = readObjectProperty(admissionDecision, "details");
      const admissionGate = readObjectProperty(admissionDetails, "gate");
      assert.equal(admissionGate["requiredChecklistPassed"], true);
      assert.equal(admissionGate["ambiguityPassed"], false);
      assert.equal(admissionGate["policyPassed"], false);
      const marker = await readJsonObject(resolve(outDir, runId, "escalation-marker.json"));
      assert.equal(marker["gate"], "intent");
      assert.equal(marker["awaiting"], "operator-confirm");
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

describe("fail-closed precedence and gate evidence", () => {
  it("blocks and writes repo-scope admission decision when repo policy is absent", async () => {
    await withTempDir(async (tempDir) => {
      // tempDir has no .protostar/repo-policy.json → DENY_ALL_REPO_POLICY is used
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "intent-draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_deny_all_repo_policy";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeFile(resolve(tempDir, "pnpm-workspace.yaml"), "packages: []\n", "utf8");

      const result = await runCliWithWorkspace(
        [
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
        ],
        tempDir
      );

      assert.notEqual(result.exitCode, 0, "CLI must exit non-zero when precedence is blocked");
      assert.match(result.stderr, /precedence blocked by tier/);

      const precedenceDecision = await readJsonObject(resolve(runDir, "precedence-decision.json"));
      assert.equal(precedenceDecision["status"], "blocked-by-tier");

      assert.equal(
        await pathExists(resolve(runDir, "intent.json")),
        false,
        "intent.json must not be written when precedence is blocked"
      );

      const repoScopeDecision = await readJsonObject(resolve(runDir, "repo-scope-admission-decision.json"));
      assert.equal(repoScopeDecision["outcome"], "block");
      const repoScopeEvidence = readObjectProperty(repoScopeDecision, "evidence");
      assert.ok(Object.hasOwn(repoScopeEvidence, "requestedScopes"), "evidence.requestedScopes must be present");
      assert.ok(Object.hasOwn(repoScopeEvidence, "grantedScopes"), "evidence.grantedScopes must be present");
      assert.ok(Object.hasOwn(repoScopeEvidence, "blockedBy"), "evidence.blockedBy must be present");
    });
  });

  it("validates emitted gate evidence against all five gate schemas on a successful run", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "intent-draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_gate_evidence_schema_valid";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);

      const schemaDir = resolve(repoRoot, "packages");
      const gateSchemas = [
        {
          gate: "intent",
          schemaPath: resolve(schemaDir, "intent/schema/intent-admission-decision.schema.json")
        },
        {
          gate: "planning",
          schemaPath: resolve(schemaDir, "planning/schema/planning-admission-decision.schema.json")
        },
        {
          gate: "capability",
          schemaPath: resolve(schemaDir, "intent/schema/capability-admission-decision.schema.json")
        },
        {
          gate: "repo-scope",
          schemaPath: resolve(schemaDir, "intent/schema/repo-scope-admission-decision.schema.json")
        },
        {
          gate: "workspace-trust",
          schemaPath: resolve(schemaDir, "repo/schema/workspace-trust-admission-decision.schema.json")
        }
      ] as const;

      for (const { gate, schemaPath } of gateSchemas) {
        const schema = JSON.parse(await readFile(schemaPath, "utf8")) as Record<string, unknown>;
        const decision = await readJsonObject(resolve(runDir, `${gate}-admission-decision.json`));
        validateAgainstSchema(decision, schema, schema, `${gate}-admission-decision`);
      }
    });
  });

  it("uses candidatesConsidered (not candidateCount) in planning admission evidence", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "intent-draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_planning_evidence_shape";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);

      const planningDecision = await readJsonObject(resolve(runDir, "planning-admission-decision.json"));
      const evidence = readObjectProperty(planningDecision, "evidence");
      assert.ok(Object.hasOwn(evidence, "candidatesConsidered"), "evidence.candidatesConsidered must be present");
      assert.equal(Object.hasOwn(evidence, "candidateCount"), false, "evidence must not have candidateCount");
    });
  });

  it("uses requestedEnvelope/resolvedEnvelope in capability evidence and requestedScopes/grantedScopes in repo-scope evidence", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "intent-draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_capability_repo_evidence_shape";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);

      const capabilityDecision = await readJsonObject(resolve(runDir, "capability-admission-decision.json"));
      const capEvidence = readObjectProperty(capabilityDecision, "evidence");
      assert.ok(Object.hasOwn(capEvidence, "requestedEnvelope"), "capability evidence.requestedEnvelope must be present");
      assert.ok(Object.hasOwn(capEvidence, "resolvedEnvelope"), "capability evidence.resolvedEnvelope must be present");

      const repoScopeDecision = await readJsonObject(resolve(runDir, "repo-scope-admission-decision.json"));
      const repoEvidence = readObjectProperty(repoScopeDecision, "evidence");
      assert.ok(Object.hasOwn(repoEvidence, "requestedScopes"), "repo-scope evidence.requestedScopes must be present");
      assert.ok(Object.hasOwn(repoEvidence, "grantedScopes"), "repo-scope evidence.grantedScopes must be present");
    });
  });

  it("uses workspacePath/grantedAccess in workspace-trust evidence", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "intent-draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_workspace_trust_evidence_shape";
      const runDir = resolve(outDir, runId);

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      await writeJson(confirmedIntentPath, await buildSignedConfirmedIntentFile(draft));

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);

      const workspaceTrustDecision = await readJsonObject(resolve(runDir, "workspace-trust-admission-decision.json"));
      const evidence = readObjectProperty(workspaceTrustDecision, "evidence");
      assert.ok(Object.hasOwn(evidence, "workspacePath"), "workspace-trust evidence.workspacePath must be present");
      assert.ok(Object.hasOwn(evidence, "grantedAccess"), "workspace-trust evidence.grantedAccess must be present");
      assert.equal(evidence["grantedAccess"], "write");
    });
  });

  it("blocks and writes escalation marker when workspace is untrusted (not allow with admitted:false)", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "intent-draft.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_untrusted_workspace_block";
      const runDir = resolve(outDir, runId);

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
        // no --trust trusted → defaults to untrusted
      ]);

      assert.notEqual(result.exitCode, 0, "CLI must exit non-zero when workspace trust is untrusted");

      const workspaceTrustDecision = await readJsonObject(resolve(runDir, "workspace-trust-admission-decision.json"));
      const outcome = workspaceTrustDecision["outcome"];
      assert.ok(
        outcome === "block" || outcome === "escalate",
        `workspace-trust outcome must be block or escalate for untrusted workspace, got: ${String(outcome)}`
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Task 2 RED: verified trusted-launch second-key — tests must FAIL before wiring
// ---------------------------------------------------------------------------

describe("trusted launch verified second-key (GOV-04/GOV-06)", () => {
  it("rejects a fake JSON object as confirmed intent (not a real ConfirmedIntent)", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_verified_two_key_fake_json";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));
      // Fake object — not a real ConfirmedIntent at all
      await writeJson(confirmedIntentPath, { fixture: "operator-confirmed-intent" });

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /trusted launch confirmed intent verification failed/);
    });
  });

  it("rejects an unsigned ConfirmedIntent as confirmed intent", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_verified_two_key_unsigned";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));

      // A valid ConfirmedIntent shape but with null signature
      const promoted = promoteIntentDraft({ draft, mode: "brownfield" });
      if (!promoted.ok) throw new Error(`Promotion failed: ${promoted.errors.join("; ")}`);
      const unsignedIntent = promoted.intent;
      await writeJson(confirmedIntentPath, { ...unsignedIntent, signature: null });

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /trusted launch confirmed intent verification failed/);
    });
  });

  it("rejects a signed ConfirmedIntent that does not match the current run's promoted intent", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_verified_two_key_mismatched";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));

      // Build a signed intent for a DIFFERENT draft — it will not match the current run's promoted intent
      const differentDraft = { ...clearCosmeticDraft(), draftId: "draft_different_intent", title: "Completely different intent" };
      const differentIntentFile = await buildSignedConfirmedIntentFile(differentDraft);
      await writeJson(confirmedIntentPath, differentIntentFile);

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 2, result.stderr);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /trusted launch confirmed intent verification failed/);
    });
  });

  it("accepts a matching signed ConfirmedIntent from a prior dry run", async () => {
    await withTempDir(async (tempDir) => {
      const draft = clearCosmeticDraft();
      const draftPath = resolve(tempDir, "clear-cosmetic.json");
      const planningFixturePath = resolve(tempDir, "planning-fixture.json");
      const confirmedIntentPath = resolve(tempDir, "intent.json");
      const outDir = resolve(tempDir, "out");
      const runId = "run_cli_verified_two_key_matching";

      await writeJson(draftPath, draft);
      await writeJson(planningFixturePath, cosmeticPlanningFixture(acceptanceCriterionIdsForDraft(draft)));

      // Build a signed intent that matches the current run's promoted intent
      const matchingIntentFile = await buildSignedConfirmedIntentFile(draft);
      await writeJson(confirmedIntentPath, matchingIntentFile);

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
        "brownfield",
        "--trust",
        "trusted",
        "--confirmed-intent",
        confirmedIntentPath
      ]);

      assert.equal(result.exitCode, 0, result.stderr);
      assert.equal(result.stderr, "");
    });
  });
});

/**
 * Build a signed ConfirmedIntent JSON object from a draft.
 * Uses the draft's own capabilityEnvelope as the resolvedEnvelope (assumes no
 * policy reduction for test drafts). The result can be written to disk and
 * passed as --confirmed-intent for trusted launch verification.
 */
async function buildSignedConfirmedIntentFile(draft: Record<string, unknown>): Promise<Record<string, unknown>> {
  const promoted = promoteIntentDraft({ draft, mode: "brownfield" });
  if (!promoted.ok) throw new Error(`Cannot promote draft for test signing: ${promoted.errors.join("; ")}`);
  const unsignedIntent = promoted.intent;
  const repoPolicy = await loadRepoPolicy(repoRoot);
  const precedenceDecision = intersectEnvelopes(buildTierConstraints({
    intent: unsignedIntent,
    policy: { envelope: unsignedIntent.capabilityEnvelope, source: "factory-cli:policy" },
    repoPolicy,
    operatorSettings: { envelope: unsignedIntent.capabilityEnvelope, source: "factory-cli:operator-settings" }
  }));
  if (precedenceDecision.status === "blocked-by-tier") {
    throw new Error("Cannot sign test intent for blocked precedence decision.");
  }
  const resolvedEnvelope = precedenceDecision.resolvedEnvelope as unknown as CapabilityEnvelope;
  const policySnapshot = buildPolicySnapshot({
    capturedAt: "2026-01-01T00:00:00.000Z",
    policy: { allowDarkRun: true, maxAutonomousRisk: "medium", requiredHumanCheckpoints: [] },
    resolvedEnvelope,
    repoPolicy
  });
  const policySnapshotHash = hashPolicySnapshot(policySnapshot);
  const { signature: _sig, ...intentBody } = unsignedIntent;
  const signature = buildSignatureEnvelope({
    intent: intentBody,
    resolvedEnvelope,
    policySnapshotHash
  });
  const signedResult = promoteAndSignIntent({ ...intentBody, signature });
  if (!signedResult.ok) throw new Error(`Cannot sign test intent: ${signedResult.errors.join("; ")}`);
  return signedResult.intent as unknown as Record<string, unknown>;
}

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
    createdAt: "2026-01-01T00:00:00.000Z",
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

async function readIntentAdmissionEvidence(runDir: string): Promise<Record<string, unknown>> {
  const decision = await readJsonObject(resolve(runDir, "intent-admission-decision.json"));
  assert.equal(decision["schemaVersion"], "1.0.0");
  assert.equal(decision["gate"], "intent");
  return readObjectProperty(decision, "evidence");
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
  const noRequiredCapabilities = {
    repoScopes: [],
    toolPermissions: [],
    budget: {}
  };

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
        acceptanceTestRefs: acceptanceTestRefsFor([criterionId]),
        requiredCapabilities: noRequiredCapabilities,
        risk: "low"
      }))
    })
  };
}

function dogpilePlanningFixture(acceptanceCriterionIds: readonly string[]): Record<string, unknown> {
  return {
    ...cosmeticPlanningFixture(acceptanceCriterionIds),
    source: "dogpile",
    modelProviderId: "dogpile-planning-cell",
    traceRef: "trace-dogpile-candidate-admission-before-execution"
  };
}

function multiCandidatePlanningFixture(acceptanceCriterionIds: readonly string[]): readonly Record<string, unknown>[] {
  const noRequiredCapabilities = {
    repoScopes: [],
    toolPermissions: [],
    budget: {}
  };

  return [
    {
      kind: "planning-pile-result",
      source: "fixture",
      modelProviderId: "deterministic-cli-rejected-first-candidate",
      output: JSON.stringify({
        strategy: "Reject this first candidate but continue validating later candidates.",
        tasks: [
          {
            id: "task-cli-first-candidate-empty-coverage",
            title: "Trip coverage admission in the first candidate",
            kind: "verification",
            dependsOn: [],
            covers: [],
            acceptanceTestRefs: [],
            requiredCapabilities: noRequiredCapabilities,
            risk: "low"
          }
        ]
      })
    },
    {
      kind: "planning-pile-result",
      source: "fixture",
      modelProviderId: "deterministic-cli-admitted-middle-candidate",
      output: JSON.stringify({
        strategy: "Admit the valid middle candidate after all candidates are checked.",
        tasks: acceptanceCriterionIds.map((criterionId, index) => ({
          id: `task-cli-middle-candidate-${index + 1}`,
          title: `Cover multi-candidate acceptance criterion ${index + 1}`,
          kind: "verification",
          dependsOn: index === 0 ? [] : [`task-cli-middle-candidate-${index}`],
          covers: [criterionId],
          acceptanceTestRefs: acceptanceTestRefsFor([criterionId]),
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }))
      })
    },
    {
      kind: "planning-pile-result",
      source: "fixture",
      modelProviderId: "deterministic-cli-rejected-last-candidate",
      output: JSON.stringify({
        strategy: "Reject this last candidate after an admissible candidate has already appeared.",
        tasks: acceptanceCriterionIds.map((criterionId, index) => ({
          id: `task-cli-last-candidate-${index + 1}`,
          title: `Cover late candidate acceptance criterion ${index + 1}`,
          kind: "verification",
          dependsOn: index === 0 ? ["task-cli-last-candidate-missing"] : [`task-cli-last-candidate-${index}`],
          covers: [criterionId],
          acceptanceTestRefs: acceptanceTestRefsFor([criterionId]),
          requiredCapabilities: noRequiredCapabilities,
          risk: "low"
        }))
      })
    }
  ];
}

function unauthorizedCapabilityPlanningFixture(acceptanceCriterionIds: readonly string[]): Record<string, unknown> {
  const firstCriterionId = acceptanceCriterionIds[0];
  const secondCriterionId = acceptanceCriterionIds[1];
  if (typeof firstCriterionId !== "string" || typeof secondCriterionId !== "string") {
    throw new Error("unauthorized capability fixture requires at least two acceptance criteria.");
  }

  return {
    kind: "planning-pile-result",
    source: "fixture",
    modelProviderId: "deterministic-cli-capability-rejection-fixture",
    output: JSON.stringify({
      strategy: "Request capabilities outside the confirmed intent envelope and persist rejection evidence.",
      tasks: [
        {
          id: "task-cli-capability-overage",
          title: "Attempt to exceed confirmed intent authority",
          kind: "verification",
          dependsOn: [],
          covers: [firstCriterionId],
          acceptanceTestRefs: acceptanceTestRefsFor([firstCriterionId]),
          requiredCapabilities: {
            repoScopes: [
              {
                workspace: "protostar",
                path: "packages/planning",
                access: "write"
              }
            ],
            toolPermissions: [
              {
                tool: "node:test",
                permissionLevel: "admin",
                reason: "Attempt to exceed the admitted test runner permission.",
                risk: "low"
              }
            ],
            budget: {
              timeoutMs: 600000
            }
          },
          risk: "low"
        },
        {
          id: "task-cli-capability-control",
          title: "Keep acceptance coverage complete while another task fails capability admission",
          kind: "verification",
          dependsOn: ["task-cli-capability-overage"],
          covers: [secondCriterionId],
          acceptanceTestRefs: acceptanceTestRefsFor([secondCriterionId]),
          requiredCapabilities: {
            repoScopes: [],
            toolPermissions: [],
            budget: {}
          },
          risk: "low"
        }
      ]
    })
  };
}

function dogpileUnauthorizedCapabilityPlanningFixture(acceptanceCriterionIds: readonly string[]): Record<string, unknown> {
  return {
    ...unauthorizedCapabilityPlanningFixture(acceptanceCriterionIds),
    source: "dogpile",
    modelProviderId: "dogpile-planning-cell",
    traceRef: "trace-dogpile-invalid-candidate-blocks-execution"
  };
}

function acceptanceTestRefsFor(
  acceptanceCriterionIds: readonly string[]
): readonly { readonly acId: string; readonly testFile: string; readonly testName: string }[] {
  return acceptanceCriterionIds.map((acId) => ({
    acId,
    testFile: "apps/factory-cli/src/main.test.ts",
    testName: "factory CLI candidate-plan admission fixture"
  }));
}

function expectedExecutionAdmittedPlanEvidence(plan: Record<string, unknown>): Record<string, unknown> {
  return {
    planId: plan["planId"],
    intentId: plan["intentId"],
    planGraphUri: "plan.json",
    planningAdmissionArtifact: "planning-admission.json",
    planningAdmissionUri: "planning-admission.json",
    validationSource: "planning-admission.json",
    proofSource: "PlanGraph"
  };
}

function assertThinAcceptedPlanningAdmission(
  planningAdmission: Record<string, unknown>,
  plan: Record<string, unknown>
): void {
  assert.deepEqual(Object.keys(planningAdmission).sort(), [
    "admissionStatus",
    "admitted",
    "admittedAt",
    "artifact",
    "candidatePlan",
    "candidateSource",
    "decision",
    "errors",
    "intentId",
    "plan_hash",
    "planId",
    "planningAttempt",
    "schemaVersion",
    "validator_versions",
    "validators_passed"
  ].sort());
  assert.equal(typeof planningAdmission["admittedAt"], "string");

  const candidateSource = {
    kind: "candidate-plan-graph",
    planId: plan["planId"],
    uri: "plan.json",
    pointer: "#",
    createdAt: plan["createdAt"],
    sourceOfTruth: "PlanGraph"
  };

  assert.deepEqual(planningAdmission, {
    schemaVersion: PLANNING_ADMISSION_SCHEMA_VERSION,
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    decision: "allow",
    admissionStatus: "plan-admitted",
    admitted: true,
    admittedAt: planningAdmission["admittedAt"],
    planningAttempt: {
      id: `planning-attempt:${String(plan["planId"])}`,
      candidatePlanId: plan["planId"],
      intentId: plan["intentId"],
      candidatePlanCreatedAt: plan["createdAt"]
    },
    candidateSource,
    candidatePlan: {
      planId: plan["planId"],
      intentId: plan["intentId"],
      createdAt: plan["createdAt"],
      source: candidateSource
    },
    planId: plan["planId"],
    intentId: plan["intentId"],
    plan_hash: hashPlanGraph(plan as unknown as PlanGraph),
    validators_passed: [...PLAN_GRAPH_ADMISSION_VALIDATORS],
    validator_versions: PLAN_GRAPH_ADMISSION_VALIDATOR_VERSIONS,
    errors: []
  });
  assert.equal(Object.hasOwn(planningAdmission, "details"), false);
  assert.equal(Object.hasOwn(planningAdmission, "admittedPlan"), false);
  assert.equal(Object.hasOwn(planningAdmission, "handoff"), false);
}

function assertExecutionPlanUsesPlanningAdmissionHandoff(
  executionPlan: Record<string, unknown>,
  plan: Record<string, unknown>
): void {
  assert.deepEqual(
    readObjectProperty(executionPlan, "admittedPlan"),
    expectedExecutionAdmittedPlanEvidence(plan)
  );
  assert.equal(Object.hasOwn(executionPlan, "strategy"), false);
  assert.equal(Object.hasOwn(executionPlan, "acceptanceCriteria"), false);
  assert.equal(Object.hasOwn(executionPlan, "__protostarPlanAdmissionState"), false);

  const executionTasks = readObjectArrayProperty(executionPlan, "tasks");
  const planTasks = readObjectArrayProperty(plan, "tasks");
  assert.deepEqual(
    executionTasks.map((task) => ({
      planTaskId: task["planTaskId"],
      title: task["title"],
      dependsOn: task["dependsOn"]
    })),
    planTasks.map((task) => ({
      planTaskId: task["id"],
      title: task["title"],
      dependsOn: task["dependsOn"]
    }))
  );

  for (const executionTask of executionTasks) {
    assert.deepEqual(
      Object.keys(executionTask).sort(),
      ["dependsOn", "planTaskId", "status", "title"].sort()
    );
    assert.equal(Object.hasOwn(executionTask, "id"), false);
    assert.equal(Object.hasOwn(executionTask, "kind"), false);
    assert.equal(Object.hasOwn(executionTask, "covers"), false);
    assert.equal(Object.hasOwn(executionTask, "requiredCapabilities"), false);
    assert.equal(Object.hasOwn(executionTask, "risk"), false);
  }
}

async function assertReviewCompositionUsesPlanningAdmissionBoundary(
  runDir: string,
  plan: Record<string, unknown>
): Promise<void> {
  const reviewMission = await readFile(resolve(runDir, "review-mission.txt"), "utf8");
  assert.match(reviewMission, /Review input artifact: planning-admission\.json/);
  assert.match(reviewMission, /Planning admission decision: allow/);
  assert.match(reviewMission, /Planning admission status: plan-admitted/);
  assert.match(reviewMission, /Plan proof source: PlanGraph at plan\.json/);

  for (const task of readObjectArrayProperty(plan, "tasks")) {
    const taskId = task["id"];
    const taskTitle = task["title"];
    assert.equal(typeof taskId, "string");
    assert.equal(typeof taskTitle, "string");
    const planTaskId = taskId as string;
    const planTaskTitle = taskTitle as string;
    assert.equal(
      reviewMission.includes(planTaskId),
      false,
      `Review mission must not inline candidate PlanGraph task id ${planTaskId}.`
    );
    assert.equal(
      reviewMission.includes(planTaskTitle),
      false,
      `Review mission must not inline candidate PlanGraph task title ${planTaskTitle}.`
    );
  }

  assertJsonDoesNotContainCandidatePlanBody(
    await readJsonObject(resolve(runDir, "review-execution-loop.json")),
    "review-execution-loop.json"
  );
  assertJsonDoesNotContainCandidatePlanBody(
    await readJsonObject(resolve(runDir, "review-gate.json")),
    "review-gate.json"
  );
}

function assertJsonDoesNotContainCandidatePlanBody(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      assertJsonDoesNotContainCandidatePlanBody(item, `${path}.${index}`);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  assert.equal(
    value["__protostarPlanAdmissionState"] === "candidate-plan",
    false,
    `${path} must not contain a CandidatePlan admission marker.`
  );
  assert.equal(
    looksLikeRawPlanGraphBody(value),
    false,
    `${path} must not inline a candidate PlanGraph body.`
  );
  assert.equal(
    looksLikeRawPlanTaskBody(value),
    false,
    `${path} must not inline a raw PlanGraph task body.`
  );

  for (const [key, item] of Object.entries(value)) {
    assertJsonDoesNotContainCandidatePlanBody(item, `${path}.${key}`);
  }
}

function looksLikeRawPlanGraphBody(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value["acceptanceCriteria"]) &&
    Array.isArray(value["tasks"]) &&
    typeof value["strategy"] === "string"
  );
}

function looksLikeRawPlanTaskBody(value: Record<string, unknown>): boolean {
  return (
    typeof value["id"] === "string" &&
    typeof value["kind"] === "string" &&
    Array.isArray(value["covers"]) &&
    "requiredCapabilities" in value &&
    "risk" in value
  );
}

function expectedPlanningAdmissionCapabilityAdmissions(
  acceptanceCriterionIds: readonly string[]
): readonly Record<string, unknown>[] {
  const noRequiredCapabilities = {
    repoScopes: [],
    toolPermissions: [],
    budget: {}
  };

  return acceptanceCriterionIds.map((_, index) => ({
    taskId: `task-cli-success-${index + 1}`,
    requestedCapabilities: noRequiredCapabilities,
    admittedCapabilities: noRequiredCapabilities,
    verdict: "allow"
  }));
}

function expectedPlanningAdmissionCoverage(acceptanceCriterionIds: readonly string[]): readonly Record<string, unknown>[] {
  return acceptanceCriterionIds.map((acceptanceCriterionId, index) => ({
    acceptanceCriterionId,
    acceptedCriterionPath: `acceptanceCriteria.${index}`,
    coverageLinks: [
      {
        taskId: `task-cli-success-${index + 1}`,
        coveragePath: `tasks.task-cli-success-${index + 1}.covers.0`
      }
    ]
  }));
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

async function assertFactoryCompositionUsesPlanningAdmissionBoundary(): Promise<void> {
  const source = await readFile(resolve(repoRoot, "apps/factory-cli/src/main.ts"), "utf8");
  assert.match(
    source,
    /const candidateAdmission = candidatePlans\.length === 1\s*\?\s*admitCandidatePlan\(/s,
    "Single Dogpile planning output must be admitted through packages/planning before composition."
  );
  assert.match(
    source,
    /:\s*admitCandidatePlans\(/s,
    "Multiple Dogpile planning outputs must use the packages/planning batch admission boundary."
  );
  assert.match(
    source,
    /const admittedPlan = candidateAdmission\.admittedPlan;/,
    "Composition must bind the admitted plan returned by planning admission."
  );
  assert.match(
    source,
    /const persistedPlanningAdmission = await readPersistedPlanningAdmissionArtifact\(runDir\);/,
    "Composition must re-read persisted planning-admission.json before creating execution handoff evidence."
  );
  assert.match(
    source,
    /const workSlicingApplied = await maybeApplyWorkSlicingPile\(/,
    "Execution handoff must consume admitted planning output from the persisted planning-admission boundary, including any re-admitted work-sliced plan."
  );
  assert.match(
    source,
    /planningAdmission:\s*workingPersistedPlanningAdmission,/,
    "Execution handoff must consume the persisted planning-admission payload selected by the work-slicing boundary."
  );
  assert.match(
    source,
    /planningAdmission:\s*input\.persistedPlanningAdmission,/,
    "The work-slicing boundary must preserve the originally persisted planning-admission payload when slicing does not run."
  );
  assert.match(
    source,
    /planningAdmission:\s*rePersisted,/,
    "The work-slicing boundary must consume the re-read planning-admission.json payload after a sliced plan is admitted."
  );
  assert.match(
    source,
    /assertAdmittedPlanHandoff\(\{\s*plan: admittedPlanningOutput\.admittedPlan,/s,
    "Execution handoff must be created from the admitted plan, not from a candidate plan."
  );
  assert.match(
    source,
    /planningAdmissionArtifact: admittedPlanningOutput\.planningAdmissionArtifact,/s,
    "Execution handoff must carry forward the emitted planning-admission.json artifact reference."
  );
  assert.doesNotMatch(
    source,
    /assertAdmittedPlanHandoff\(\{\s*plan:\s*(candidatePlan|firstCandidatePlan),/s,
    "Candidate plans must not be passed directly into the admitted-plan handoff."
  );
  assert.match(
    source,
    /dependencies\.prepareExecutionRun\(\{[\s\S]*admittedPlan: admittedPlanHandoff\.executionArtifact/,
    "Execution must receive only the admitted-plan execution artifact produced from planning-admission evidence."
  );
  assert.match(
    source,
    /runReviewRepairLoop\(\{[\s\S]*admittedPlan: admittedPlanHandoff\.executionArtifact/,
    "Review must receive only the admitted-plan execution artifact produced from planning-admission evidence."
  );
  assert.match(
    source,
    /const reviewMission = buildReviewMission\(intent,\s*admittedPlanningOutput\.planningAdmission\);/,
    "Review mission must consume the persisted planning-admission.json payload, not a candidate plan object."
  );
  assert.doesNotMatch(
    source,
    /buildReviewMission\(intent,\s*(candidatePlan|firstCandidatePlan|admittedPlanHandoff\.plan|admittedPlan)\)/,
    "Review mission must not receive candidate or raw plan graph objects."
  );
  assertSourceOrder(
    source,
    "const candidateAdmission = candidatePlans.length === 1",
    "const planningAdmissionArtifact = await writePlanningAdmissionArtifacts({",
    "Dogpile candidate plans must be admitted before planning-admission.json is persisted."
  );
  assertSourceOrder(
    source,
    "const planningAdmissionArtifact = await writePlanningAdmissionArtifacts({",
    "const persistedPlanningAdmission = await readPersistedPlanningAdmissionArtifact(runDir);",
    "Planning admission must be durably written before downstream stages consume it."
  );
  assertSourceOrder(
    source,
    "const persistedPlanningAdmission = await readPersistedPlanningAdmissionArtifact(runDir);",
    "const admittedPlanHandoff = assertAdmittedPlanHandoff({",
    "Execution handoff must be created from the persisted planning admission payload."
  );
  assertSourceOrder(
    source,
    "if (!candidateAdmission.ok) {",
    "const admittedPlan = candidateAdmission.admittedPlan;",
    "Rejected candidate plans must block before any admitted plan binding exists."
  );
  assertSourceOrder(
    source,
    "if (!candidateAdmission.ok) {",
    "const execution = dependencies.prepareExecutionRun({",
    "Rejected candidate plans must block before execution run plan creation."
  );
  assertSourceOrder(
    source,
    "const admittedPlanHandoff = assertAdmittedPlanHandoff({",
    "const execution = dependencies.prepareExecutionRun({",
    "Execution run plan creation must be downstream of the admitted-plan handoff."
  );
  assertSourceOrder(
    source,
    "const execution = dependencies.prepareExecutionRun({",
    "loop = await runReviewRepairLoop({",
    "Review must remain downstream of execution run plan creation."
  );
  assertSourceOrder(
    source,
    "const persistedPlanningAdmission = await readPersistedPlanningAdmissionArtifact(runDir);",
    "const reviewMission = buildReviewMission(intent, admittedPlanningOutput.planningAdmission);",
    "Review mission must be built from the persisted planning admission payload."
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

async function assertRefusalTriple(input: {
  readonly tempDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly expectedStage: "intent" | "planning" | "workspace-trust";
  readonly expectedRefusalArtifact: string;
}): Promise<void> {
  const runDir = resolve(input.outDir, input.runId);

  // 1. Per-run terminal-status.json marker
  const terminalStatusPath = resolve(runDir, "terminal-status.json");
  assert.equal(
    await pathExists(terminalStatusPath),
    true,
    `Expected terminal-status.json at ${terminalStatusPath}.`
  );
  const terminalStatus = await readJsonObject(terminalStatusPath);
  assert.equal(terminalStatus["schemaVersion"], "1.0.0");
  assert.equal(terminalStatus["artifact"], "terminal-status.json");
  assert.equal(terminalStatus["status"], "refused");
  assert.equal(terminalStatus["stage"], input.expectedStage);
  assert.equal(terminalStatus["runId"], input.runId);
  assert.equal(terminalStatus["refusalArtifact"], input.expectedRefusalArtifact);
  assert.equal(typeof terminalStatus["reason"], "string");

  // 2. Per-run refusal artifact (clarification-report.json or planning-admission.json/no-plan-admitted)
  assert.equal(
    await pathExists(resolve(runDir, input.expectedRefusalArtifact)),
    true,
    `Expected refusal artifact ${input.expectedRefusalArtifact} in run dir.`
  );

  // 3. .protostar/refusals.jsonl with one parseable entry for this run
  const refusalsIndexPath = resolve(input.outDir, "..", "refusals.jsonl");
  assert.equal(
    await pathExists(refusalsIndexPath),
    true,
    `Expected refusals.jsonl at ${refusalsIndexPath}.`
  );
  const indexContents = await readFile(refusalsIndexPath, "utf8");
  const indexLines = indexContents.split("\n").filter((segment) => segment.length > 0);
  const indexEntries = indexLines.map((line) => JSON.parse(line) as Record<string, unknown>);
  const matching = indexEntries.find((entry) => entry["runId"] === input.runId);
  assert.notEqual(matching, undefined, `Expected refusals.jsonl entry for runId ${input.runId}.`);
  if (matching === undefined) {
    return;
  }
  assert.equal(matching["schemaVersion"], "1.0.0");
  assert.equal(matching["stage"], input.expectedStage);
  assert.equal(typeof matching["timestamp"], "string");
  assert.equal(typeof matching["reason"], "string");
  assert.equal(typeof matching["artifactPath"], "string");
  assert.equal(
    (matching["artifactPath"] as string).endsWith(input.expectedRefusalArtifact),
    true,
    `Expected artifactPath to end with ${input.expectedRefusalArtifact}, got ${String(matching["artifactPath"])}.`
  );
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

async function assertPlanningAdmissionSmokeEvidence(
  runDir: string,
  expectedIntentId: string
): Promise<void> {
  const planningAdmissionPath = resolve(runDir, "planning-admission.json");
  assert.equal(
    await pathExists(planningAdmissionPath),
    true,
    "End-to-end planning attempts must emit planning-admission.json."
  );

  const plan = await readJsonObject(resolve(runDir, "plan.json"));
  const planningAdmission = await readJsonObject(planningAdmissionPath);
  assert.equal(plan["intentId"], expectedIntentId);
  assertThinAcceptedPlanningAdmission(planningAdmission, plan);
}

async function assertPlanningResultIsCandidatePlanSource(runDir: string): Promise<void> {
  const planningResult = await readJsonObject(resolve(runDir, "planning-result.json"));
  assert.equal(planningResult["kind"], "planning-pile-result");
  assert.ok(planningResult["source"] === "fixture" || planningResult["source"] === "dogpile");
  assert.equal(typeof planningResult["output"], "string");

  const planningOutput = parseJsonObject(planningResult["output"] as string);
  for (const forbiddenKey of ["admittedPlan", "handoff", "executionPlan"]) {
    assert.equal(
      Object.hasOwn(planningOutput, forbiddenKey),
      false,
      `Planning pile output must stay candidate-only and must not expose ${forbiddenKey}.`
    );
  }

  const tasks = readObjectArrayProperty(planningOutput, "tasks");
  for (const task of tasks) {
    for (const forbiddenTaskKey of ["readyForExecution", "status", "admittedPlan", "executionPlan"]) {
      assert.equal(
        Object.hasOwn(task, forbiddenTaskKey),
        false,
        `Planning pile task ${String(task["id"])} must not expose ${forbiddenTaskKey}.`
      );
    }

    const requiredCapabilities = readObjectProperty(task, "requiredCapabilities");
    assert.equal(
      Object.hasOwn(requiredCapabilities, "admittedCapabilities"),
      false,
      `Planning pile task ${String(task["id"])} must not expose admittedCapabilities.`
    );
    const budget = readObjectProperty(requiredCapabilities, "budget");
    assert.equal(
      Object.hasOwn(budget, "admitted"),
      false,
      `Planning pile task ${String(task["id"])} must not expose budget.admitted.`
    );
  }
}

async function assertDownstreamArtifactsSuppressed(outDir: string, runId: string): Promise<void> {
  for (const fileName of downstreamArtifactFiles) {
    const outputPath = resolve(outDir, runId, fileName);
    assert.equal(await pathExists(outputPath), false, `Expected downstream artifact ${outputPath} not to be written.`);
  }
}

async function assertExecutionAndReviewArtifactsSuppressed(outDir: string, runId: string): Promise<void> {
  for (const fileName of executionAndReviewArtifactFiles) {
    const outputPath = resolve(outDir, runId, fileName);
    assert.equal(
      await pathExists(outputPath),
      false,
      `Rejected planning candidate must not reach execution artifact ${outputPath}.`
    );
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

function assertStageAppearsBefore(
  stages: readonly Record<string, unknown>[],
  earlierStageName: string,
  laterStageName: string
): void {
  const earlierIndex = stages.findIndex((entry) => entry["stage"] === earlierStageName);
  const laterIndex = stages.findIndex((entry) => entry["stage"] === laterStageName);
  assert.notEqual(earlierIndex, -1, `Expected manifest to include ${earlierStageName} stage.`);
  assert.notEqual(laterIndex, -1, `Expected manifest to include ${laterStageName} stage.`);
  assert.ok(
    earlierIndex < laterIndex,
    `${earlierStageName} stage should appear before ${laterStageName} stage.`
  );
}

function assertSourceOrder(source: string, earlier: string, later: string, message: string): void {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);
  assert.notEqual(earlierIndex, -1, `Missing source anchor: ${earlier}`);
  assert.notEqual(laterIndex, -1, `Missing source anchor: ${later}`);
  assert.ok(earlierIndex < laterIndex, message);
}

function validateAgainstSchema(
  value: unknown,
  schema: Record<string, unknown>,
  rootSchema: Record<string, unknown>,
  pathLabel: string
): void {
  const ref = schema["$ref"];
  if (typeof ref === "string" && ref.startsWith("#/")) {
    const segments = ref.slice(2).split("/");
    let resolved: unknown = rootSchema;
    for (const seg of segments) {
      if (resolved && typeof resolved === "object") {
        resolved = (resolved as Record<string, unknown>)[seg];
      }
    }
    if (resolved && typeof resolved === "object") {
      validateAgainstSchema(value, resolved as Record<string, unknown>, rootSchema, pathLabel);
      return;
    }
  }
  const expectedType = schema["type"];
  if (typeof expectedType === "string") {
    assertJsonTypeInSchema(value, expectedType, pathLabel);
  }
  if ("const" in schema) {
    assert.deepEqual(value, schema["const"], `${pathLabel} const mismatch`);
  }
  if (Array.isArray(schema["enum"])) {
    assert.ok(
      (schema["enum"] as readonly unknown[]).some((candidate) => candidate === value),
      `${pathLabel} not in enum: ${JSON.stringify(value)}`
    );
  }
  if (Array.isArray(schema["pattern"]) || typeof schema["pattern"] === "string") {
    const pattern = schema["pattern"] as string;
    assert.ok(
      typeof value === "string" && new RegExp(pattern).test(value),
      `${pathLabel} does not match pattern ${pattern}: ${JSON.stringify(value)}`
    );
  }
  if (expectedType === "object" && typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const required = Array.isArray(schema["required"]) ? (schema["required"] as readonly string[]) : [];
    for (const key of required) {
      assert.ok(Object.hasOwn(record, key), `${pathLabel}.${key} required but missing`);
    }
    const properties = (schema["properties"] as Record<string, Record<string, unknown>> | undefined) ?? {};
    for (const [key, propSchema] of Object.entries(properties)) {
      if (Object.hasOwn(record, key)) {
        validateAgainstSchema(record[key], propSchema, rootSchema, `${pathLabel}.${key}`);
      }
    }
    if (schema["additionalProperties"] === false) {
      for (const key of Object.keys(record)) {
        if (!Object.hasOwn(properties, key)) {
          assert.fail(`${pathLabel} has unexpected property: ${key}`);
        }
      }
    }
  }
  if (expectedType === "array" && Array.isArray(value)) {
    const itemSchema = schema["items"] as Record<string, unknown> | undefined;
    if (itemSchema !== undefined) {
      value.forEach((item, index) => {
        validateAgainstSchema(item, itemSchema, rootSchema, `${pathLabel}[${index}]`);
      });
    }
  }
}

function assertJsonTypeInSchema(value: unknown, expectedType: string, pathLabel: string): void {
  if (expectedType === "integer") {
    assert.ok(typeof value === "number" && Number.isInteger(value), `${pathLabel} expected integer, got ${JSON.stringify(value)}`);
  } else if (expectedType === "number") {
    assert.ok(typeof value === "number", `${pathLabel} expected number, got ${JSON.stringify(value)}`);
  } else if (expectedType === "string") {
    assert.ok(typeof value === "string", `${pathLabel} expected string, got ${JSON.stringify(value)}`);
  } else if (expectedType === "boolean") {
    assert.ok(typeof value === "boolean", `${pathLabel} expected boolean, got ${JSON.stringify(value)}`);
  } else if (expectedType === "array") {
    assert.ok(Array.isArray(value), `${pathLabel} expected array, got ${JSON.stringify(value)}`);
  } else if (expectedType === "object") {
    assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), `${pathLabel} expected object, got ${JSON.stringify(value)}`);
  }
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
  return runCliWithWorkspace(args, repoRoot);
}

function runCliWithWorkspace(args: readonly string[], workspaceRoot: string): Promise<CliResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      cwd: workspaceRoot,
      env: {
        ...process.env
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
