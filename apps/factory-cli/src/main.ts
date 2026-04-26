#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createFactoryRunManifest, recordStageArtifacts, setFactoryRunStatus } from "@protostar/artifacts";
import { createGitHubPrDeliveryPlan } from "@protostar/delivery";
import {
  buildPlanningMission,
  buildReviewMission
} from "@protostar/dogpile-adapter";
import { createEvaluationReport, decideEvolution, type OntologySnapshot } from "@protostar/evaluation";
import {
  prepareExecutionRun as defaultPrepareExecutionRun,
  type ExecutionDryRunResult
} from "@protostar/execution";
import {
  type IntentAmbiguityAssessment,
  type IntentAmbiguityMode
} from "@protostar/intent/ambiguity";
import {
  CLARIFICATION_REPORT_ARTIFACT_NAME,
  createClarificationReport
} from "@protostar/intent/clarification-report";
import { assertConfirmedIntent, type ConfirmedIntent } from "@protostar/intent/confirmed-intent";
import type { IntentDraft } from "@protostar/intent/draft";
import {
  authorizeFactoryStart,
  promoteIntentDraft
} from "@protostar/policy/admission";
import {
  ADMISSION_DECISION_ARTIFACT_NAME,
  createAdmissionDecisionArtifact,
  type AdmissionDecisionArtifactPayload
} from "@protostar/policy/artifacts";
import {
  admitCandidatePlan,
  admitCandidatePlans,
  assertAdmittedPlanHandoff,
  createPlanningPreAdmissionFailureArtifact,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  type AdmittedPlan,
  type PlanningAdmissionAcceptedArtifactPayload,
  type PlanningAdmissionArtifactPayload,
  type PersistedPlanningAdmissionArtifactRef
} from "@protostar/planning/artifacts";
import {
  assertPlanningPileResult,
  parsePlanningPileResult,
  type CandidatePlanGraph
} from "@protostar/planning/schema";
import { defineWorkspace } from "@protostar/repo";
import {
  runMechanicalReviewExecutionLoop as defaultRunMechanicalReviewExecutionLoop,
  type ReviewVerdict
} from "@protostar/review";

import { createConfirmedIntentHandoff } from "./confirmed-intent-handoff.js";

export interface RunCommandOptions {
  readonly intentPath?: string;
  readonly intentDraftPath?: string;
  readonly confirmedIntentOutputPath?: string;
  readonly outDir: string;
  readonly planningFixturePath: string;
  readonly failTaskIds: readonly string[];
  readonly intentMode: IntentAmbiguityMode;
  readonly runId?: string;
}

export interface RunCommandResult {
  readonly runId: string;
  readonly runDir: string;
  readonly intent: ConfirmedIntent;
  readonly artifacts: readonly string[];
}

export interface FactoryCompositionDependencies {
  readonly prepareExecutionRun: typeof defaultPrepareExecutionRun;
  readonly runMechanicalReviewExecutionLoop: typeof defaultRunMechanicalReviewExecutionLoop;
}

interface AdmittedPlanningOutput {
  readonly admittedPlan: AdmittedPlan;
  readonly planningAdmission: PlanningAdmissionAcceptedArtifactPayload;
  readonly planningAdmissionArtifact: PersistedPlanningAdmissionArtifactRef;
}

interface IntentAmbiguityArtifact {
  readonly schemaVersion: "protostar.intent.ambiguity.v1";
  readonly artifact: "intent-ambiguity.json";
  readonly mode: IntentAmbiguityAssessment["mode"];
  readonly threshold: number;
  readonly ambiguity: number;
  readonly accepted: boolean;
  readonly thresholdResult: {
    readonly passed: boolean;
    readonly withinThreshold: boolean;
    readonly threshold: number;
    readonly ambiguity: number;
    readonly structurallyMissingAutoFail: boolean;
    readonly structurallyMissingDimensions: IntentAmbiguityAssessment["structurallyMissingDimensions"];
  };
  readonly scoringEvidence: {
    readonly weightingProfile: IntentAmbiguityAssessment["weightingProfile"];
    readonly dimensionScores: IntentAmbiguityAssessment["dimensionScores"];
    readonly missingFields: IntentAmbiguityAssessment["missingFields"];
    readonly requiredClarifications: IntentAmbiguityAssessment["requiredClarifications"];
  };
  readonly assessment: IntentAmbiguityAssessment;
}

const defaultFactoryCompositionDependencies = {
  prepareExecutionRun: defaultPrepareExecutionRun,
  runMechanicalReviewExecutionLoop: defaultRunMechanicalReviewExecutionLoop
} as const satisfies FactoryCompositionDependencies;

const CONFIRMED_INTENT_OUTPUT_FILE_NAMES = ["confirmed-intent.json", "intent.json"] as const;

async function main(): Promise<void> {
  const command = parseArgs(process.argv.slice(2));

  if (command.type === "help") {
    console.log(helpText());
    return;
  }

  if (command.type === "error") {
    console.error(command.message);
    console.error("");
    console.error(helpText());
    process.exitCode = 1;
    return;
  }

  const result = await runFactory(command.options);
  console.log(JSON.stringify(result.intent, null, 2));
}

export async function runFactory(
  options: RunCommandOptions,
  dependencyOverrides: Partial<FactoryCompositionDependencies> = {}
): Promise<RunCommandResult> {
  const dependencies = {
    ...defaultFactoryCompositionDependencies,
    ...dependencyOverrides
  };
  const workspaceRoot = process.env["INIT_CWD"] ?? process.cwd();
  const intentPath = resolve(workspaceRoot, options.intentDraftPath ?? options.intentPath ?? "");
  const outDir = resolve(workspaceRoot, options.outDir);
  const confirmedIntentOutputPath = options.confirmedIntentOutputPath === undefined
    ? undefined
    : resolve(workspaceRoot, options.confirmedIntentOutputPath);
  const parsedIntentInput = JSON.parse(await readFile(intentPath, "utf8"));
  const capturedIntentDraftBeforeAdmission = options.intentDraftPath === undefined
    ? undefined
    : captureMutableIntentDraft(parsedIntentInput);
  const clarificationReport = capturedIntentDraftBeforeAdmission === undefined
    ? undefined
    : createClarificationReport({
        draft: capturedIntentDraftBeforeAdmission,
        mode: options.intentMode
      });
  const promotedIntent = capturedIntentDraftBeforeAdmission === undefined
    ? undefined
    : promoteIntentDraft({
        draft: capturedIntentDraftBeforeAdmission,
        mode: options.intentMode
      });
  const admissionDecision = promotedIntent === undefined
    ? undefined
    : createAdmissionDecisionArtifact({
        ...(capturedIntentDraftBeforeAdmission !== undefined ? { draft: capturedIntentDraftBeforeAdmission } : {}),
        promotion: promotedIntent
      });
  const archetypeSuggestion = promotedIntent?.archetypeSuggestion;
  const runId = options.runId ??
    (promotedIntent?.ok === true
      ? createRunId(promotedIntent.intent.id)
      : capturedIntentDraftBeforeAdmission === undefined
        ? createRunId(assertConfirmedIntent(parsedIntentInput).id)
        : createDraftRunId(capturedIntentDraftBeforeAdmission));
  const runDir = resolve(outDir, runId);
  if (admissionDecision !== undefined) {
    await writeAdmissionDecisionArtifact(runDir, admissionDecision);
  }
  if (promotedIntent !== undefined && !promotedIntent.ok) {
    throw new Error(formatPromotionFailure(promotedIntent));
  }

  const confirmedIntentHandoff = createConfirmedIntentHandoff({
    parsedIntentInput,
    intentMode: options.intentMode,
    ...(promotedIntent !== undefined ? { promotedIntent } : {})
  });
  const intent = confirmedIntentHandoff.intent;
  const ambiguityAssessment = confirmedIntentHandoff.ambiguityAssessment;
  const planningFixturePath = resolve(workspaceRoot, options.planningFixturePath);

  const policyVerdict = authorizeFactoryStart(intent, {
    allowDarkRun: true,
    maxAutonomousRisk: "medium",
    requiredHumanCheckpoints: []
  });

  if (policyVerdict.type !== "allow") {
    throw new Error(`Factory run refused by policy: ${policyVerdict.rationale}`);
  }

  const manifest = createFactoryRunManifest({
    runId,
    intentId: intent.id
  });
  const planningMission = buildPlanningMission(intent);
  const candidatePlanId = `plan_${runId}`;
  const planningFixtureInput = await readPlanningFixtureInput(planningFixturePath);
  if (!planningFixtureInput.ok) {
    return await blockPlanningPreAdmission({
      runDir,
      intent,
      candidatePlanId,
      errors: [planningFixtureInput.error],
      planningMission: planningMission.intent
    });
  }
  const planningPileResultInput = planningFixtureInput.value;
  const planningPileResultAdmission = parsePlanningPileResultInputs(planningPileResultInput);
  if (!planningPileResultAdmission.ok) {
    return await blockPlanningPreAdmission({
      runDir,
      intent,
      candidatePlanId,
      errors: planningPileResultAdmission.errors,
      planningMission: planningMission.intent,
      planningPileResult: planningPileResultInput
    });
  }
  const planningPileResults = planningPileResultAdmission.results;
  const parsedCandidatePlans = parseCandidatePlansFromPlanningPileResults(planningPileResults, {
    intent,
    defaultPlanId: candidatePlanId
  });
  if (!parsedCandidatePlans.ok) {
    return await blockPlanningPreAdmission({
      runDir,
      intent,
      candidatePlanId,
      errors: parsedCandidatePlans.errors,
      planningMission: planningMission.intent,
      planningPileResult: planningPileResultInput
    });
  }
  const planningPileResult = planningPileResults.length === 1
    ? planningPileResults[0] ?? planningPileResultInput
    : planningPileResults;
  const candidatePlans = parsedCandidatePlans.candidatePlans;
  const firstCandidatePlan = candidatePlans[0];
  if (firstCandidatePlan === undefined) {
    return await blockPlanningPreAdmission({
      runDir,
      intent,
      candidatePlanId,
      errors: ["Planning admission requires at least one candidate plan."],
      planningMission: planningMission.intent,
      planningPileResult: planningPileResultInput
    });
  }
  const candidateAdmission = candidatePlans.length === 1
    ? admitCandidatePlan({
        graph: firstCandidatePlan,
        intent,
        planGraphUri: "plan.json"
      })
    : admitCandidatePlans({
        candidatePlans,
        intent,
        planGraphUri: "plan.json"
      });
  const planningAdmission = candidateAdmission.planningAdmission;
  const planningAdmissionArtifact = await writePlanningAdmissionArtifacts({
    runDir,
    ...(candidateAdmission.ok ? { plan: candidateAdmission.admittedPlan } : {}),
    planningAdmission,
    ...(candidateAdmission.ok ? {} : { planningPileResult })
  });
  const persistedPlanningAdmission = await readPersistedPlanningAdmissionArtifact(runDir);
  if (!candidateAdmission.ok) {
    throw new Error(`Planning admission rejected plan graph: ${candidateAdmission.errors.join("; ")}`);
  }
  assertAcceptedPlanningAdmissionArtifact(persistedPlanningAdmission);
  const admittedPlan = candidateAdmission.admittedPlan;
  const admittedPlanningOutput: AdmittedPlanningOutput = {
    admittedPlan,
    planningAdmission: persistedPlanningAdmission,
    planningAdmissionArtifact
  };
  const admittedPlanHandoff = assertAdmittedPlanHandoff({
    plan: admittedPlanningOutput.admittedPlan,
    planningAdmission: admittedPlanningOutput.planningAdmission,
    planningAdmissionArtifact: admittedPlanningOutput.planningAdmissionArtifact,
    planGraphUri: "plan.json"
  });
  const workspace = defineWorkspace({
    root: workspaceRoot,
    trust: "trusted",
    defaultBranch: "main"
  });
  const execution = dependencies.prepareExecutionRun({
    runId: manifest.runId,
    admittedPlan: admittedPlanHandoff.executionArtifact,
    workspace
  });
  const loop = dependencies.runMechanicalReviewExecutionLoop({
    admittedPlan: admittedPlanHandoff.executionArtifact,
    execution,
    initialFailTaskIds: options.failTaskIds,
    maxRepairLoops: intent.capabilityEnvelope.budget.maxRepairLoops ?? 0
  });
  const executionResult = loop.finalExecutionResult;
  const review = loop.finalReviewGate;
  const evaluationReport = createEvaluationReport({
    runId,
    reviewGate: review
  });
  const evolutionDecision = decideEvolution({
    previous: createIntentOntologySnapshot(intent),
    current: createPlanOntologySnapshot(admittedPlanHandoff.plan)
  });
  const deliveryPlan = createGitHubPrDeliveryPlan({
    runId,
    reviewGate: review,
    title: intent.title
  });
  const reviewMission = buildReviewMission(intent, admittedPlanningOutput.planningAdmission);
  const startedAt = new Date().toISOString();
  const finalManifest = [
    {
      stage: "intent" as const,
      status: "passed" as const,
      artifacts: [
        ...(capturedIntentDraftBeforeAdmission === undefined
          ? []
          : [
              artifact(
                "intent",
                "intent-draft",
                "intent-draft.json",
                "Captured mutable draft input before clarification or admission mutation."
              )
            ]),
        ...(clarificationReport === undefined
          ? []
          : [
              artifact(
                "intent",
                "clarification-report",
                CLARIFICATION_REPORT_ARTIFACT_NAME,
                "Deterministic clarification questions and unresolved draft issues."
              )
            ]),
        ...(admissionDecision === undefined
          ? []
          : [
              artifact(
                "intent",
                "admission-decision",
                ADMISSION_DECISION_ARTIFACT_NAME,
                "Deterministic draft admission allow/block/escalate decision and gate details."
              )
            ]),
        artifact("intent", "confirmed-intent", "intent.json", "Normalized confirmed intent input."),
        artifact("intent", "intent-ambiguity", "intent-ambiguity.json", "Ouroboros-style intent ambiguity assessment."),
        ...(archetypeSuggestion === undefined
          ? []
          : [
              artifact(
                "intent",
                "intent-archetype-suggestion",
                "intent-archetype-suggestion.json",
                "Deterministic draft archetype suggestion and confidence score."
              )
            ])
      ]
    },
    {
      stage: "planning" as const,
      status: "passed" as const,
      artifacts: [
        artifact("planning", "pile-mission", "planning-mission.txt", "Model-visible planning pile mission."),
        artifact(
          "planning",
          "candidate-plan-source",
          "planning-result.json",
          "Raw candidate-plan source returned by the planning pile before admission."
        ),
        artifact(
          "planning",
          "plan-graph",
          "plan.json",
          "Admitted PlanGraph written only after planning-admission.json allows the candidate plan."
        ),
        artifact(
          "planning",
          "planning-admission",
          PLANNING_ADMISSION_ARTIFACT_NAME,
          "Plan admission decision and thin per-AC coverage evidence."
        )
      ]
    },
    {
      stage: "execution" as const,
      status: executionResult.status === "passed" ? ("passed" as const) : ("failed" as const),
      artifacts: [
        artifact("execution", "execution-plan", "execution-plan.json", "Execution task ordering derived from the plan graph."),
        artifact("execution", "execution-events", "execution-events.json", "Dry-run execution lifecycle events."),
        artifact("execution", "execution-result", "execution-result.json", "Dry-run execution result."),
        artifact("execution", "review-execution-loop", "review-execution-loop.json", "Review-execute-review loop transcript."),
        ...executionResult.evidence
      ]
    },
    {
      stage: "review" as const,
      status: review.verdict === "pass" ? ("passed" as const) : ("failed" as const),
      artifacts: [
        artifact("review", "pile-mission", "review-mission.txt", "Model-visible review pile mission."),
        artifact("review", "review-gate", "review-gate.json", "Mechanical review verdict and findings."),
        artifact("review", "evaluation-report", "evaluation-report.json", "Three-stage evaluation report stub."),
        artifact("review", "evolution-decision", "evolution-decision.json", "Ontology convergence decision stub.")
      ]
    },
    {
      stage: "release" as const,
      status: deliveryPlan.status === "ready" ? ("passed" as const) : ("skipped" as const),
      artifacts: deliveryPlan.artifacts
    }
  ].reduce(
    (current, stage) =>
      recordStageArtifacts(current, {
        ...stage,
        startedAt,
        ...(stage.status === "passed" || stage.status === "failed" || stage.status === "skipped"
          ? { completedAt: startedAt }
          : {})
      }),
    manifest
  );
  const reviewedManifest = setFactoryRunStatus(finalManifest, statusForReviewVerdict(review.verdict));

  await mkdir(runDir, { recursive: true });
  if (capturedIntentDraftBeforeAdmission !== undefined) {
    await writeDraftAdmissionArtifacts({
      runDir,
      draft: capturedIntentDraftBeforeAdmission,
      clarificationReport,
      admissionDecision,
      ambiguityAssessment: promotedIntent?.ambiguityAssessment,
      archetypeSuggestion
    });
  }
  await mkdir(resolve(runDir, "delivery"), { recursive: true });
  await writeJson(resolve(runDir, "intent.json"), intent);
  if (confirmedIntentOutputPath !== undefined) {
    await writeConfirmedIntentOutput(confirmedIntentOutputPath, intent);
  }
  await writeJson(resolve(runDir, "intent-ambiguity.json"), createIntentAmbiguityArtifact(ambiguityAssessment));
  await writeJson(resolve(runDir, "manifest.json"), reviewedManifest);
  await writeFile(resolve(runDir, "planning-mission.txt"), `${planningMission.intent}\n`, "utf8");
  await writeFile(resolve(runDir, "review-mission.txt"), `${reviewMission.intent}\n`, "utf8");
  await writeJson(resolve(runDir, "planning-result.json"), planningPileResult);
  await writeJson(resolve(runDir, PLANNING_ADMISSION_ARTIFACT_NAME), admittedPlanningOutput.planningAdmission);
  await writeJson(resolve(runDir, "plan.json"), admittedPlan);
  await writeJson(resolve(runDir, "execution-plan.json"), execution);
  await writeJson(resolve(runDir, "execution-events.json"), executionResult.events);
  await writeJson(resolve(runDir, "execution-result.json"), executionResult);
  await writeJson(resolve(runDir, "review-execution-loop.json"), loop);
  await writeExecutionEvidence(runDir, executionResult);
  await writeJson(resolve(runDir, "review-gate.json"), review);
  await writeJson(resolve(runDir, "evaluation-report.json"), evaluationReport);
  await writeJson(resolve(runDir, "evolution-decision.json"), evolutionDecision);
  await writeJson(resolve(runDir, "delivery-plan.json"), deliveryPlan);
  await writeFile(resolve(runDir, "delivery/pr-body.md"), `${deliveryPlan.body}\n`, "utf8");

  return {
    runId,
    runDir,
    intent,
    artifacts: [
      ...(capturedIntentDraftBeforeAdmission === undefined ? [] : ["intent-draft.json"]),
      ...(clarificationReport === undefined ? [] : [CLARIFICATION_REPORT_ARTIFACT_NAME]),
      ...(admissionDecision === undefined ? [] : [ADMISSION_DECISION_ARTIFACT_NAME]),
      "intent.json",
      "intent-ambiguity.json",
      ...(archetypeSuggestion === undefined ? [] : ["intent-archetype-suggestion.json"]),
      "manifest.json",
      "planning-mission.txt",
      "planning-result.json",
      "review-mission.txt",
      "plan.json",
      PLANNING_ADMISSION_ARTIFACT_NAME,
      "execution-plan.json",
      "execution-events.json",
      "execution-result.json",
      "review-execution-loop.json",
      ...executionResult.evidence.map((ref) => ref.uri),
      "review-gate.json",
      "evaluation-report.json",
      "evolution-decision.json",
      "delivery-plan.json",
      "delivery/pr-body.md"
    ]
  };
}

function createIntentOntologySnapshot(intent: ConfirmedIntent): OntologySnapshot {
  return {
    generation: 0,
    fields: intent.acceptanceCriteria.map((criterion) => ({
      name: criterion.id,
      type: criterion.verification,
      description: criterion.statement
    }))
  };
}

function createPlanOntologySnapshot(plan: AdmittedPlan): OntologySnapshot {
  return {
    generation: 1,
    fields: plan.tasks.flatMap((task) =>
      task.covers.map((criterionId) => ({
        name: criterionId,
        type: task.kind,
        description: task.title
      }))
    )
  };
}

function artifact(
  stage: Parameters<typeof recordStageArtifacts>[1]["stage"],
  kind: string,
  uri: string,
  description: string
) {
  return {
    stage,
    kind,
    uri,
    description
  };
}

function statusForReviewVerdict(verdict: ReviewVerdict) {
  if (verdict === "pass") {
    return "ready-to-release";
  }
  if (verdict === "repair") {
    return "repairing";
  }
  return "blocked";
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function writeConfirmedIntentOutput(path: string, intent: ConfirmedIntent): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeJson(path, intent);
}

function captureMutableIntentDraft(value: unknown): IntentDraft {
  return structuredClone(value) as IntentDraft;
}

async function writeDraftAdmissionArtifacts(input: {
  readonly runDir: string;
  readonly draft: IntentDraft;
  readonly clarificationReport: ReturnType<typeof createClarificationReport> | undefined;
  readonly admissionDecision: AdmissionDecisionArtifactPayload | undefined;
  readonly ambiguityAssessment: IntentAmbiguityAssessment | undefined;
  readonly archetypeSuggestion: ReturnType<typeof promoteIntentDraft>["archetypeSuggestion"] | undefined;
}): Promise<void> {
  await mkdir(input.runDir, { recursive: true });
  await writeJson(resolve(input.runDir, "intent-draft.json"), input.draft);
  if (input.clarificationReport !== undefined) {
    await writeJson(resolve(input.runDir, CLARIFICATION_REPORT_ARTIFACT_NAME), input.clarificationReport);
  }
  if (input.admissionDecision !== undefined) {
    await writeJson(resolve(input.runDir, ADMISSION_DECISION_ARTIFACT_NAME), input.admissionDecision);
  }
  if (input.ambiguityAssessment !== undefined) {
    await writeJson(resolve(input.runDir, "intent-ambiguity.json"), createIntentAmbiguityArtifact(input.ambiguityAssessment));
  }
  if (input.archetypeSuggestion !== undefined) {
    await writeJson(resolve(input.runDir, "intent-archetype-suggestion.json"), input.archetypeSuggestion);
  }
}

async function writeAdmissionDecisionArtifact(
  runDir: string,
  admissionDecision: AdmissionDecisionArtifactPayload
): Promise<void> {
  await mkdir(runDir, { recursive: true });
  await writeJson(resolve(runDir, ADMISSION_DECISION_ARTIFACT_NAME), admissionDecision);
}

async function writePlanningAdmissionArtifacts(input: {
  readonly runDir: string;
  readonly plan?: AdmittedPlan;
  readonly planningAdmission: PlanningAdmissionArtifactPayload;
  readonly planningPileResult?: unknown;
}): Promise<PersistedPlanningAdmissionArtifactRef> {
  await mkdir(input.runDir, { recursive: true });
  await writeJson(resolve(input.runDir, PLANNING_ADMISSION_ARTIFACT_NAME), input.planningAdmission);
  if (input.planningPileResult !== undefined) {
    await writeJson(resolve(input.runDir, "planning-result.json"), input.planningPileResult);
  }
  if (input.planningAdmission.admitted) {
    if (input.plan === undefined) {
      throw new Error("Planning admission allowed a candidate plan without returning an admitted plan.");
    }
    await writeJson(resolve(input.runDir, "plan.json"), input.plan);
  }

  return {
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    uri: PLANNING_ADMISSION_ARTIFACT_NAME,
    persisted: true
  };
}

async function readPersistedPlanningAdmissionArtifact(
  runDir: string
): Promise<PlanningAdmissionArtifactPayload> {
  const payload = JSON.parse(
    await readFile(resolve(runDir, PLANNING_ADMISSION_ARTIFACT_NAME), "utf8")
  ) as unknown;

  assertPlanningAdmissionArtifactPayload(payload);
  return payload;
}

function assertPlanningAdmissionArtifactPayload(
  value: unknown
): asserts value is PlanningAdmissionArtifactPayload {
  if (!isJsonObject(value)) {
    throw new Error(`${PLANNING_ADMISSION_ARTIFACT_NAME} must contain a JSON object.`);
  }

  const errors: string[] = [];
  requireArtifactString(value, "schemaVersion", PLANNING_ADMISSION_SCHEMA_VERSION, errors);
  requireArtifactString(value, "artifact", PLANNING_ADMISSION_ARTIFACT_NAME, errors);
  requireArtifactString(value, "planId", undefined, errors);
  requireArtifactString(value, "intentId", undefined, errors);

  if (value["decision"] !== "allow" && value["decision"] !== "block") {
    errors.push(`${PLANNING_ADMISSION_ARTIFACT_NAME}.decision must be allow or block.`);
  }

  if (value["admissionStatus"] !== "plan-admitted" && value["admissionStatus"] !== "no-plan-admitted") {
    errors.push(`${PLANNING_ADMISSION_ARTIFACT_NAME}.admissionStatus must be plan-admitted or no-plan-admitted.`);
  }

  if (typeof value["admitted"] !== "boolean") {
    errors.push(`${PLANNING_ADMISSION_ARTIFACT_NAME}.admitted must be a boolean.`);
  }

  if (!Array.isArray(value["errors"])) {
    errors.push(`${PLANNING_ADMISSION_ARTIFACT_NAME}.errors must be an array.`);
  }

  if (errors.length > 0) {
    throw new Error(`Invalid ${PLANNING_ADMISSION_ARTIFACT_NAME}: ${errors.join("; ")}`);
  }
}

function assertAcceptedPlanningAdmissionArtifact(
  value: PlanningAdmissionArtifactPayload
): asserts value is PlanningAdmissionAcceptedArtifactPayload {
  if (
    value.decision !== "allow" ||
    value.admissionStatus !== "plan-admitted" ||
    value.admitted !== true
  ) {
    throw new Error(`${PLANNING_ADMISSION_ARTIFACT_NAME} must contain an accepted planning admission before review.`);
  }
}

function requireArtifactString(
  record: Record<string, unknown>,
  key: string,
  expected: string | undefined,
  errors: string[]
): void {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${PLANNING_ADMISSION_ARTIFACT_NAME}.${key} must be a non-empty string.`);
    return;
  }

  if (expected !== undefined && value !== expected) {
    errors.push(`${PLANNING_ADMISSION_ARTIFACT_NAME}.${key} must be ${expected}.`);
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function blockPlanningPreAdmission(input: {
  readonly runDir: string;
  readonly intent: ConfirmedIntent;
  readonly candidatePlanId: string;
  readonly errors: readonly string[];
  readonly planningMission: string;
  readonly planningPileResult?: unknown;
}): Promise<never> {
  const planningAdmission = createPlanningPreAdmissionFailureArtifact({
    intent: input.intent,
    candidatePlanId: input.candidatePlanId,
    errors: input.errors,
    candidateSourceUri: "planning-result.json"
  });

  await writePlanningPreAdmissionFailureArtifacts({
    runDir: input.runDir,
    planningAdmission,
    planningMission: input.planningMission,
    ...(input.planningPileResult !== undefined ? { planningPileResult: input.planningPileResult } : {})
  });

  throw new Error(formatPlanningPreAdmissionFailure(planningAdmission));
}

async function writePlanningPreAdmissionFailureArtifacts(input: {
  readonly runDir: string;
  readonly planningAdmission: ReturnType<typeof createPlanningPreAdmissionFailureArtifact>;
  readonly planningMission: string;
  readonly planningPileResult?: unknown;
}): Promise<PersistedPlanningAdmissionArtifactRef> {
  await mkdir(input.runDir, { recursive: true });
  await writeJson(resolve(input.runDir, PLANNING_ADMISSION_ARTIFACT_NAME), input.planningAdmission);
  await writeFile(resolve(input.runDir, "planning-mission.txt"), `${input.planningMission}\n`, "utf8");
  if (input.planningPileResult !== undefined) {
    await writeJson(resolve(input.runDir, "planning-result.json"), input.planningPileResult);
  }

  return {
    artifact: PLANNING_ADMISSION_ARTIFACT_NAME,
    uri: PLANNING_ADMISSION_ARTIFACT_NAME,
    persisted: true
  };
}

async function readPlanningFixtureInput(path: string): Promise<
  | {
      readonly ok: true;
      readonly value: unknown;
    }
  | {
      readonly ok: false;
      readonly error: string;
    }
> {
  try {
    return {
      ok: true,
      value: JSON.parse(await readFile(path, "utf8")) as unknown
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error: `Unable to read planning result fixture: ${formatUnknownError(error)}`
    };
  }
}

function parsePlanningPileResultInputs(value: unknown):
  | {
      readonly ok: true;
      readonly results: readonly ReturnType<typeof assertPlanningPileResult>[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    } {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return {
        ok: false,
        errors: ["Planning fixture must contain at least one planning-pile-result."]
      };
    }

    const results: ReturnType<typeof assertPlanningPileResult>[] = [];
    const errors: string[] = [];
    for (const [index, entry] of value.entries()) {
      try {
        results.push(assertPlanningPileResult(entry));
      } catch (error: unknown) {
        errors.push(`planningResults.${index}: ${formatUnknownError(error)}`);
      }
    }

    return errors.length === 0
      ? {
          ok: true,
          results
        }
      : {
          ok: false,
          errors
        };
  }

  try {
    return {
      ok: true,
      results: [assertPlanningPileResult(value)]
    };
  } catch (error: unknown) {
    return {
      ok: false,
      errors: [formatUnknownError(error)]
    };
  }
}

function parseCandidatePlansFromPlanningPileResults(
  results: readonly ReturnType<typeof assertPlanningPileResult>[],
  context: {
    readonly intent: ConfirmedIntent;
    readonly defaultPlanId: string;
  }
):
  | {
      readonly ok: true;
      readonly candidatePlans: readonly CandidatePlanGraph[];
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    } {
  const candidatePlans: CandidatePlanGraph[] = [];
  const errors: string[] = [];
  const multipleCandidates = results.length > 1;

  for (const [index, result] of results.entries()) {
    const parsedCandidatePlan = parsePlanningPileResult(result, {
      intent: context.intent,
      defaultPlanId: multipleCandidates
        ? `${context.defaultPlanId}_candidate_${index + 1}`
        : context.defaultPlanId
    });

    if (parsedCandidatePlan.ok) {
      candidatePlans.push(parsedCandidatePlan.candidatePlan);
    } else {
      errors.push(
        ...parsedCandidatePlan.errors.map((error) =>
          multipleCandidates ? `planningResults.${index}.output: ${error}` : error
        )
      );
    }
  }

  return errors.length === 0
    ? {
        ok: true,
        candidatePlans
      }
    : {
        ok: false,
        errors
      };
}

function formatPlanningPreAdmissionFailure(
  planningAdmission: ReturnType<typeof createPlanningPreAdmissionFailureArtifact>
): string {
  return `Planning admission failed before candidate PlanGraph admission: ${planningAdmission.errors.join("; ")}`;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createIntentAmbiguityArtifact(assessment: IntentAmbiguityAssessment): IntentAmbiguityArtifact {
  const withinThreshold = assessment.ambiguity <= assessment.threshold;

  return {
    schemaVersion: "protostar.intent.ambiguity.v1",
    artifact: "intent-ambiguity.json",
    mode: assessment.mode,
    threshold: assessment.threshold,
    ambiguity: assessment.ambiguity,
    accepted: assessment.accepted,
    thresholdResult: {
      passed: assessment.accepted,
      withinThreshold,
      threshold: assessment.threshold,
      ambiguity: assessment.ambiguity,
      structurallyMissingAutoFail: assessment.structurallyMissingDimensions.length > 0,
      structurallyMissingDimensions: assessment.structurallyMissingDimensions
    },
    scoringEvidence: {
      weightingProfile: assessment.weightingProfile,
      dimensionScores: assessment.dimensionScores,
      missingFields: assessment.missingFields,
      requiredClarifications: assessment.requiredClarifications
    },
    assessment
  };
}

async function writeExecutionEvidence(runDir: string, result: ExecutionDryRunResult): Promise<void> {
  const evidenceDir = resolve(runDir, "execution-evidence");
  await mkdir(evidenceDir, { recursive: true });
  await Promise.all(
    result.tasks.flatMap((task) =>
      task.evidence.map((ref) =>
        writeJson(resolve(runDir, ref.uri), {
          planTaskId: task.planTaskId,
          status: task.status,
          reason: task.reason ?? null,
          blockedBy: task.blockedBy ?? [],
          evidence: ref
        })
      )
    )
  );
}

function createRunId(intentId: string): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const intentSuffix = intentId.replace(/^intent_/, "").replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 48);
  return `run_${timestamp}_${intentSuffix}`;
}

function createDraftRunId(draft: IntentDraft): string {
  const draftSource = draft.draftId ?? draft.title ?? "intent_draft";
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const draftSuffix = draftSource.replace(/^draft_/, "").replace(/[^a-zA-Z0-9_]+/g, "_").slice(0, 48);
  return `run_${timestamp}_${draftSuffix}`;
}

type ParsedArgs =
  | {
      readonly type: "run";
      readonly options: RunCommandOptions;
    }
  | {
      readonly type: "help";
    }
  | {
      readonly type: "error";
      readonly message: string;
    };

function parseArgs(args: readonly string[]): ParsedArgs {
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  const [command, ...rest] = normalizedArgs;

  if (command === undefined || command === "help" || command === "--help" || command === "-h") {
    return { type: "help" };
  }

  if (command !== "run") {
    return {
      type: "error",
      message: `Unknown command: ${command}`
    };
  }

  const flags = parseFlags(rest);
  if (typeof flags === "string") {
    return {
      type: "error",
      message: flags
    };
  }

  const draftPath = flags.intentDraft ?? flags.draft;
  if (!flags.intent && !draftPath) {
    return {
      type: "error",
      message: "Missing required --intent <path>, --intent-draft <path>, or --draft <path>."
    };
  }
  if (flags.intent && draftPath) {
    return {
      type: "error",
      message: "Use either --intent <path> or a draft path, not both."
    };
  }
  if (!flags.out) {
    return {
      type: "error",
      message: "Missing required --out <dir>."
    };
  }
  const intentMode = parseIntentMode(flags.intentMode);
  if (!intentMode.ok) {
    return {
      type: "error",
      message: intentMode.error
    };
  }
  const confirmedIntentOutputPath = flags.confirmedIntentOutput ?? flags.intentOutput;
  const confirmedIntentOutputPathValidation = validateConfirmedIntentOutputPath(confirmedIntentOutputPath);
  if (!confirmedIntentOutputPathValidation.ok) {
    return {
      type: "error",
      message: confirmedIntentOutputPathValidation.error
    };
  }

  const intentSource = flags.intent !== undefined
    ? { intentPath: flags.intent }
    : { intentDraftPath: draftPath as string };

  return {
    type: "run",
    options: {
      ...intentSource,
      outDir: flags.out,
      planningFixturePath: flags.planningFixture ?? "examples/planning-results/scaffold.json",
      failTaskIds: parseFailTaskIds(flags.failTaskIds),
      intentMode: intentMode.mode,
      ...(confirmedIntentOutputPathValidation.path !== undefined
        ? { confirmedIntentOutputPath: confirmedIntentOutputPathValidation.path }
        : {}),
      ...(flags.runId !== undefined ? { runId: flags.runId } : {})
    }
  };
}

function validateConfirmedIntentOutputPath(value: string | undefined):
  | {
      readonly ok: true;
      readonly path?: string;
    }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  if (value === undefined) {
    return { ok: true };
  }

  const fileName = basename(value);
  if (CONFIRMED_INTENT_OUTPUT_FILE_NAMES.includes(fileName as (typeof CONFIRMED_INTENT_OUTPUT_FILE_NAMES)[number])) {
    return {
      ok: true,
      path: value
    };
  }

  return {
    ok: false,
    error:
      "--confirmed-intent-output must point to confirmed-intent.json or intent.json so draft hardening cannot write ambiguous output files."
  };
}

function formatPromotionFailure(result: ReturnType<typeof promoteIntentDraft>): string {
  if (result.ok) {
    return "Draft intent promotion unexpectedly succeeded.";
  }

  const missingFieldDetections = result.missingFieldDetections.map(
    (detection) => `${detection.fieldPath}: ${detection.message}`
  );
  const hardZeroReasons = result.hardZeroReasons.map((reason) => `${reason.fieldPath}: ${reason.message}`);
  const requiredClarifications = result.requiredClarifications.map(
    (clarification) => `${clarification.fieldPath}: ${clarification.prompt}`
  );
  const policyFindings = result.policyFindings.map((finding) => {
    const affectedAcIds = finding.affectedAcceptanceCriterionIds?.join(", ");
    const affectedAcSuffix = affectedAcIds === undefined ? "" : ` affected ACs: ${affectedAcIds}.`;

    return `${finding.code}: ${finding.fieldPath}: ${finding.message}${affectedAcSuffix}`;
  });
  const archetypeSuggestion =
    `Suggested goalArchetype: ${result.archetypeSuggestion.archetype} ` +
    `(confidence ${result.archetypeSuggestion.confidence.toFixed(3)}).`;
  return [
    "Draft intent refused by admission gate.",
    `Failure state: ${result.failureState}.`,
    `ConfirmedIntent created: ${result.failureDetails.confirmedIntentCreated ? "yes" : "no"}.`,
    archetypeSuggestion,
    ...result.errors,
    ...(policyFindings.length > 0 ? ["Policy findings:", ...policyFindings] : []),
    ...(hardZeroReasons.length > 0 ? ["Hard-zero reasons:", ...hardZeroReasons] : []),
    ...(missingFieldDetections.length > 0 ? ["Missing field detections:", ...missingFieldDetections] : []),
    ...(requiredClarifications.length > 0 ? ["Required clarifications:", ...requiredClarifications] : [])
  ].join(" ");
}

function parseFlags(args: readonly string[]): Record<string, string | undefined> | string {
  const flags: Record<string, string | undefined> = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      return `Unexpected positional argument: ${arg}`;
    }

    const name = flagName(arg);
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      return `Missing value for ${arg}.`;
    }
    flags[name] = value;
    index += 1;
  }

  return flags;
}

function flagName(flag: string): string {
  return flag.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function parseFailTaskIds(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim().length === 0) {
    return [];
  }
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function parseIntentMode(value: string | undefined):
  | {
      readonly ok: true;
      readonly mode: IntentAmbiguityMode;
    }
  | {
      readonly ok: false;
      readonly error: string;
    } {
  if (value === undefined) {
    return {
      ok: true,
      mode: "brownfield"
    };
  }
  if (value === "greenfield" || value === "brownfield") {
    return {
      ok: true,
      mode: value
    };
  }
  return {
    ok: false,
    error: "--intent-mode must be greenfield or brownfield."
  };
}

function helpText(): string {
  const executable = basename(process.argv[1] ?? "protostar-factory");
  return [
    "Protostar Factory",
    "",
    "Commands:",
    `  ${executable} run (--intent <path> | --intent-draft <path> | --draft <path>) --out <dir> [--confirmed-intent-output <confirmed-intent.json|intent.json>] [--planning-fixture <path>] [--intent-mode <mode>] [--fail-task-ids <ids>] [--run-id <id>]`,
    "",
    "Example:",
    `  ${executable} run --draft examples/intents/scaffold.draft.json --out .protostar/runs --planning-fixture examples/planning-results/scaffold.json`
  ].join("\n");
}

function isCliEntrypoint(): boolean {
  const entrypoint = process.argv[1];
  return entrypoint !== undefined && resolve(entrypoint) === fileURLToPath(import.meta.url);
}

if (isCliEntrypoint()) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
