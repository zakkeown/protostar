import type { ConfiguredModelProvider } from "@protostar/dogpile-types";
import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlan } from "@protostar/planning";
import type { JudgeCritique, ReviewGate } from "@protostar/review";
import {
  buildEvaluationMission,
  EVAL_CONSENSUS_AGENT_DEFAULT,
  evaluationPilePreset,
  runFactoryPile,
  type FactoryPileMission,
  type PileFailure,
  type PileRunContext,
  type PileRunOutcome,
  type ResolvedPileBudget
} from "@protostar/dogpile-adapter";
import {
  computeMechanicalScores,
  computeSemanticConfidence,
  createEvaluationReport,
  createSpecOntologySnapshot,
  decideEvolution,
  evaluateConsensus,
  parseEvaluationPileResult,
  shouldRunConsensus,
  T_CONF,
  T_MEAN_DIMS,
  T_MEAN_JUDGES,
  T_MIN_DIMS,
  T_MIN_JUDGES,
  type ConsensusEvalResult,
  type EvaluationJudgeCritique,
  type EvaluationReport,
  type EvolutionDecision,
  type JudgePerDimensionScores,
  type MechanicalEvalResult,
  type OntologySnapshot,
  type SemanticEvalResult
} from "@protostar/evaluation";

export type SnapshotReader = (lineageId: string) => Promise<OntologySnapshot | undefined>;

export interface RunEvaluationStagesInput {
  readonly runId: string;
  readonly intent: ConfirmedIntent;
  readonly plan: AdmittedPlan;
  readonly reviewGate: ReviewGate;
  readonly diffNameOnly: readonly string[];
  readonly executionEvidence: {
    readonly buildExitCode?: number;
    readonly lintExitCode?: number;
    readonly stdoutTail?: string;
  };
  readonly archetype: "cosmetic-tweak" | "feature-add" | "refactor" | "bugfix";
  readonly providers: {
    readonly semantic: ConfiguredModelProvider;
    readonly consensus: ConfiguredModelProvider;
  };
  readonly signal: AbortSignal;
  readonly budget: ResolvedPileBudget;
  readonly snapshotReader: SnapshotReader;
  readonly lineageId: string;
  readonly generation: number;
  readonly convergenceThreshold?: number;
}

export interface RunEvaluationStagesResult {
  readonly report: EvaluationReport;
  readonly evolutionDecision: EvolutionDecision;
  readonly snapshot: OntologySnapshot;
  readonly mechanical: MechanicalEvalResult;
  readonly semantic?: SemanticEvalResult;
  readonly consensus?: ConsensusEvalResult;
  readonly refusal?: PileFailure;
}

export interface RunEvaluationStagesDeps {
  readonly runFactoryPile?: typeof runFactoryPile;
}

export async function runEvaluationStages(
  input: RunEvaluationStagesInput,
  deps: RunEvaluationStagesDeps = {}
): Promise<RunEvaluationStagesResult> {
  const runPile = deps.runFactoryPile ?? runFactoryPile;
  const mechanical = buildMechanicalResult(input);
  const semanticMission = buildEvaluationMission(input);
  const semanticOutcome = await callPile(runPile, semanticMission, input.providers.semantic, input);
  const snapshot = buildSnapshot(input);
  const evolutionDecision = await buildEvolutionDecision(input, snapshot);

  if (!semanticOutcome.ok) {
    const semantic = syntheticSemanticFailure();
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic,
      refusal: semanticOutcome.failure
    };
  }

  const semanticParsed = parseEvaluationPileResult(semanticOutcome.result.output);
  if (!semanticParsed.ok) {
    const semantic = syntheticSemanticFailure();
    const refusal = schemaParseFailure(semanticParsed.errors);
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic,
      refusal
    };
  }
  if (semanticParsed.body.judgeCritiques.length === 0) {
    const semantic = syntheticSemanticFailure();
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic,
      refusal: schemaParseFailure(["judgeCritiques must contain at least one critique"])
    };
  }

  const semantic = buildSemanticResult(semanticParsed.body.judgeCritiques);
  if (!shouldRunConsensus(semantic)) {
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic
    };
  }

  const consensusMission = withConsensusAgent(semanticMission);
  const consensusOutcome = await callPile(runPile, consensusMission, input.providers.consensus, input);
  if (!consensusOutcome.ok) {
    const consensus = syntheticConsensusFailure();
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic, consensus }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic,
      consensus,
      refusal: consensusOutcome.failure
    };
  }

  const consensusParsed = parseEvaluationPileResult(consensusOutcome.result.output);
  if (!consensusParsed.ok) {
    const consensus = syntheticConsensusFailure();
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic, consensus }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic,
      consensus,
      refusal: schemaParseFailure(consensusParsed.errors)
    };
  }
  if (consensusParsed.body.judgeCritiques.length === 0) {
    const consensus = syntheticConsensusFailure();
    return {
      report: createEvaluationReport({ runId: input.runId, mechanical, semantic, consensus }),
      evolutionDecision,
      snapshot,
      mechanical,
      semantic,
      consensus,
      refusal: schemaParseFailure(["judgeCritiques must contain at least one critique"])
    };
  }

  const consensus = evaluateConsensus(toJudgeCritiques(consensusParsed.body.judgeCritiques));
  const refusal = consensus.verdict === "fail"
    ? {
        kind: "evaluation",
        class: "eval-consensus-block",
        breakdown: consensus.breakdown,
        thresholdsHit: consensus.breakdown.thresholdsHit
      } satisfies PileFailure
    : undefined;

  return {
    report: createEvaluationReport({ runId: input.runId, mechanical, semantic, consensus }),
    evolutionDecision,
    snapshot,
    mechanical,
    semantic,
    consensus,
    ...(refusal !== undefined ? { refusal } : {})
  };
}

function buildMechanicalResult(input: RunEvaluationStagesInput): MechanicalEvalResult {
  const scores = input.reviewGate.mechanicalScores;
  if (scores !== undefined) {
    const score = Math.min(scores.build, scores.lint, scores.diffSize, scores.acCoverage);
    return {
      verdict: score >= 0.95 ? "pass" : "fail",
      score,
      scores
    };
  }

  return computeMechanicalScores({
    reviewGate: input.reviewGate,
    archetype: input.archetype,
    buildExitCode: input.executionEvidence.buildExitCode ?? 1,
    lintExitCode: input.executionEvidence.lintExitCode ?? 1,
    diffNameOnly: input.diffNameOnly,
    totalAcCount: input.intent.acceptanceCriteria.length,
    coveredAcCount: input.intent.acceptanceCriteria.length
  });
}

async function callPile(
  runPile: typeof runFactoryPile,
  mission: FactoryPileMission,
  provider: ConfiguredModelProvider,
  input: RunEvaluationStagesInput
): Promise<PileRunOutcome> {
  const ctx: PileRunContext = {
    provider,
    signal: input.signal,
    budget: input.budget,
    onEvent: () => {}
  };
  try {
    return await runPile(mission, ctx);
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "evaluation",
        class: "pile-network",
        attempt: 1,
        lastError: {
          code: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error)
        }
      }
    };
  }
}

function buildSemanticResult(critiques: readonly EvaluationJudgeCritique[]): SemanticEvalResult {
  const judgeMeans = critiques.map(meanRubricScore);
  const score = judgeMeans.length === 0 ? 0 : mean(judgeMeans);
  const confidence = computeSemanticConfidence(toJudgeCritiques(critiques));
  // Semantic pass is intentionally less harsh than consensus: all judges must
  // say pass and the average rubric score must clear 0.5. Low confidence still
  // triggers consensus, where Q-09 applies the doubly-harsh rule.
  const verdict = critiques.every((critique) => critique.verdict === "pass") && score >= 0.5 ? "pass" : "fail";

  return {
    verdict,
    score,
    confidence,
    judges: critiques.map(toJudgeScores)
  };
}

function syntheticSemanticFailure(): SemanticEvalResult {
  return {
    verdict: "fail",
    score: 0,
    confidence: 0,
    judges: []
  };
}

function syntheticConsensusFailure(): ConsensusEvalResult {
  return {
    verdict: "fail",
    score: 0,
    breakdown: {
      judgeMeans: [],
      dimMeans: {
        acMet: 0,
        codeQuality: 0,
        security: 0,
        regressionRisk: 0,
        releaseReadiness: 0
      },
      meanOfJudgeMeans: 0,
      minOfJudgeMeans: 0,
      meanOfDimMeans: 0,
      minOfDimMeans: 0,
      thresholds: {
        tMeanJudges: T_MEAN_JUDGES,
        tMinJudges: T_MIN_JUDGES,
        tMeanDims: T_MEAN_DIMS,
        tMinDims: T_MIN_DIMS
      },
      thresholdsHit: ["meanJudges", "minJudges", "meanDims", "minDims"]
    },
    judges: []
  };
}

function schemaParseFailure(parseErrors: readonly string[]): PileFailure {
  return {
    kind: "evaluation",
    class: "pile-schema-parse",
    sourceOfTruth: "EvaluationResult",
    parseErrors
  };
}

function withConsensusAgent(mission: FactoryPileMission): FactoryPileMission {
  return {
    ...mission,
    preset: {
      ...evaluationPilePreset,
      agents: [...evaluationPilePreset.agents, EVAL_CONSENSUS_AGENT_DEFAULT]
    }
  };
}

function buildSnapshot(input: RunEvaluationStagesInput): OntologySnapshot {
  const snapshot = createSpecOntologySnapshot(input.intent);
  return { ...snapshot, generation: input.generation };
}

async function buildEvolutionDecision(
  input: RunEvaluationStagesInput,
  snapshot: OntologySnapshot
): Promise<EvolutionDecision> {
  const prior = await input.snapshotReader(input.lineageId);
  return decideEvolution({
    current: snapshot,
    ...(prior !== undefined ? { previous: prior } : {}),
    ...(input.convergenceThreshold !== undefined ? { threshold: input.convergenceThreshold } : {})
  });
}

function toJudgeCritiques(critiques: readonly EvaluationJudgeCritique[]): JudgeCritique[] {
  return critiques.map((critique) => ({
    judgeId: critique.judgeId,
    model: critique.model,
    rubric: critique.rubric,
    verdict: critique.verdict === "pass" ? "pass" : "block",
    rationale: critique.rationale,
    taskRefs: []
  }));
}

function toJudgeScores(critique: EvaluationJudgeCritique): JudgePerDimensionScores {
  return {
    judgeId: critique.judgeId,
    model: critique.model,
    rubric: critique.rubric
  };
}

function meanRubricScore(critique: EvaluationJudgeCritique): number {
  return mean(Object.values(critique.rubric));
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}
