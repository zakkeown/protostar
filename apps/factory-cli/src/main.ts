#!/usr/bin/env node

import * as nodeFs from "node:fs";
import * as fsPromises from "node:fs/promises";
import { appendFile, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createFactoryRunManifest, recordStageArtifacts, setFactoryRunStatus, type StageArtifactRef } from "@protostar/artifacts";
import {
  buildPlanningMission,
  buildReviewMission,
  executionCoordinationPilePreset,
  resolvePileBudget,
  runFactoryPile as defaultRunFactoryPile,
  type PileRunContext,
  type PileRunOutcome,
  type PileFailure
} from "@protostar/dogpile-adapter";
import { createOpenAICompatibleProvider } from "@protostar/dogpile-types";
import { createEvaluationReport, decideEvolution, type OntologySnapshot } from "@protostar/evaluation";
import {
  prepareExecutionRun as defaultPrepareExecutionRun,
  runExecutionDryRun,
  type ExecutionDryRunResult
} from "@protostar/execution";
import { createLmstudioCoderAdapter } from "@protostar/lmstudio-adapter";
import {
  type IntentAmbiguityAssessment,
  type IntentAmbiguityMode
} from "@protostar/intent/ambiguity";
import {
  CLARIFICATION_REPORT_ARTIFACT_NAME,
  createClarificationReport
} from "@protostar/intent/clarification-report";
import type { CapabilityEnvelope } from "@protostar/intent";
import type { ConfirmedIntent } from "@protostar/intent/confirmed-intent";
import type { IntentDraft } from "@protostar/intent/draft";
import { authorizeFactoryStart } from "@protostar/policy/admission";
import {
  createAdmissionDecisionArtifact,
  promoteAndSignIntent,
  promoteIntentDraft,
  type AdmissionDecisionArtifactPayload
} from "@protostar/intent/admission";
import {
  buildPolicySnapshot,
  buildSignatureEnvelope,
  intersectEnvelopes,
  type AdmissionDecisionBase,
  type PrecedenceDecision
} from "@protostar/authority";
import {
  admitCandidatePlan,
  admitCandidatePlans,
  assertAdmittedPlanHandoff,
  createPlanningPreAdmissionFailureArtifact,
  PLANNING_ADMISSION_ARTIFACT_NAME,
  PLANNING_ADMISSION_SCHEMA_VERSION,
  type AdmittedPlan,
  type AdmittedPlanRecord,
  type PlanningAdmissionAcceptedArtifactPayload,
  type PlanningAdmissionArtifactPayload,
  type PersistedPlanningAdmissionArtifactRef
} from "@protostar/planning/artifacts";
import {
  DEFAULT_WORK_SLICING_HEURISTIC,
  invokeRepairPlanRefinementPile,
  invokeWorkSlicingPile,
  RefiningRefusedAuthorityExpansion,
  shouldInvokeWorkSlicing
} from "./exec-coord-trigger.js";
import type { RepairPlan } from "@protostar/review";
import {
  assertPlanningPileResult,
  parsePlanningPileResult,
  type CandidatePlanGraph
} from "@protostar/planning/schema";
import type { ExecutionRunResult } from "@protostar/planning";
import {
  cleanupWorkspace,
  cloneWorkspace,
  CredentialRefusedError,
  defineWorkspace,
  dirtyWorktreeStatus,
  intersectAllowlist,
  DEFAULT_REPO_POLICY,
  loadRepoPolicy as loadRepoRuntimePolicy
} from "@protostar/repo";
import { applyChangeSet as defaultApplyChangeSet } from "@protostar/repo";
import type { CloneResult, RepoPolicy as RepoRuntimePolicy } from "@protostar/repo";
import { runReviewRepairLoop, createReviewPileModelReviewer, loadDeliveryAuthorization, type ReviewGate, type ReviewVerdict, type ReviewRepairLoopResult, type TaskExecutorService } from "@protostar/review";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { createConfirmedIntentHandoff } from "./confirmed-intent-handoff.js";
import { ArgvError, parseCliArgs, type ParsedCliArgs, type PileMode } from "./cli-args.js";
import { runFastDeliveryPreflight, runFullDeliveryPreflight } from "./delivery-preflight-wiring.js";
import { wireExecuteDelivery } from "./execute-delivery-wiring.js";
import { resolvePileMode, type FactoryCliPileKind } from "./pile-mode-resolver.js";
import { writePileArtifacts } from "./pile-persistence.js";
import { installCancelWiring } from "./cancel.js";
import { coderAdapterReadyAdmission } from "./coder-adapter-admission.js";
import { writeEscalationMarker } from "./escalation-marker.js";
import { createJournalWriter } from "./journal-writer.js";
import { loadFactoryConfig } from "./load-factory-config.js";
import { loadRepoPolicy as loadAuthorityRepoPolicy } from "./load-repo-policy.js";
import { buildTierConstraints } from "./precedence-tier-loader.js";
import { createFsRepoReader } from "./repo-reader-adapter.js";
import {
  runRealExecution as defaultRunRealExecution,
  type RunRealExecutionResult
} from "./run-real-execution.js";
import {
  appendRefusalIndexEntry,
  buildTerminalStatusArtifact,
  REFUSALS_INDEX_FILE_NAME,
  TERMINAL_STATUS_ARTIFACT_NAME,
  type RefusalIndexEntry,
  type RefusalStage
} from "./refusals-index.js";
import {
  writeAdmissionDecision,
  writePolicySnapshot,
  writePrecedenceDecision
} from "./write-admission-decision.js";
import { validateTwoKeyLaunch, verifyTrustedLaunchConfirmedIntent, type TwoKeyLaunchRefusal } from "./two-key-launch.js";
import { buildReviewRepairServices, preflightCoderAndJudge, type ReviewLoopFsAdapter } from "./wiring/index.js";

export interface RunCommandOptions {
  readonly intentDraftPath: string;
  readonly confirmedIntentOutputPath?: string;
  readonly confirmedIntent?: string;
  readonly outDir: string;
  readonly planningFixturePath: string;
  readonly failTaskIds: readonly string[];
  readonly intentMode: IntentAmbiguityMode;
  readonly runId?: string;
  readonly trust?: "untrusted" | "trusted";
  readonly executor?: "dry-run" | "real";
  readonly allowedAdapters?: readonly string[];
  // Phase 6 Plan 06-07 — pile-mode CLI overrides (Q-04). When undefined,
  // factory-config.json piles[kind].mode (or built-in "fixture" default per
  // Q-05) is used.
  readonly planningMode?: PileMode;
  readonly reviewMode?: PileMode;
  readonly execCoordMode?: PileMode;
}

export interface RunCommandResult {
  readonly runId: string;
  readonly runDir: string;
  readonly intent: ConfirmedIntent;
  readonly artifacts: readonly string[];
}

export interface FactoryCompositionDependencies {
  readonly prepareExecutionRun: typeof defaultPrepareExecutionRun;
  readonly runRealExecution: typeof defaultRunRealExecution;
  readonly applyChangeSet: typeof defaultApplyChangeSet;
  readonly createLmstudioCoderAdapter: typeof createLmstudioCoderAdapter;
  readonly coderAdapterReadyAdmission: typeof coderAdapterReadyAdmission;
  // Phase 6 Plan 06-07 Task 3 — pile invocation seam. Default = the real
  // adapter from @protostar/dogpile-adapter; tests override with a stub that
  // returns either ok=true or ok=false synchronously.
  readonly runFactoryPile: typeof defaultRunFactoryPile;
}

interface AdmittedPlanningOutput {
  // Unbranded — this is the upstream record from admitCandidatePlan; the
  // brand is only minted when this flows through assertAdmittedPlanHandoff.
  readonly admittedPlan: AdmittedPlanRecord;
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
  runRealExecution: defaultRunRealExecution,
  applyChangeSet: defaultApplyChangeSet,
  createLmstudioCoderAdapter,
  coderAdapterReadyAdmission,
  runFactoryPile: defaultRunFactoryPile
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

  const twoKeyLaunch = validateTwoKeyLaunch({
    trust: command.options.trust ?? "untrusted",
    ...(command.options.confirmedIntent !== undefined ? { confirmedIntent: command.options.confirmedIntent } : {})
  });
  if (!twoKeyLaunch.ok) {
    const workspaceRoot = resolveWorkspaceRoot();
    const outDir = resolve(workspaceRoot, command.options.outDir);
    const runId = command.options.runId ?? createLaunchRefusalRunId();
    const runDir = resolve(outDir, runId);
    await writeTwoKeyLaunchRefusalArtifacts({
      runDir,
      outDir,
      runId,
      refusal: twoKeyLaunch.refusal
    });
    console.error(twoKeyLaunch.refusal.reason);
    process.exitCode = 2;
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
  const workspaceRoot = resolveWorkspaceRoot();
  const intentPath = resolve(workspaceRoot, options.intentDraftPath);
  const outDir = resolve(workspaceRoot, options.outDir);
  const confirmedIntentOutputPath = options.confirmedIntentOutputPath === undefined
    ? undefined
    : resolve(workspaceRoot, options.confirmedIntentOutputPath);
  const parsedIntentInput = JSON.parse(await readFile(intentPath, "utf8"));
  const capturedIntentDraftBeforeAdmission = captureMutableIntentDraft(parsedIntentInput);
  const clarificationReport = createClarificationReport({
    draft: capturedIntentDraftBeforeAdmission,
    mode: options.intentMode
  });
  const promotedIntent = promoteIntentDraft({
    draft: capturedIntentDraftBeforeAdmission,
    mode: options.intentMode
  });
  const admissionDecision = createAdmissionDecisionArtifact({
    draft: capturedIntentDraftBeforeAdmission,
    promotion: promotedIntent
  });
  const archetypeSuggestion = promotedIntent.archetypeSuggestion;
  const runId = options.runId ??
    (promotedIntent.ok === true
      ? createRunId(promotedIntent.intent.id)
      : createDraftRunId(capturedIntentDraftBeforeAdmission));
  const runDir = resolve(outDir, runId);
  if (!promotedIntent.ok) {
    // Persist the clarification-report alongside the admission-decision so
    // operators (and Phase 9 inspect) have the full intent-side refusal
    // evidence on disk before runFactory throws.
    await mkdir(runDir, { recursive: true });
    await writeJson(resolve(runDir, CLARIFICATION_REPORT_ARTIFACT_NAME), clarificationReport);
    await writeIntentAdmissionDecision({
      runDir,
      runId,
      admissionDecision,
      precedenceDecision: noConflictPrecedenceDecisionForDraft()
    });
    const reason = formatPromotionFailure(promotedIntent);
    if (admissionDecision.decision === "escalate") {
      await writeEscalationMarker({
        runDir,
        marker: {
          schemaVersion: "1.0.0",
          runId,
          gate: "intent",
          reason,
          createdAt: new Date().toISOString(),
          awaiting: "operator-confirm"
        }
      });
      throw new CliExitError(reason, 2);
    }
    await writeRefusalArtifacts({
      runDir,
      outDir,
      runId,
      stage: "intent",
      reason,
      refusalArtifact: CLARIFICATION_REPORT_ARTIFACT_NAME
    });
    throw new Error(reason);
  }

  const confirmedIntentHandoff = createConfirmedIntentHandoff({
    intentMode: options.intentMode,
    promotedIntent
  });
  const unsignedIntent = confirmedIntentHandoff.intent;
  const ambiguityAssessment = confirmedIntentHandoff.ambiguityAssessment;
  const planningFixturePath = resolve(workspaceRoot, options.planningFixturePath);
  const repoPolicy = await loadAuthorityRepoPolicy(workspaceRoot);
  const precedenceDecision = intersectEnvelopes(buildTierConstraints({
    intent: unsignedIntent,
    policy: { envelope: unsignedIntent.capabilityEnvelope, source: "factory-cli:policy" },
    repoPolicy,
    operatorSettings: { envelope: unsignedIntent.capabilityEnvelope, source: "factory-cli:operator-settings" }
  }));
  await mkdir(runDir, { recursive: true });
  await writePrecedenceDecision({ runDir, decision: precedenceDecision });
  if (precedenceDecision.status === "blocked-by-tier") {
    const requestedScopes = unsignedIntent.capabilityEnvelope.repoScopes.map((scope) => scope.path);
    const grantedScopes = precedenceDecision.resolvedEnvelope.repoScopes.map((scope) => scope.path);
    await writeAdmissionDecision({
      runDir,
      gate: "repo-scope",
      decision: baseAdmissionDecision({
        runId,
        gate: "repo-scope",
        outcome: "block",
        precedenceDecision,
        evidence: {
          admissionStage: "repo-scope",
          requestedScopes,
          grantedScopes,
          blockedBy: precedenceDecision.blockedBy
        }
      })
    });
    const reason = "precedence blocked by tier: run halted before signing or planning";
    await writeRefusalArtifacts({
      runDir,
      outDir,
      runId,
      stage: "precedence",
      reason,
      refusalArtifact: "repo-scope-admission-decision.json"
    });
    throw new CliExitError(reason, 1);
  }
  const factoryConfig = await loadFactoryConfig(workspaceRoot);
  // Phase 6 Plan 06-07 Task 3 — pile-mode resolution (Q-04 precedence) and
  // run-level AbortController construction (Q-11). The controller is created
  // here, BEFORE the planning seam, so pile invocations and downstream
  // execution share the same parent signal. installCancelWiring (lower
  // down) consumes this controller via its `rootController` option.
  const pileModeCli = {
    ...(options.planningMode !== undefined ? { planningMode: options.planningMode } : {}),
    ...(options.reviewMode !== undefined ? { reviewMode: options.reviewMode } : {}),
    ...(options.execCoordMode !== undefined ? { execCoordMode: options.execCoordMode } : {})
  };
  const pileModes: Readonly<Record<FactoryCliPileKind, PileMode>> = {
    planning: resolvePileMode("planning", pileModeCli, factoryConfig.config.piles),
    review: resolvePileMode("review", pileModeCli, factoryConfig.config.piles),
    executionCoordination: resolvePileMode("executionCoordination", pileModeCli, factoryConfig.config.piles)
  };
  const runAbortController = new AbortController();
  const policySnapshot = buildPolicySnapshot({
    policy: {
      allowDarkRun: true,
      maxAutonomousRisk: "medium",
      requiredHumanCheckpoints: [],
      factoryConfigHash: factoryConfig.configHash
    },
    resolvedEnvelope: precedenceDecision.resolvedEnvelope,
    repoPolicy
  });
  const { hash: policySnapshotHash } = await writePolicySnapshot({ runDir, snapshot: policySnapshot });
  const signature = buildSignatureEnvelope({
    intent: stripSignature(unsignedIntent),
    resolvedEnvelope: precedenceDecision.resolvedEnvelope,
    policySnapshotHash
  });
  const signedPromotion = promoteAndSignIntent({
    id: unsignedIntent.id,
    ...(unsignedIntent.sourceDraftId !== undefined ? { sourceDraftId: unsignedIntent.sourceDraftId } : {}),
    ...(unsignedIntent.mode !== undefined ? { mode: unsignedIntent.mode } : {}),
    ...(unsignedIntent.goalArchetype !== undefined ? { goalArchetype: unsignedIntent.goalArchetype } : {}),
    title: unsignedIntent.title,
    problem: unsignedIntent.problem,
    requester: unsignedIntent.requester,
    ...(unsignedIntent.context !== undefined ? { context: unsignedIntent.context } : {}),
    acceptanceCriteria: unsignedIntent.acceptanceCriteria,
    capabilityEnvelope: unsignedIntent.capabilityEnvelope,
    constraints: unsignedIntent.constraints,
    stopConditions: unsignedIntent.stopConditions,
    confirmedAt: unsignedIntent.confirmedAt,
    schemaVersion: unsignedIntent.schemaVersion,
    signature
  });
  if (!signedPromotion.ok) {
    throw new Error(`Unable to sign confirmed intent: ${signedPromotion.errors.join("; ")}`);
  }
  const intent = signedPromotion.intent;

  // GOV-04/GOV-06: verify the confirmed-intent file before any trust allow evidence is written.
  // This closes T-2-5 (any path satisfies second key) and T-2-7 (signature bypass).
  if (options.trust === "trusted") {
    // options.confirmedIntent is guaranteed present by validateTwoKeyLaunch preflight
    const confirmedIntentFilePath = resolve(workspaceRoot, options.confirmedIntent ?? "");
    const verificationResult = await verifyTrustedLaunchConfirmedIntent({
      confirmedIntentPath: confirmedIntentFilePath,
      expectedIntent: intent,
      policySnapshot,
      resolvedEnvelope: precedenceDecision.resolvedEnvelope,
      readFile: (path) => readFile(path, "utf8")
    });
    if (!verificationResult.ok) {
      const reason = `trusted launch confirmed intent verification failed: ${verificationResult.errors.join("; ")}`;
      await writeEscalationMarker({
        runDir,
        marker: {
          schemaVersion: "1.0.0",
          runId,
          gate: "workspace-trust",
          reason,
          createdAt: new Date().toISOString(),
          awaiting: "operator-confirm"
        }
      });
      throw new CliExitError(reason, 2);
    }
  }

  await writeIntentAdmissionDecision({
    runDir,
    runId,
    admissionDecision,
    precedenceDecision
  });

  const policyVerdict = authorizeFactoryStart(intent, {
    allowDarkRun: true,
    maxAutonomousRisk: "medium",
    requiredHumanCheckpoints: []
  });

  if (policyVerdict.type !== "allow") {
    throw new Error(`Factory run refused by policy: ${policyVerdict.rationale}`);
  }

  if (intent.capabilityEnvelope.delivery !== undefined) {
    const fastResult = await runFastDeliveryPreflight({ env: process.env, runDir, fs: fsPromises });
    if (!fastResult.proceed) {
      throw new CliExitError(`Delivery fast preflight refused: ${fastResult.result.outcome}`, 1);
    }
  }

  const manifest = createFactoryRunManifest({
    runId,
    intentId: intent.id
  });
  const planningMission = buildPlanningMission(intent);
  const candidatePlanId = `plan_${runId}`;
  // Phase 6 Plan 06-07 Task 3a — planning seam (PILE-01).
  // Fixture mode: read fixture from disk (existing path).
  // Live mode: invoke runFactoryPile, persist outcome via writePileArtifacts,
  // route success → existing parsePlanningPileResultInputs path; route any
  // failure → pile-planning refusal (Q-06 no auto-fallback).
  let planningPileResultInput: unknown;
  if (pileModes.planning === "fixture") {
    const planningFixtureInput = await readPlanningFixtureInput(planningFixturePath);
    if (!planningFixtureInput.ok) {
      return await blockPlanningPreAdmission({
        runDir,
        outDir,
        runId,
        intent,
        candidatePlanId,
        errors: [planningFixtureInput.error],
        planningMission: planningMission.intent
      });
    }
    planningPileResultInput = planningFixtureInput.value;
  } else {
    const livePlanningOutcome = await dependencies.runFactoryPile(planningMission, {
      provider: createOpenAICompatibleProvider({
        baseURL: factoryConfig.config.adapters.coder.baseUrl,
        apiKey: process.env[factoryConfig.config.adapters.coder.apiKeyEnv] ?? "lm-studio",
        model: factoryConfig.config.adapters.coder.model
      }),
      signal: runAbortController.signal,
      budget: resolvePileBudget(planningMission.preset.budget, intent.capabilityEnvelope.budget),
      now: () => Date.now()
    });
    await writePileArtifacts({
      // Per-run pile layout = {runDir}/piles/{kind}/iter-{N}/. runDir is the
      // canonical per-run directory where intent.json, planning-admission.json,
      // etc. already live; pile artifacts join the same tree.
      runDir,
      runId,
      kind: "planning",
      iteration: 0,
      outcome: livePlanningOutcome,
      ...(livePlanningOutcome.ok
        ? {}
        : {
            refusal: {
              reason: formatPileFailureReason(livePlanningOutcome.failure),
              stage: "pile-planning",
              sourceOfTruth: "PlanningPileResult"
            }
          })
    });
    if (!livePlanningOutcome.ok) {
      const reason = `Planning pile refused (${livePlanningOutcome.failure.class}): ${formatPileFailureReason(livePlanningOutcome.failure)}`;
      await writeRefusalArtifacts({
        runDir,
        outDir,
        runId,
        stage: "pile-planning",
        reason,
        refusalArtifact: `piles/planning/iter-0/refusal.json`
      });
      throw new CliExitError(reason, 1);
    }
    try {
      planningPileResultInput = JSON.parse(livePlanningOutcome.result.output ?? "");
    } catch (err) {
      const reason = `Planning pile output is not valid JSON: ${formatUnknownError(err)}`;
      await writeRefusalArtifacts({
        runDir,
        outDir,
        runId,
        stage: "pile-planning",
        reason,
        refusalArtifact: `piles/planning/iter-0/refusal.json`
      });
      throw new CliExitError(reason, 1);
    }
  }
  const planningPileResultAdmission = parsePlanningPileResultInputs(planningPileResultInput);
  if (!planningPileResultAdmission.ok) {
    return await blockPlanningPreAdmission({
      runDir,
      outDir,
      runId,
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
      outDir,
      runId,
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
      outDir,
      runId,
      intent,
      candidatePlanId,
      errors: ["Planning admission requires at least one candidate plan."],
      planningMission: planningMission.intent,
      planningPileResult: planningPileResultInput
    });
  }
  const admissionAllowedAdapters = options.allowedAdapters ??
    ((options.executor ?? "dry-run") === "real" ? ["lmstudio-coder"] : undefined);
  const candidateAdmission = candidatePlans.length === 1
    ? admitCandidatePlan({
        graph: firstCandidatePlan,
        intent,
        planGraphUri: "plan.json",
        ...(admissionAllowedAdapters !== undefined ? { allowedAdapters: admissionAllowedAdapters } : {})
      })
    : admitCandidatePlans({
        candidatePlans,
        intent,
        planGraphUri: "plan.json",
        ...(admissionAllowedAdapters !== undefined ? { allowedAdapters: admissionAllowedAdapters } : {})
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
    const reason = `Planning admission rejected plan graph: ${candidateAdmission.errors.join("; ")}`;
    await writeRefusalArtifacts({
      runDir,
      outDir,
      runId,
      stage: "planning",
      reason,
      refusalArtifact: PLANNING_ADMISSION_ARTIFACT_NAME
    });
    throw new Error(reason);
  }
  assertAcceptedPlanningAdmissionArtifact(persistedPlanningAdmission);
  const admittedPlan = candidateAdmission.admittedPlan;
  // Phase 6 Plan 06-10 — work-slicing trigger may swap the admitted plan +
  // planning-admission artifact for a sliced re-admitted variant.
  const workSlicingApplied = await maybeApplyWorkSlicingPile({
    admittedPlan,
    persistedPlanningAdmission,
    planningAdmissionArtifact,
    pileModes,
    factoryConfig,
    intent,
    runAbortController,
    runDir,
    outDir,
    runId,
    runFactoryPile: dependencies.runFactoryPile
  });
  const workingAdmittedPlan = workSlicingApplied.admittedPlan;
  const workingPersistedPlanningAdmission = workSlicingApplied.planningAdmission;
  const workingPlanningAdmissionArtifact = workSlicingApplied.planningAdmissionArtifact;
  const admittedPlanningOutput: AdmittedPlanningOutput = {
    admittedPlan: workingAdmittedPlan,
    planningAdmission: workingPersistedPlanningAdmission,
    planningAdmissionArtifact: workingPlanningAdmissionArtifact
  };
  const admittedPlanHandoff = assertAdmittedPlanHandoff({
    plan: admittedPlanningOutput.admittedPlan,
    planningAdmission: admittedPlanningOutput.planningAdmission,
    planningAdmissionArtifact: admittedPlanningOutput.planningAdmissionArtifact,
    planGraphUri: "plan.json"
  });
  const gateAdmissionResult = await writeGateAdmissionDecisionsOrBlock({
    runDir,
    outDir,
    runId,
    admissionDecision,
    planningAdmission: admittedPlanningOutput.planningAdmission,
    precedenceDecision,
    workspaceTrust: options.trust ?? "untrusted",
    workspacePath: workspaceRoot,
    requestedEnvelope: unsignedIntent.capabilityEnvelope
  });
  if (!gateAdmissionResult.ok) {
    throw gateAdmissionResult.error;
  }
  const repoRuntime = await admitRepoRuntime({
    projectRoot: workspaceRoot,
    runDir,
    outDir,
    runId,
    intent,
    precedenceDecision
  });
  let repoRuntimeCleanupDone = false;
  const cleanupRepoRuntime = async (input: { readonly failed: boolean; readonly errorMessage?: string }) => {
    if (repoRuntimeCleanupDone) {
      return;
    }
    repoRuntimeCleanupDone = true;
    if (input.failed) {
      await cleanupWorkspace(repoRuntime.cloneDir, runId, {
        reason: "failure",
        tombstoneRetentionHours: repoRuntime.policy.tombstoneRetentionHours,
        ...(input.errorMessage !== undefined ? { errorMessage: input.errorMessage } : {})
      });
      return;
    }
    await cleanupWorkspace(repoRuntime.cloneDir, runId, { reason: "success" });
  };

  try {
  const workspace = defineWorkspace({
    root: workspaceRoot,
    trust: options.trust ?? "untrusted",
    defaultBranch: "main"
  });
  const execution = dependencies.prepareExecutionRun({
    runId: manifest.runId,
    admittedPlan: admittedPlanHandoff.executionArtifact,
    workspace
  });
  const cancel = installCancelWiring({ runDir, rootController: runAbortController });
  let executionResult: ExecutionDryRunResult;
  let realExecutionAdapter: ReturnType<typeof dependencies.createLmstudioCoderAdapter> | undefined;
  let loop: ReviewRepairLoopResult;
  let review: ReviewGate;
  try {
    await cancel.unlinkSentinelOnResume();
    if ((options.executor ?? "dry-run") === "real") {
      const admission = await dependencies.coderAdapterReadyAdmission({
        runId,
        runDir,
        outDir,
        resolvedEnvelope: precedenceDecision.resolvedEnvelope,
        factoryConfig,
        precedenceDecision,
        signal: cancel.rootController.signal
      });
      if (!admission.ok) {
        throw admission.error;
      }
      const judge = factoryConfig.config.adapters.judge;
      if (judge === undefined) {
        throw new Error("factoryConfig.adapters.judge is required for review preflight.");
      }
      const preflight = await preflightCoderAndJudge({
        coderBaseUrl: factoryConfig.config.adapters.coder.baseUrl,
        judgeBaseUrl: judge.baseUrl,
        coderModel: factoryConfig.config.adapters.coder.model,
        judgeModel: judge.model,
        timeoutMs: intent.capabilityEnvelope.budget.taskWallClockMs ?? 60_000
      });
      if (preflight.status !== "ready") {
        throw new CliExitError(`LM Studio review preflight failed: ${preflight.status}${preflight.detail === undefined ? "" : ` (${preflight.detail})`}`, 1);
      }
      const journalWriter = await createJournalWriter({ runDir });
      try {
        const adapter = dependencies.createLmstudioCoderAdapter({
          baseUrl: factoryConfig.config.adapters.coder.baseUrl,
          model: factoryConfig.config.adapters.coder.model,
          apiKey: process.env[factoryConfig.config.adapters.coder.apiKeyEnv] ?? "lm-studio",
          ...(factoryConfig.config.adapters.coder.temperature !== undefined
            ? { temperature: factoryConfig.config.adapters.coder.temperature }
            : {}),
          ...(factoryConfig.config.adapters.coder.topP !== undefined
            ? { topP: factoryConfig.config.adapters.coder.topP }
            : {})
        });
        realExecutionAdapter = adapter;
        const realResult = await dependencies.runRealExecution({
          runPlan: execution,
          adapter,
          repoReader: createFsRepoReader({ workspaceRoot: repoRuntime.cloneDir }),
          resolvedEnvelope: precedenceDecision.resolvedEnvelope,
          confirmedIntent: intent,
          journalWriter,
          runDir,
          workspaceRoot: repoRuntime.cloneDir,
          rootSignal: cancel.rootController.signal,
          applyChangeSet: dependencies.applyChangeSet,
          checkSentinelBetweenTasks: cancel.checkSentinelBetweenTasks
        });
        executionResult = realExecutionAsDryRunResult(execution, realResult);
      } finally {
        await journalWriter.close();
      }
    } else {
      executionResult = runExecutionDryRun({
        execution,
        failTaskIds: options.failTaskIds
      });
    }
    let currentExecution = executionRunResultFromDry(executionResult);
    const reviewExecutor = createReviewTaskExecutor({
      executeRepairTasks: async (repairInput) => {
        if ((options.executor ?? "dry-run") !== "real" || realExecutionAdapter === undefined) {
          return currentExecution;
        }
        const repairJournalWriter = await createJournalWriter({ runDir });
        try {
          const repairResult = await dependencies.runRealExecution({
            runPlan: execution,
            adapter: realExecutionAdapter,
            repoReader: createFsRepoReader({ workspaceRoot: repoRuntime.cloneDir }),
            resolvedEnvelope: precedenceDecision.resolvedEnvelope,
            confirmedIntent: intent,
            journalWriter: repairJournalWriter,
            runDir,
            workspaceRoot: repoRuntime.cloneDir,
            rootSignal: cancel.rootController.signal,
            applyChangeSet: dependencies.applyChangeSet,
            checkSentinelBetweenTasks: cancel.checkSentinelBetweenTasks,
            repair: {
              attempt: repairInput.attempt,
              repairPlan: repairInput.repairPlan
            }
          });
          const repairedDry = realExecutionAsDryRunResult(execution, repairResult);
          currentExecution = mergeRepairExecutionResult({
            previous: currentExecution,
            repaired: executionRunResultFromDry(repairedDry, repairInput.attempt),
            repairedTaskIds: repairInput.repairPlan.dependentTaskIds,
            attempt: repairInput.attempt
          });
          executionResult = mergeRepairDryRunResult({
            previous: executionResult,
            repaired: repairedDry,
            repairedTaskIds: repairInput.repairPlan.dependentTaskIds
          });
          return currentExecution;
        } finally {
          await repairJournalWriter.close();
        }
      }
    });
    const reviewServices = buildReviewRepairServices({
      fs: createNodeReviewFsAdapter(),
      gitFs: nodeFs,
      runsRoot: outDir,
      workspaceRoot: repoRuntime.cloneDir,
      factoryConfig,
      archetype: intent.goalArchetype === undefined ? "cosmetic-tweak" : reviewLoopArchetype(intent.goalArchetype),
      admittedPlan: admittedPlanHandoff.executionArtifact,
      runId,
      baseRef: "main",
      executor: reviewExecutor,
      subprocess: createMechanicalSubprocessRunner({ runDir, resolvedEnvelope: precedenceDecision.resolvedEnvelope })
    });
    // Phase 6 Plan 06-07 Task 3b — review seam (PILE-02). When mode=live, the
    // ModelReviewer is the review pile (Q-14 retroactive lock); fixture mode
    // continues to use the Phase 5 dry stub or reviewServices.modelReviewer.
    // The injected runPile wrapper is the persistence boundary: each pile
    // invocation writes its outcome to runs/{id}/piles/review/iter-N/ via
    // writePileArtifacts (Q-07 layout, Q-08 always-persist trace).
    let reviewPileIteration = 0;
    const liveReviewModelReviewer: typeof reviewServices.modelReviewer | undefined =
      pileModes.review === "live"
        ? createReviewPileModelReviewer({
            runPile: async (mission, ctx) => {
              const outcome = await dependencies.runFactoryPile(mission, ctx);
              const iterationForThisCall = reviewPileIteration;
              reviewPileIteration += 1;
              await writePileArtifacts({
                runDir,
                runId,
                kind: "review",
                iteration: iterationForThisCall,
                outcome,
                ...(outcome.ok
                  ? {}
                  : {
                      refusal: {
                        reason: formatPileFailureReason(outcome.failure),
                        stage: "pile-review",
                        sourceOfTruth: "ReviewPileResult"
                      }
                    })
              });
              return outcome;
            },
            buildMission: () => buildReviewMission(intent, admittedPlanningOutput.planningAdmission),
            buildContext: () => ({
              provider: createOpenAICompatibleProvider({
                baseURL: factoryConfig.config.adapters.coder.baseUrl,
                apiKey: process.env[factoryConfig.config.adapters.coder.apiKeyEnv] ?? "lm-studio",
                model: factoryConfig.config.adapters.coder.model
              }),
              signal: runAbortController.signal,
              budget: resolvePileBudget(
                { maxTokens: 20000, timeoutMs: 120000 },
                intent.capabilityEnvelope.budget
              ),
              now: () => Date.now()
            })
          })
        : undefined;
    // Phase 6 Plan 06-10 Task 3 — repair-plan-refinement trigger (PILE-03 #2).
    // When exec-coord pile mode is live, thread a repairPlanRefiner closure
    // into runReviewRepairLoop. The closure invokes the exec-coord pile in
    // repair-plan-generation mode and admits the proposal via
    // admitRepairPlanProposal. Q-15: pile failure or no-op rejection soft-
    // falls-back to the deterministic repair plan; authority-expansion
    // rejection (T-6-19) hard-blocks via RefiningRefusedAuthorityExpansion.
    const repairPlanRefiner = pileModes.executionCoordination === "live"
      ? async (repairPlan: RepairPlan, ctx: { readonly attempt: number }): Promise<RepairPlan> => {
          return invokeRepairPlanRefinementPile(
            intent,
            admittedPlanHandoff.executionArtifact,
            admittedPlanningOutput.admittedPlan,
            repairPlan,
            ctx.attempt,
            {
              runFactoryPile: dependencies.runFactoryPile,
              buildContext: () => buildExecCoordPileContext({
                factoryConfig,
                intent,
                signal: runAbortController.signal
              }),
              persist: async ({ outcome, iteration, refusal }) => {
                await writePileArtifacts({
                  runDir,
                  runId,
                  kind: "execution-coordination",
                  iteration,
                  outcome,
                  ...(refusal !== undefined
                    ? {
                        refusal: {
                          reason: refusal.reason,
                          stage: "pile-execution-coordination",
                          sourceOfTruth: "ExecutionCoordinationPileResult"
                        }
                      }
                    : {})
                });
              }
            }
          );
        }
      : undefined;
    try {
      loop = await runReviewRepairLoop({
        runId,
        confirmedIntent: intent,
        admittedPlan: admittedPlanHandoff.executionArtifact,
        initialExecution: currentExecution,
        executor: reviewExecutor,
        mechanicalChecker: (options.executor ?? "dry-run") === "real"
          ? reviewServices.mechanicalChecker
          : async () => dryMechanicalCheck({
              runId,
              planId: admittedPlanHandoff.executionArtifact.planId,
              status: executionResult.status
            }),
        modelReviewer: liveReviewModelReviewer ??
          ((options.executor ?? "dry-run") === "real"
            ? reviewServices.modelReviewer
            : async () => ({ verdict: executionResult.status === "succeeded" ? "pass" : "block", critiques: [] })),
        persistence: reviewServices.persistence,
        ...(repairPlanRefiner !== undefined ? { repairPlanRefiner } : {})
      });
    } catch (error) {
      if (error instanceof RefiningRefusedAuthorityExpansion) {
        const reason = `Repair-plan refinement refused (authority expansion): ${error.errors.join("; ")}`;
        await writeRefusalArtifacts({
          runDir,
          outDir,
          runId,
          stage: "pile-execution-coordination",
          reason,
          refusalArtifact: `piles/execution-coordination/refusal.json`
        });
        throw new CliExitError(reason, 1);
      }
      throw error;
    }
    review = reviewGateFromLoopResult({
      runId,
      planId: admittedPlanHandoff.executionArtifact.planId,
      status: loop.status
    });
  } finally {
    cancel.dispose();
  }
  const evaluationReport = createEvaluationReport({
    runId,
    reviewGate: review
  });
  const evolutionDecision = decideEvolution({
    previous: createIntentOntologySnapshot(intent),
    current: createPlanOntologySnapshot(admittedPlanHandoff.plan)
  });
  let deliveryWireStatus: "delivered" | "delivery-blocked" | undefined;
  if (loop.status === "approved" && intent.capabilityEnvelope.delivery !== undefined) {
    const authorization = await loadDeliveryAuthorization({
      decisionPath: loop.decisionPath,
      readJson: async (path) => JSON.parse(await readFile(path, "utf8")) as unknown
    });
    if (authorization === null) {
      throw new CliExitError("Delivery authorization could not be loaded from approved review decision.", 1);
    }
    const deliveryWallClockMs = intent.capabilityEnvelope.budget.deliveryWallClockMs ?? 600_000;
    const deliverySignal = AbortSignal.any([
      runAbortController.signal,
      AbortSignal.timeout(deliveryWallClockMs)
    ]);
    const fullResult = await runFullDeliveryPreflight({
      token: process.env["PROTOSTAR_GITHUB_TOKEN"]!,
      target: intent.capabilityEnvelope.delivery.target,
      runDir,
      fs: fsPromises,
      signal: deliverySignal
    });
    if (!fullResult.proceed) {
      throw new CliExitError(`Delivery full preflight refused: ${fullResult.result.outcome}`, 1);
    }
    const { octokit, baseSha } = fullResult;
    if (octokit === undefined || baseSha === undefined) {
      throw new CliExitError("Delivery full preflight did not return Octokit and base SHA.", 1);
    }
    const deliveryArtifacts = buildDeliveryArtifactList(executionResult.evidence);
    const wireResult = await wireExecuteDelivery({
      runId,
      runDir,
      authorization,
      intent: {
        title: intent.title,
        archetype: intent.goalArchetype ?? "cosmetic-tweak"
      },
      target: intent.capabilityEnvelope.delivery.target,
      bodyInput: {
        runId,
        target: intent.capabilityEnvelope.delivery.target,
        mechanical: {
          verdict: review.verdict === "pass" ? "pass" : "fail",
          findings: review.findings
        },
        critiques: [],
        iterations: [],
        artifacts: deliveryArtifacts
      },
      token: process.env["PROTOSTAR_GITHUB_TOKEN"]!,
      octokit,
      baseSha,
      workspaceDir: repoRuntime.cloneDir,
      fs: fsPromises,
      signal: deliverySignal,
      requiredChecks: factoryConfig.config.delivery?.requiredChecks ?? []
    });
    deliveryWireStatus = wireResult.status;
    if (wireResult.status === "delivery-blocked") {
      throw new CliExitError("Delivery execution was blocked; see delivery/delivery-result.json.", 1);
    }
  }
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
                "intent-admission-decision.json",
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
      status: executionResult.status === "succeeded" ? ("passed" as const) : ("failed" as const),
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
      status: deliveryWireStatus === "delivered" ? ("passed" as const) : ("skipped" as const),
      artifacts: deliveryWireStatus === "delivered"
        ? [
            artifact("release", "delivery-result", "delivery/delivery-result.json", "GitHub PR delivery result and latest CI verdict."),
            artifact("release", "ci-events", "delivery/ci-events.jsonl", "Append-only CI capture and delivery event stream.")
          ]
        : []
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

  const finalResult = {
    runId,
    runDir,
    intent,
    artifacts: [
      ...(capturedIntentDraftBeforeAdmission === undefined ? [] : ["intent-draft.json"]),
      ...(clarificationReport === undefined ? [] : [CLARIFICATION_REPORT_ARTIFACT_NAME]),
      ...(admissionDecision === undefined ? [] : ["intent-admission-decision.json"]),
      "repo-runtime-admission-decision.json",
      "planning-admission-decision.json",
      "capability-admission-decision.json",
      "repo-scope-admission-decision.json",
      "workspace-trust-admission-decision.json",
      "admission-decisions.jsonl",
      "policy-snapshot.json",
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
      ...(deliveryWireStatus === "delivered" ? ["delivery/delivery-result.json", "delivery/ci-events.jsonl"] : [])
    ]
  };

  const failedReview = review.verdict !== "pass";
  await cleanupRepoRuntime({
    failed: failedReview,
    ...(failedReview ? { errorMessage: `review verdict: ${review.verdict}` } : {})
  });
  return finalResult;
  } catch (error: unknown) {
    await cleanupRepoRuntime({
      failed: true,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
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

function createPlanOntologySnapshot(plan: AdmittedPlan | AdmittedPlanRecord): OntologySnapshot {
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

function buildDeliveryArtifactList(executionEvidence: readonly StageArtifactRef[]): readonly StageArtifactRef[] {
  return [
    artifact("intent", "confirmed-intent", "intent.json", "Normalized confirmed intent input."),
    artifact("planning", "plan-graph", "plan.json", "Admitted PlanGraph written after planning admission."),
    artifact("execution", "execution-result", "execution-result.json", "Execution result."),
    artifact("execution", "review-execution-loop", "review-execution-loop.json", "Review-execute-review loop transcript."),
    ...executionEvidence,
    artifact("review", "review-gate", "review-gate.json", "Mechanical review verdict and findings."),
    artifact("review", "evaluation-report", "evaluation-report.json", "Three-stage evaluation report stub."),
    artifact("review", "evolution-decision", "evolution-decision.json", "Ontology convergence decision stub.")
  ];
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

function realExecutionAsDryRunResult(
  execution: ReturnType<typeof defaultPrepareExecutionRun>,
  result: RunRealExecutionResult
): ExecutionDryRunResult {
  const evidence = result.events.flatMap((event) => event.evidence ?? []);
  const terminalByTask = new Map(result.events.map((event) => [event.planTaskId, event]));
  const tasks = execution.tasks.map((task) => {
    const terminal = terminalByTask.get(task.planTaskId);
    const status: "succeeded" | "failed" = terminal?.status === "succeeded" ? "succeeded" : "failed";
    return {
      ...task,
      status,
      evidence: terminal?.evidence ?? [],
      ...(terminal?.reason !== undefined ? { reason: terminal.reason } : {})
    };
  });
  return {
    runId: execution.runId,
    planId: execution.planId,
    status: result.outcome === "complete" && tasks.every((task) => task.status === "succeeded")
      ? "succeeded"
      : "failed",
    tasks,
    events: result.events,
    evidence
  };
}

function executionRunResultFromDry(result: ExecutionDryRunResult, attempt = 0): ExecutionRunResult {
  return {
    schemaVersion: "1.0.0",
    runId: result.runId,
    attempt,
    status: result.status === "succeeded" ? "completed" : "failed",
    journalArtifact: {
      stage: "execution",
      kind: "execution-events",
      uri: "execution-events.json",
      description: "Execution lifecycle events."
    },
    perTask: result.tasks.map((task) => ({
      planTaskId: task.planTaskId,
      status: task.status === "succeeded" ? "ok" : "failed",
      ...(task.evidence[0] !== undefined ? { evidenceArtifact: task.evidence[0] } : {})
    })),
    ...(result.evidence[0] !== undefined ? { diffArtifact: result.evidence[0] } : {})
  };
}

function mergeRepairExecutionResult(input: {
  readonly previous: ExecutionRunResult;
  readonly repaired: ExecutionRunResult;
  readonly repairedTaskIds: readonly string[];
  readonly attempt: number;
}): ExecutionRunResult {
  const repairedTaskIds = new Set(input.repairedTaskIds);
  const repairedByTask = new Map(input.repaired.perTask.map((task) => [task.planTaskId, task]));
  const previousByTask = new Map(input.previous.perTask.map((task) => [task.planTaskId, task]));
  const perTask = input.previous.perTask.map((task) =>
    repairedTaskIds.has(task.planTaskId) ? (repairedByTask.get(task.planTaskId) ?? task) : task
  );
  for (const task of input.repaired.perTask) {
    if (repairedTaskIds.has(task.planTaskId) && !previousByTask.has(task.planTaskId)) {
      perTask.push(task);
    }
  }
  const firstEvidence = perTask.flatMap((task) => task.evidenceArtifact === undefined ? [] : [task.evidenceArtifact])[0];
  return {
    ...input.previous,
    attempt: input.attempt,
    status: perTask.every((task) => task.status === "ok") ? "completed" : "failed",
    perTask,
    ...(firstEvidence !== undefined ? { diffArtifact: firstEvidence } : {})
  };
}

function mergeRepairDryRunResult(input: {
  readonly previous: ExecutionDryRunResult;
  readonly repaired: ExecutionDryRunResult;
  readonly repairedTaskIds: readonly string[];
}): ExecutionDryRunResult {
  const repairedTaskIds = new Set(input.repairedTaskIds);
  const repairedByTask = new Map(input.repaired.tasks.map((task) => [task.planTaskId, task]));
  const previousByTask = new Map(input.previous.tasks.map((task) => [task.planTaskId, task]));
  const tasks = input.previous.tasks.map((task) =>
    repairedTaskIds.has(task.planTaskId) ? (repairedByTask.get(task.planTaskId) ?? task) : task
  );
  for (const task of input.repaired.tasks) {
    if (repairedTaskIds.has(task.planTaskId) && !previousByTask.has(task.planTaskId)) {
      tasks.push(task);
    }
  }
  const events = [...input.previous.events, ...input.repaired.events];
  const evidence = [...input.previous.evidence, ...input.repaired.evidence];
  return {
    ...input.previous,
    status: tasks.every((task) => task.status === "succeeded") ? "succeeded" : "failed",
    tasks,
    events,
    evidence
  };
}

function reviewGateFromLoopResult(input: {
  readonly runId: string;
  readonly planId: string;
  readonly status: ReviewRepairLoopResult["status"];
}): ReviewGate {
  return {
    runId: input.runId,
    planId: input.planId,
    verdict: input.status === "approved" ? "pass" : "block",
    findings: []
  };
}

function dryMechanicalCheck(input: {
  readonly runId: string;
  readonly planId: string;
  readonly status: ExecutionDryRunResult["status"];
}) {
  const gate = reviewGateFromLoopResult({
    runId: input.runId,
    planId: input.planId,
    status: input.status === "succeeded" ? "approved" : "blocked"
  });
  return {
    gate,
    result: {
      schemaVersion: "1.0.0",
      runId: input.runId,
      attempt: 0,
      commands: [],
      diffNameOnly: [],
      findings: gate.findings
    }
  } as const;
}

function createReviewTaskExecutor(input: {
  readonly executeRepairTasks: TaskExecutorService["executeRepairTasks"];
}): TaskExecutorService {
  return {
    executeRepairTasks: input.executeRepairTasks
  };
}

function reviewLoopArchetype(value: string): "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix" {
  if (value === "cosmetic-tweak" || value === "feature-add" || value === "refactor" || value === "bugfix") {
    return value;
  }
  return "cosmetic-tweak";
}

function createNodeReviewFsAdapter(): ReviewLoopFsAdapter {
  return {
    async mkdir(path, options) {
      await mkdir(path, options);
    },
    async writeFile(path, content) {
      await writeFile(path, content);
    },
    async appendFile(path, content) {
      await appendFile(path, content);
    },
    async rename(from, to) {
      await rename(from, to);
    },
    async fsync(path) {
      const handle = await open(path, "r").catch(async () => open(dirname(path), "r"));
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    async readFile(path) {
      return readFile(path, "utf8");
    }
  };
}

function createMechanicalSubprocessRunner(input: {
  readonly runDir: string;
  readonly resolvedEnvelope: unknown;
}) {
  return {
    async runCommand(command: {
      readonly argv: readonly string[];
      readonly cwd: string;
      readonly signal: AbortSignal;
      readonly timeoutMs: number;
    }) {
      const [program, ...args] = command.argv;
      if (program === undefined) {
        throw new Error("mechanical command argv must not be empty.");
      }
      const id = command.argv.join("-").replace(/[^a-zA-Z0-9._-]+/g, "_");
      const dir = resolve(input.runDir, "review", "mechanical");
      await mkdir(dir, { recursive: true });
      const stdoutPath = resolve(dir, `${id}.stdout.log`);
      const stderrPath = resolve(dir, `${id}.stderr.log`);
      const result = await runSpawnedCommand({
        program,
        args,
        cwd: command.cwd,
        signal: command.signal,
        timeoutMs: command.timeoutMs,
        stdoutPath,
        stderrPath
      });
      return {
        argv: command.argv,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdoutPath,
        stderrPath,
        stdoutBytes: result.stdoutBytes,
        stderrBytes: result.stderrBytes
      };
    }
  };
}

async function runSpawnedCommand(input: {
  readonly program: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
}): Promise<{
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
}> {
  const startedAt = Date.now();
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let settled = false;

  const child = spawn(input.program, [...input.args], {
    cwd: input.cwd,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"]
  });
  const timer = setTimeout(() => child.kill("SIGTERM"), input.timeoutMs);
  const abort = () => child.kill("SIGTERM");
  input.signal.addEventListener("abort", abort, { once: true });

  child.stdout?.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => {
        settled = true;
        resolve(code ?? 124);
      });
    });
    const stdout = Buffer.concat(stdoutChunks);
    const stderr = Buffer.concat(stderrChunks);
    await Promise.all([
      writeFile(input.stdoutPath, stdout),
      writeFile(input.stderrPath, stderr)
    ]);
    return {
      exitCode,
      durationMs: Date.now() - startedAt,
      stdoutBytes: stdout.length,
      stderrBytes: stderr.length
    };
  } finally {
    clearTimeout(timer);
    input.signal.removeEventListener("abort", abort);
    if (!settled) {
      child.kill("SIGTERM");
    }
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function resolveRefusalsIndexPath(outDir: string): string {
  // refusals.jsonl sits alongside the runs/ directory so a single workspace
  // accumulates one index regardless of which run dir produced the entry. In
  // production --out is .protostar/runs, putting the index at
  // .protostar/refusals.jsonl. In tests --out is tempDir/out, putting the
  // index at tempDir/refusals.jsonl (hermetic per test).
  return resolve(outDir, "..", REFUSALS_INDEX_FILE_NAME);
}

async function writeRefusalArtifacts(input: {
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly stage: RefusalStage;
  readonly reason: string;
  readonly refusalArtifact: string;
}): Promise<void> {
  await mkdir(input.runDir, { recursive: true });
  const terminalStatus = buildTerminalStatusArtifact({
    runId: input.runId,
    stage: input.stage,
    reason: input.reason,
    refusalArtifact: input.refusalArtifact
  });
  await writeJson(resolve(input.runDir, TERMINAL_STATUS_ARTIFACT_NAME), terminalStatus);

  const refusalsIndexPath = resolveRefusalsIndexPath(input.outDir);
  const entry: RefusalIndexEntry = {
    runId: input.runId,
    timestamp: new Date().toISOString(),
    stage: input.stage,
    reason: input.reason,
    artifactPath: `runs/${input.runId}/${input.refusalArtifact}`,
    schemaVersion: "1.0.0"
  };
  await appendRefusalIndexEntry(refusalsIndexPath, entry);
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
  readonly ambiguityAssessment: IntentAmbiguityAssessment | undefined;
  readonly archetypeSuggestion: ReturnType<typeof promoteIntentDraft>["archetypeSuggestion"] | undefined;
}): Promise<void> {
  await mkdir(input.runDir, { recursive: true });
  await writeJson(resolve(input.runDir, "intent-draft.json"), input.draft);
  if (input.clarificationReport !== undefined) {
    await writeJson(resolve(input.runDir, CLARIFICATION_REPORT_ARTIFACT_NAME), input.clarificationReport);
  }
  if (input.ambiguityAssessment !== undefined) {
    await writeJson(resolve(input.runDir, "intent-ambiguity.json"), createIntentAmbiguityArtifact(input.ambiguityAssessment));
  }
  if (input.archetypeSuggestion !== undefined) {
    await writeJson(resolve(input.runDir, "intent-archetype-suggestion.json"), input.archetypeSuggestion);
  }
}

async function writeGateAdmissionDecisionsOrBlock(input: {
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly admissionDecision: AdmissionDecisionArtifactPayload;
  readonly planningAdmission: PlanningAdmissionAcceptedArtifactPayload;
  readonly precedenceDecision: PrecedenceDecision;
  readonly workspaceTrust: "trusted" | "untrusted";
  readonly workspacePath: string;
  readonly requestedEnvelope: CapabilityEnvelope;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: Error }> {
  await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "planning",
    decision: baseAdmissionDecision({
      runId: input.runId,
      gate: "planning",
      outcome: "allow",
      precedenceDecision: input.precedenceDecision,
      evidence: {
        candidatesConsidered: readCandidateCount(input.planningAdmission)
      }
    })
  });
  await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "capability",
    decision: baseAdmissionDecision({
      runId: input.runId,
      gate: "capability",
      outcome: "allow",
      precedenceDecision: input.precedenceDecision,
      evidence: {
        requestedEnvelope: input.requestedEnvelope,
        resolvedEnvelope: input.precedenceDecision.resolvedEnvelope
      }
    })
  });
  await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "repo-scope",
    decision: baseAdmissionDecision({
      runId: input.runId,
      gate: "repo-scope",
      outcome: "allow",
      precedenceDecision: input.precedenceDecision,
      evidence: {
        requestedScopes: input.requestedEnvelope.repoScopes.map((scope) => scope.path),
        grantedScopes: input.precedenceDecision.resolvedEnvelope.repoScopes.map((scope) => scope.path)
      }
    })
  });
  const workspaceTrustOutcome = input.workspaceTrust === "trusted" ? "allow" : "escalate";
  await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "workspace-trust",
    decision: baseAdmissionDecision({
      runId: input.runId,
      gate: "workspace-trust",
      outcome: workspaceTrustOutcome,
      precedenceDecision: input.precedenceDecision,
      evidence: {
        workspacePath: input.workspacePath,
        declaredTrust: input.workspaceTrust,
        grantedAccess: input.workspaceTrust === "trusted" ? "write" : "none"
      }
    })
  });
  if (input.workspaceTrust !== "trusted") {
    const reason = "workspace-trust gate blocked: workspace is not trusted; escalation required before factory can proceed";
    await writeEscalationMarker({
      runDir: input.runDir,
      marker: {
        schemaVersion: "1.0.0",
        runId: input.runId,
        gate: "workspace-trust",
        reason,
        createdAt: new Date().toISOString(),
        awaiting: "operator-confirm"
      }
    });
    await writeRefusalArtifacts({
      runDir: input.runDir,
      outDir: input.outDir,
      runId: input.runId,
      stage: "workspace-trust",
      reason,
      refusalArtifact: "workspace-trust-admission-decision.json"
    });
    return { ok: false, error: new CliExitError(reason, 2) };
  }
  return { ok: true };
}

async function writeIntentAdmissionDecision(input: {
  readonly runDir: string;
  readonly runId: string;
  readonly admissionDecision: AdmissionDecisionArtifactPayload;
  readonly precedenceDecision: PrecedenceDecision;
}): Promise<void> {
  await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "intent",
    decision: baseAdmissionDecision({
      runId: input.runId,
      gate: "intent",
      outcome: input.admissionDecision.decision,
      precedenceDecision: input.precedenceDecision,
      evidence: intentAdmissionEvidence(input.admissionDecision)
    })
  });
}

interface RepoRuntimeAdmission {
  readonly cloneDir: string;
  readonly policy: RepoRuntimePolicy;
}

interface RepoRuntimeDecisionEvidence {
  readonly workspaceRoot: string;
  readonly auth: CloneResult["auth"];
  readonly effectiveAllowlist: readonly string[];
  readonly symlinkRefusal?: {
    readonly offendingPaths: readonly string[];
  };
  readonly dirtyWorktree?: {
    readonly isDirty: boolean;
    readonly dirtyFiles: readonly string[];
  };
  readonly errors?: readonly string[];
  readonly patchResults: readonly [];
  readonly subprocessRecords: readonly [];
}

async function admitRepoRuntime(input: {
  readonly projectRoot: string;
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly intent: ConfirmedIntent;
  readonly precedenceDecision: PrecedenceDecision;
}): Promise<RepoRuntimeAdmission> {
  const policyResult = await loadRepoRuntimePolicy(input.projectRoot);
  const runtimePolicyResult = repoRuntimePolicyCompatibility(policyResult);
  if (!runtimePolicyResult.ok) {
    const reason = `repo-policy-load-failed: ${runtimePolicyResult.errors.join("; ")}`;
    await writeRepoRuntimeAdmissionDecision({
      runDir: input.runDir,
      runId: input.runId,
      outcome: "block",
      precedenceDecision: input.precedenceDecision,
      evidence: repoRuntimeEvidence({
        workspaceRoot: input.projectRoot,
        policy: undefined,
        auth: { mode: "anonymous" },
        errors: runtimePolicyResult.errors
      })
    });
    await writeRefusalArtifacts({
      runDir: input.runDir,
      outDir: input.outDir,
      runId: input.runId,
      stage: "repo-runtime",
      reason,
      refusalArtifact: "repo-runtime-admission-decision.json"
    });
    throw new CliExitError(reason, 1);
  }

  const policy = runtimePolicyResult.policy;
  const cloneDir = resolve(policy.workspaceRoot ?? join(input.projectRoot, ".protostar", "workspaces"), input.runId);
  let cloneResult: CloneResult;
  try {
    await cleanupWorkspace(cloneDir, input.runId, { reason: "success" });
    cloneResult = await cloneWorkspace({
      url: pathToFileURL(input.projectRoot).href,
      dir: cloneDir,
      depth: 1
    });
  } catch (error: unknown) {
    const reason = repoRuntimeErrorReason("clone-failed", error);
    await writeRepoRuntimeAdmissionDecision({
      runDir: input.runDir,
      runId: input.runId,
      outcome: "block",
      precedenceDecision: input.precedenceDecision,
      evidence: repoRuntimeEvidence({
        workspaceRoot: cloneDir,
        policy,
        auth: authEvidenceForCloneFailure(error),
        errors: [reason]
      })
    });
    await writeRefusalArtifacts({
      runDir: input.runDir,
      outDir: input.outDir,
      runId: input.runId,
      stage: "repo-runtime",
      reason,
      refusalArtifact: "repo-runtime-admission-decision.json"
    });
    await cleanupWorkspace(cloneDir, input.runId, {
      reason: "failure",
      tombstoneRetentionHours: policy.tombstoneRetentionHours,
      errorMessage: reason
    });
    throw new CliExitError(reason, 1);
  }

  if (!cloneResult.symlinkAudit.ok) {
    const reason = `symlinks-refused: ${cloneResult.symlinkAudit.offendingPaths.join(", ")}`;
    await writeRepoRuntimeAdmissionDecision({
      runDir: input.runDir,
      runId: input.runId,
      outcome: "block",
      precedenceDecision: input.precedenceDecision,
      evidence: repoRuntimeEvidence({
        workspaceRoot: cloneResult.dir,
        policy,
        auth: cloneResult.auth,
        symlinkRefusal: { offendingPaths: cloneResult.symlinkAudit.offendingPaths }
      })
    });
    await writeRefusalArtifacts({
      runDir: input.runDir,
      outDir: input.outDir,
      runId: input.runId,
      stage: "repo-runtime",
      reason,
      refusalArtifact: "repo-runtime-admission-decision.json"
    });
    await cleanupWorkspace(cloneDir, input.runId, {
      reason: "failure",
      tombstoneRetentionHours: policy.tombstoneRetentionHours,
      errorMessage: reason
    });
    throw new CliExitError(reason, 1);
  }

  const dirtyStatus = await dirtyWorktreeStatus(cloneResult.dir);
  const allowDirty = input.intent.capabilityEnvelope.workspace?.allowDirty === true;
  if (dirtyStatus.isDirty && !allowDirty) {
    const reason = `dirty-worktree-refused: ${dirtyStatus.dirtyFiles.join(", ")}`;
    await writeRepoRuntimeAdmissionDecision({
      runDir: input.runDir,
      runId: input.runId,
      outcome: "block",
      precedenceDecision: input.precedenceDecision,
      evidence: repoRuntimeEvidence({
        workspaceRoot: cloneResult.dir,
        policy,
        auth: cloneResult.auth,
        dirtyWorktree: dirtyStatus
      })
    });
    await writeRefusalArtifacts({
      runDir: input.runDir,
      outDir: input.outDir,
      runId: input.runId,
      stage: "repo-runtime",
      reason,
      refusalArtifact: "repo-runtime-admission-decision.json"
    });
    await cleanupWorkspace(cloneDir, input.runId, {
      reason: "failure",
      tombstoneRetentionHours: policy.tombstoneRetentionHours,
      errorMessage: reason
    });
    throw new CliExitError(reason, 1);
  }

  await writeRepoRuntimeAdmissionDecision({
    runDir: input.runDir,
    runId: input.runId,
    outcome: "allow",
    precedenceDecision: input.precedenceDecision,
    evidence: repoRuntimeEvidence({
      workspaceRoot: cloneResult.dir,
      policy,
      auth: cloneResult.auth,
      symlinkRefusal: { offendingPaths: [] },
      dirtyWorktree: dirtyStatus
    })
  });

  return { cloneDir, policy };
}

function repoRuntimeEvidence(input: {
  readonly workspaceRoot: string;
  readonly policy: RepoRuntimePolicy | undefined;
  readonly auth: CloneResult["auth"];
  readonly symlinkRefusal?: RepoRuntimeDecisionEvidence["symlinkRefusal"];
  readonly dirtyWorktree?: RepoRuntimeDecisionEvidence["dirtyWorktree"];
  readonly errors?: readonly string[];
}): RepoRuntimeDecisionEvidence {
  return {
    workspaceRoot: input.workspaceRoot,
    auth: input.auth,
    effectiveAllowlist: intersectAllowlist(input.policy?.commandAllowlist),
    ...(input.symlinkRefusal !== undefined ? { symlinkRefusal: input.symlinkRefusal } : {}),
    ...(input.dirtyWorktree !== undefined ? { dirtyWorktree: input.dirtyWorktree } : {}),
    ...(input.errors !== undefined ? { errors: input.errors } : {}),
    patchResults: [],
    subprocessRecords: []
  };
}

function repoRuntimePolicyCompatibility(
  result: Awaited<ReturnType<typeof loadRepoRuntimePolicy>>
): Awaited<ReturnType<typeof loadRepoRuntimePolicy>> {
  if (result.ok || !result.errors.every(isAuthorityRepoPolicyKeyError)) {
    return result;
  }
  return { ok: true, policy: DEFAULT_REPO_POLICY };
}

function isAuthorityRepoPolicyKeyError(error: string): boolean {
  return error === "repoScopes is not allowed." ||
    error === "toolPermissions is not allowed." ||
    error === "trustOverride is not allowed.";
}

async function writeRepoRuntimeAdmissionDecision(input: {
  readonly runDir: string;
  readonly runId: string;
  readonly outcome: AdmissionDecisionBase<RepoRuntimeDecisionEvidence>["outcome"];
  readonly precedenceDecision: PrecedenceDecision;
  readonly evidence: RepoRuntimeDecisionEvidence;
}): Promise<void> {
  await writeAdmissionDecision({
    runDir: input.runDir,
    gate: "repo-runtime",
    decision: baseAdmissionDecision({
      runId: input.runId,
      gate: "repo-runtime",
      outcome: input.outcome,
      precedenceDecision: input.precedenceDecision,
      evidence: input.evidence
    })
  });
}

function authEvidenceForCloneFailure(error: unknown): CloneResult["auth"] {
  if (error instanceof CredentialRefusedError) {
    return { mode: "credentialRef", credentialRef: error.credentialRef };
  }
  return { mode: "anonymous" };
}

function repoRuntimeErrorReason(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `${prefix}: ${message}`;
}

function baseAdmissionDecision<E extends object>(input: {
  readonly runId: string;
  readonly gate: AdmissionDecisionBase<E>["gate"];
  readonly outcome: AdmissionDecisionBase<E>["outcome"];
  readonly precedenceDecision: PrecedenceDecision;
  readonly evidence: E;
}): AdmissionDecisionBase<E> {
  return {
    schemaVersion: "1.0.0",
    runId: input.runId,
    gate: input.gate,
    outcome: input.outcome,
    timestamp: new Date().toISOString(),
    precedenceResolution: {
      status: input.precedenceDecision.status,
      ...(input.precedenceDecision.status !== "no-conflict"
        ? { precedenceDecisionPath: resolve("precedence-decision.json") }
        : {})
    },
    evidence: input.evidence
  };
}

function intentAdmissionEvidence(admissionDecision: AdmissionDecisionArtifactPayload): object {
  return {
    ambiguityScore: admissionDecision.details.ambiguity.ambiguity,
    admissionStage: "intent",
    ...admissionDecision
  };
}

function noConflictPrecedenceDecisionForDraft(): PrecedenceDecision {
  return {
    schemaVersion: "1.0.0",
    status: "no-conflict",
    resolvedEnvelope: { repoScopes: [], toolPermissions: [], budget: {} },
    tiers: [],
    blockedBy: []
  } as unknown as PrecedenceDecision;
}

function stripSignature(intent: ConfirmedIntent): object {
  const { signature: _signature, ...intentBody } = intent;
  return intentBody;
}

function readCandidateCount(planningAdmission: PlanningAdmissionAcceptedArtifactPayload): number {
  const candidateAdmissionSummary = (planningAdmission as { readonly candidateAdmissionSummary?: { readonly candidateCount?: unknown } })
    .candidateAdmissionSummary;
  return typeof candidateAdmissionSummary?.candidateCount === "number"
    ? candidateAdmissionSummary.candidateCount
    : 1;
}

async function writePlanningAdmissionArtifacts(input: {
  readonly runDir: string;
  readonly plan?: AdmittedPlanRecord;
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
  readonly outDir: string;
  readonly runId: string;
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

  const reason = formatPlanningPreAdmissionFailure(planningAdmission);
  await writeRefusalArtifacts({
    runDir: input.runDir,
    outDir: input.outDir,
    runId: input.runId,
    stage: "planning",
    reason,
    refusalArtifact: PLANNING_ADMISSION_ARTIFACT_NAME
  });

  throw new Error(reason);
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

// Phase 6 Plan 06-10 — work-slicing trigger orchestrator (PILE-03 #1).
// Invokes the exec-coord pile in work-slicing mode after planning admission
// when (a) pileModes.executionCoordination === "live" and (b) the heuristic
// trips. On admission success, returns a NEW AdmittedPlanningOutput pointing
// at the sliced plan with a freshly-persisted planning-admission.json. On
// any failure (pile-* or admission-rejected) the seam HARD-blocks the run
// per Q-06 — no deterministic alternative exists for the work-slicing path.
async function maybeApplyWorkSlicingPile(input: {
  readonly admittedPlan: AdmittedPlanRecord;
  readonly persistedPlanningAdmission: PlanningAdmissionAcceptedArtifactPayload;
  readonly planningAdmissionArtifact: PersistedPlanningAdmissionArtifactRef;
  readonly pileModes: Readonly<Record<FactoryCliPileKind, PileMode>>;
  readonly factoryConfig: Awaited<ReturnType<typeof loadFactoryConfig>>;
  readonly intent: ConfirmedIntent;
  readonly runAbortController: AbortController;
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly runFactoryPile: FactoryCompositionDependencies["runFactoryPile"];
}): Promise<AdmittedPlanningOutput> {
  const baseline: AdmittedPlanningOutput = {
    admittedPlan: input.admittedPlan,
    planningAdmission: input.persistedPlanningAdmission,
    planningAdmissionArtifact: input.planningAdmissionArtifact
  };
  if (input.pileModes.executionCoordination !== "live") return baseline;
  const heuristicCfg = {
    maxTargetFiles:
      input.factoryConfig.config.piles?.executionCoordination?.workSlicing?.maxTargetFiles
        ?? DEFAULT_WORK_SLICING_HEURISTIC.maxTargetFiles,
    maxEstimatedTurns:
      input.factoryConfig.config.piles?.executionCoordination?.workSlicing?.maxEstimatedTurns
        ?? DEFAULT_WORK_SLICING_HEURISTIC.maxEstimatedTurns
  };
  if (!shouldInvokeWorkSlicing(input.admittedPlan, heuristicCfg)) return baseline;

  const workSlicingResult = await invokeWorkSlicingPile(
    input.intent,
    input.admittedPlan,
    input.persistedPlanningAdmission,
    0,
    {
      runFactoryPile: input.runFactoryPile,
      buildContext: () => buildExecCoordPileContext({
        factoryConfig: input.factoryConfig,
        intent: input.intent,
        signal: input.runAbortController.signal
      }),
      persist: async ({ outcome, iteration, refusal }) => {
        await writePileArtifacts({
          runDir: input.runDir,
          runId: input.runId,
          kind: "execution-coordination",
          iteration,
          outcome,
          ...(refusal !== undefined
            ? {
                refusal: {
                  reason: refusal.reason,
                  stage: "pile-execution-coordination",
                  sourceOfTruth: "ExecutionCoordinationPileResult"
                }
              }
            : {})
        });
      }
    }
  );
  if (!workSlicingResult.ok) {
    const reason = `Work-slicing pile failure: ${workSlicingResult.reason}`;
    await writeRefusalArtifacts({
      runDir: input.runDir,
      outDir: input.outDir,
      runId: input.runId,
      stage: "pile-execution-coordination",
      reason,
      refusalArtifact: `piles/execution-coordination/iter-0/refusal.json`
    });
    throw new CliExitError(reason, 1);
  }
  // Sliced plan admitted. Reconstruct the planningAdmission payload by
  // re-running admitCandidatePlan against the sliced plan (admitWorkSlicing
  // already validated; this call only produces a fresh planning-admission
  // payload with matching plan_hash + validators_passed for the handoff).
  const reAdmission = admitCandidatePlan({
    graph: workSlicingResult.admittedPlan as unknown as Parameters<typeof admitCandidatePlan>[0]["graph"],
    intent: input.intent,
    planGraphUri: "plan.json"
  });
  if (!reAdmission.ok) {
    const reason = `Re-admission of sliced plan failed: ${reAdmission.errors.join("; ")}`;
    throw new CliExitError(reason, 1);
  }
  const newArtifact = await writePlanningAdmissionArtifacts({
    runDir: input.runDir,
    plan: workSlicingResult.admittedPlan,
    planningAdmission: reAdmission.planningAdmission
  });
  const rePersisted = await readPersistedPlanningAdmissionArtifact(input.runDir);
  assertAcceptedPlanningAdmissionArtifact(rePersisted);
  return {
    admittedPlan: workSlicingResult.admittedPlan,
    planningAdmission: rePersisted,
    planningAdmissionArtifact: newArtifact
  };
}

// Phase 6 Plan 06-10 — shared context builder for the execution-coordination
// pile invocations (work-slicing + repair-plan-refinement). Mirrors the
// inline planning/review context construction so the exec-coord pile shares
// the same provider, run-level abort signal, and budget-clamping discipline.
function buildExecCoordPileContext(input: {
  readonly factoryConfig: { readonly config: { readonly adapters: { readonly coder: { readonly baseUrl: string; readonly model: string; readonly apiKeyEnv: string } } } };
  readonly intent: ConfirmedIntent;
  readonly signal: AbortSignal;
}): PileRunContext {
  return {
    provider: createOpenAICompatibleProvider({
      baseURL: input.factoryConfig.config.adapters.coder.baseUrl,
      apiKey: process.env[input.factoryConfig.config.adapters.coder.apiKeyEnv] ?? "lm-studio",
      model: input.factoryConfig.config.adapters.coder.model
    }),
    signal: input.signal,
    budget: resolvePileBudget(
      executionCoordinationPilePreset.budget,
      input.intent.capabilityEnvelope.budget
    ),
    now: () => Date.now()
  };
}

// Phase 6 Plan 06-07 — turn a PileFailure into a one-line operator-readable
// reason for refusal artifacts and CLI stderr (Q-12 evidence-bearing refusals).
function formatPileFailureReason(failure: PileFailure): string {
  switch (failure.class) {
    case "pile-timeout":
      return `pile-timeout: ${failure.kind} pile elapsed ${failure.elapsedMs}ms (configured timeout ${failure.configuredTimeoutMs}ms)`;
    case "pile-budget-exhausted":
      return `pile-budget-exhausted: ${failure.kind} consumed ${failure.consumed}/${failure.cap} ${failure.dimension}`;
    case "pile-schema-parse":
      return `pile-schema-parse: ${failure.sourceOfTruth} parse errors: ${failure.parseErrors.join("; ")}`;
    case "pile-all-rejected":
      return `pile-all-rejected: ${failure.kind} evaluated ${failure.candidatesEvaluated} candidates`;
    case "pile-network":
      return `pile-network: ${failure.lastError.code} ${failure.lastError.message}`;
    case "pile-cancelled":
      return `pile-cancelled: ${failure.kind} (${failure.reason})`;
  }
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
  if (flags.intent !== undefined) {
    return {
      type: "error",
      message:
        "The --intent flag is no longer supported. Provide an IntentDraft via --intent-draft <path> or --draft <path>; ConfirmedIntent values can only originate from the draft admission gate."
    };
  }
  if (!draftPath) {
    return {
      type: "error",
      message: "Missing required --intent-draft <path> or --draft <path>."
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
  const executor = parseExecutor(flags.executor);
  if (!executor.ok) {
    return {
      type: "error",
      message: executor.error
    };
  }
  const allowedAdapters = parseAllowedAdapters(flags.allowedAdapters);

  return {
    type: "run",
    options: {
      intentDraftPath: draftPath as string,
      outDir: flags.out,
      planningFixturePath: flags.planningFixture ?? "examples/planning-results/scaffold.json",
      failTaskIds: parseFailTaskIds(flags.failTaskIds),
      intentMode: intentMode.mode,
      ...(confirmedIntentOutputPathValidation.path !== undefined
        ? { confirmedIntentOutputPath: confirmedIntentOutputPathValidation.path }
        : {}),
      ...(flags.confirmedIntent !== undefined ? { confirmedIntent: flags.confirmedIntent } : {}),
      ...(flags.runId !== undefined ? { runId: flags.runId } : {}),
      trust: flags.trust,
      executor: executor.value,
      ...(allowedAdapters !== undefined ? { allowedAdapters } : {}),
      ...(flags.planningMode !== undefined ? { planningMode: flags.planningMode } : {}),
      ...(flags.reviewMode !== undefined ? { reviewMode: flags.reviewMode } : {}),
      ...(flags.execCoordMode !== undefined ? { execCoordMode: flags.execCoordMode } : {})
    }
  };
}

async function writeTwoKeyLaunchRefusalArtifacts(input: {
  readonly runDir: string;
  readonly outDir: string;
  readonly runId: string;
  readonly refusal: TwoKeyLaunchRefusal;
}): Promise<void> {
  await mkdir(input.runDir, { recursive: true });
  await writeJson(resolve(input.runDir, "trust-refusal.json"), {
    schemaVersion: "1.0.0",
    artifact: "trust-refusal.json",
    runId: input.runId,
    stage: "workspace-trust",
    reason: input.refusal.reason,
    missingFlag: input.refusal.missingFlag,
    provided: input.refusal.provided
  });
  await writeRefusalArtifacts({
    runDir: input.runDir,
    outDir: input.outDir,
    runId: input.runId,
    stage: "workspace-trust",
    reason: input.refusal.reason,
    refusalArtifact: "trust-refusal.json"
  });
}

function createLaunchRefusalRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `run_${timestamp}_workspace_trust`;
}

class CliExitError extends Error {
  constructor(
    message: string,
    readonly exitCode: number
  ) {
    super(message);
  }
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

function parseFlags(args: readonly string[]): ParsedCliArgs | string {
  try {
    return parseCliArgs(args);
  } catch (error: unknown) {
    if (error instanceof ArgvError) {
      return error.message;
    }
    throw error;
  }
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

function parseExecutor(value: string | undefined):
  | { readonly ok: true; readonly value: "dry-run" | "real" }
  | { readonly ok: false; readonly error: string } {
  if (value === undefined || value === "dry-run") {
    return { ok: true, value: "dry-run" };
  }
  if (value === "real") {
    return { ok: true, value: "real" };
  }
  return { ok: false, error: "--executor must be dry-run or real." };
}

function parseAllowedAdapters(value: string | undefined): readonly string[] | undefined {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
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
    `  ${executable} run (--intent-draft <path> | --draft <path>) --out <dir> [--confirmed-intent-output <confirmed-intent.json|intent.json>] [--planning-fixture <path>] [--intent-mode <mode>] [--fail-task-ids <ids>] [--run-id <id>]`,
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
    process.exitCode = error instanceof CliExitError ? error.exitCode : 1;
  });
}
