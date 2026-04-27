import type { IntentDraft } from "./models.js";

import type { IntentDraftFieldPath } from "./draft-validation.js";

import { SUPPORTED_GOAL_ARCHETYPES } from "./archetypes.js";

import type { GoalArchetype, IntentArchetypeAutoTagScore, IntentArchetypeAutoTagSignal, IntentArchetypeAutoTagSignalSource, IntentArchetypeAutoTagSuggestion } from "./archetypes.js";

import { isKnownGoalArchetype, normalizeText, roundScore, uniqueBy, uniqueOrdered } from "./admission-shared.js";

export function autoTagIntentDraftArchetype(draft: IntentDraft): IntentArchetypeAutoTagSuggestion {
  const signals = collectIntentArchetypeAutoTagSignals(draft);
  const rawScores = new Map<GoalArchetype, number>(
    SUPPORTED_GOAL_ARCHETYPES.map((archetype) => [archetype, 0])
  );

  for (const signal of signals) {
    rawScores.set(signal.archetype, roundRawScore((rawScores.get(signal.archetype) ?? 0) + signal.weight));
  }

  const maxRawScore = Math.max(...SUPPORTED_GOAL_ARCHETYPES.map((archetype) => rawScores.get(archetype) ?? 0), 0);
  const scoresByPolicyOrder = SUPPORTED_GOAL_ARCHETYPES.map((archetype): IntentArchetypeAutoTagScore => {
    const rawScore = rawScores.get(archetype) ?? 0;

    return {
      archetype,
      score: maxRawScore > 0 ? roundScore(rawScore / Math.max(maxRawScore, 1)) : 0,
      rawScore,
      signals: signals.filter((signal) => signal.archetype === archetype)
    };
  });
  const sortedScores = orderArchetypeAutoTagScores(scoresByPolicyOrder);
  const topScore = sortedScores[0];
  const fallbackScore = scoresByPolicyOrder.find((score) => score.archetype === DEFAULT_INTENT_ARCHETYPE_AUTO_TAG);
  if (topScore === undefined || fallbackScore === undefined) {
    throw new Error("Intent archetype auto-tagging requires at least one supported archetype.");
  }

  const selectedScore = topScore.rawScore > 0 ? topScore : fallbackScore;
  const secondScore = sortedScores.find((score) => score.archetype !== selectedScore.archetype);
  const confidence = selectedScore.rawScore > 0
    ? archetypeAutoTagConfidence(selectedScore, secondScore?.rawScore ?? 0)
    : 0;
  const orderedScores = [
    selectedScore,
    ...sortedScores.filter((score) => score.archetype !== selectedScore.archetype)
  ];

  return {
    archetype: selectedScore.archetype,
    confidence,
    rationale: archetypeAutoTagRationale(selectedScore, confidence),
    scores: orderedScores,
    signals
  };
}

export const proposeIntentDraftArchetype = autoTagIntentDraftArchetype;

const DEFAULT_INTENT_ARCHETYPE_AUTO_TAG: GoalArchetype = "feature-add";

const INTENT_ARCHETYPE_AUTO_TAG_FULL_CONFIDENCE_SCORE = 6;

const INTENT_ARCHETYPE_AUTO_TAG_EXPLICIT_WEIGHT = 6;

interface IntentArchetypeAutoTagRule {
  readonly archetype: GoalArchetype;
  readonly pattern: RegExp;
  readonly weight: number;
}

interface IntentArchetypeAutoTagField {
  readonly source: IntentArchetypeAutoTagSignalSource;
  readonly fieldPath: IntentDraftFieldPath;
  readonly text: string;
  readonly weightMultiplier: number;
}

const INTENT_ARCHETYPE_AUTO_TAG_RULES = [
  {
    archetype: "cosmetic-tweak",
    pattern: /\b(?:cosmetic|polish(?:ing)?|copy|wording|label|text|tooltip|microcopy)\b/i,
    weight: 2.8
  },
  {
    archetype: "cosmetic-tweak",
    pattern: /\b(?:style|css|color|spacing|layout|visual|ui|operator-facing)\b/i,
    weight: 2
  },
  {
    archetype: "bugfix",
    pattern: /\b(?:bug|defect|broken|regression|failure|failing|failed|error|exception|crash|flaky)\b/i,
    weight: 2.6
  },
  {
    archetype: "bugfix",
    pattern: /\b(?:fix|repair|restore|unblock|red test|test failure|incorrect)\b/i,
    weight: 2.2
  },
  {
    archetype: "feature-add",
    pattern: /\b(?:add|adds|adding|create|creates|implement|implements|introduce|support|enable|route|workflow)\b/i,
    weight: 2.2
  },
  {
    archetype: "feature-add",
    pattern: /\b(?:new feature|cli flag|command|endpoint|integration|capability|surface)\b/i,
    weight: 2.4
  },
  {
    archetype: "refactor",
    pattern: /\b(?:refactor|restructure|extract|deduplicate|rename|migrate|simplify|organize)\b/i,
    weight: 2.6
  },
  {
    archetype: "refactor",
    pattern: /\b(?:cleanup|clean up|code debt|architecture|internal|module boundary|package boundary)\b/i,
    weight: 2.1
  },
  {
    archetype: "factory-scaffold",
    pattern: /\b(?:scaffold|bootstrap|control plane|dark software factory|factory)\b/i,
    weight: 3.2
  },
  {
    archetype: "factory-scaffold",
    pattern: /\b(?:monorepo|run manifest|stage composition|intent planning execution review|dogpile)\b/i,
    weight: 2.8
  }
] as const satisfies readonly IntentArchetypeAutoTagRule[];

function collectIntentArchetypeAutoTagSignals(
  draft: IntentDraft
): readonly IntentArchetypeAutoTagSignal[] {
  const signals: IntentArchetypeAutoTagSignal[] = [];
  const explicitArchetype = normalizeText(draft.goalArchetype);

  if (isKnownGoalArchetype(explicitArchetype)) {
    signals.push({
      archetype: explicitArchetype,
      source: "explicit-goal-archetype",
      fieldPath: "goalArchetype",
      matchedText: explicitArchetype,
      weight: INTENT_ARCHETYPE_AUTO_TAG_EXPLICIT_WEIGHT
    });
  }

  for (const field of intentArchetypeAutoTagFields(draft)) {
    for (const rule of INTENT_ARCHETYPE_AUTO_TAG_RULES) {
      const match = rule.pattern.exec(field.text);
      if (match?.[0] === undefined) {
        continue;
      }
      signals.push({
        archetype: rule.archetype,
        source: field.source,
        fieldPath: field.fieldPath,
        matchedText: normalizeMatchedSignalText(match[0]),
        weight: roundRawScore(rule.weight * field.weightMultiplier)
      });
    }
  }

  return stableAutoTagSignals(signals);
}

function intentArchetypeAutoTagFields(draft: IntentDraft): readonly IntentArchetypeAutoTagField[] {
  const fields: IntentArchetypeAutoTagField[] = [];
  pushAutoTagField(fields, "goal-text", "title", draft.title, 1.2);
  pushAutoTagField(fields, "goal-text", "problem", draft.problem, 1);
  pushAutoTagField(fields, "context", "context", draft.context, 0.75);

  draft.acceptanceCriteria?.forEach((criterion, index) => {
    pushAutoTagField(
      fields,
      "acceptance-criteria",
      `acceptanceCriteria.${index}.statement` as IntentDraftFieldPath,
      typeof criterion === "string" ? criterion : criterion.statement ?? criterion.text,
      0.85
    );
  });

  draft.constraints?.forEach((constraint, index) => {
    pushAutoTagField(fields, "constraints", `constraints.${index}` as IntentDraftFieldPath, constraint, 0.75);
  });

  draft.stopConditions?.forEach((condition, index) => {
    pushAutoTagField(fields, "constraints", `stopConditions.${index}` as IntentDraftFieldPath, condition, 0.6);
  });

  draft.capabilityEnvelope?.repoScopes?.forEach((scope, index) => {
    pushAutoTagField(
      fields,
      "capability-envelope",
      `capabilityEnvelope.repoScopes.${index}.path` as IntentDraftFieldPath,
      scope.path,
      0.55
    );
  });

  draft.capabilityEnvelope?.toolPermissions?.forEach((grant, index) => {
    pushAutoTagField(
      fields,
      "capability-envelope",
      `capabilityEnvelope.toolPermissions.${index}.tool` as IntentDraftFieldPath,
      grant.tool,
      0.45
    );
    pushAutoTagField(
      fields,
      "capability-envelope",
      `capabilityEnvelope.toolPermissions.${index}.reason` as IntentDraftFieldPath,
      grant.reason,
      0.55
    );
  });

  return fields;
}

function pushAutoTagField(
  fields: IntentArchetypeAutoTagField[],
  source: IntentArchetypeAutoTagSignalSource,
  fieldPath: IntentDraftFieldPath,
  value: unknown,
  weightMultiplier: number
): void {
  const text = normalizeText(value);
  if (text === undefined) {
    return;
  }

  fields.push({
    source,
    fieldPath,
    text,
    weightMultiplier
  });
}

function stableAutoTagSignals(
  signals: readonly IntentArchetypeAutoTagSignal[]
): readonly IntentArchetypeAutoTagSignal[] {
  return uniqueBy(signals, (signal) =>
    [signal.archetype, signal.source, signal.fieldPath, signal.matchedText].join("|")
  );
}

function orderArchetypeAutoTagScores(
  scores: readonly IntentArchetypeAutoTagScore[]
): readonly IntentArchetypeAutoTagScore[] {
  return [...scores].sort((left, right) =>
    right.rawScore - left.rawScore || archetypePolicyRank(left.archetype) - archetypePolicyRank(right.archetype)
  );
}

function archetypeAutoTagConfidence(
  selectedScore: IntentArchetypeAutoTagScore,
  secondRawScore: number
): number {
  const evidenceConfidence = Math.min(
    selectedScore.rawScore / INTENT_ARCHETYPE_AUTO_TAG_FULL_CONFIDENCE_SCORE,
    1
  );
  const marginConfidence = secondRawScore <= 0
    ? 1
    : Math.max(0, (selectedScore.rawScore - secondRawScore) / selectedScore.rawScore);
  const breadthConfidence = Math.min(selectedScore.signals.length / 3, 1);

  return roundScore((evidenceConfidence * 0.55) + (marginConfidence * 0.3) + (breadthConfidence * 0.15));
}

function archetypeAutoTagRationale(
  selectedScore: IntentArchetypeAutoTagScore,
  confidence: number
): string {
  if (selectedScore.rawScore === 0) {
    return "No deterministic archetype signals were found; feature-add is returned with zero confidence as the generic fallback.";
  }

  const explicit = selectedScore.signals.some((signal) => signal.source === "explicit-goal-archetype");
  const sources = uniqueOrdered(selectedScore.signals.map((signal) => signal.source)).join(", ");

  return explicit
    ? `Selected ${selectedScore.archetype} from the explicit goalArchetype and deterministic ${sources} signals at ${confidence.toFixed(3)} confidence.`
    : `Selected ${selectedScore.archetype} from deterministic ${sources} signals at ${confidence.toFixed(3)} confidence.`;
}

function archetypePolicyRank(archetype: GoalArchetype): number {
  return SUPPORTED_GOAL_ARCHETYPES.indexOf(archetype);
}

function normalizeMatchedSignalText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function roundRawScore(value: number): number {
  return Math.round(value * 1000) / 1000;
}
