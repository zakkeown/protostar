/**
 * Phase 6 Plan 06-05 Task 1 — review-pile wire format and parser.
 *
 * Per D-17 (Q-17): each domain owns its pile-output contract; the review-pile
 * result lives in `@protostar/review`. Mirrors `@protostar/planning`'s
 * `PlanningPileResult` / `parsePlanningPileResult` shape so consumers see a
 * symmetric surface across pile kinds.
 *
 * Pure: no I/O, no fs.
 */

import type { JudgeCritique } from "./judge-types.js";
import type { ReviewVerdict } from "./index.js";

export interface PileSource {
  readonly kind: "fixture" | "dogpile";
  readonly uri?: string;
}

export interface ReviewPileResult {
  readonly output: string;
  readonly source?: PileSource;
}

export interface ReviewPileBody {
  readonly judgeCritiques: readonly JudgeCritique[];
  readonly aggregateVerdict: ReviewVerdict;
}

export type ReviewPileParseResult =
  | {
      readonly ok: true;
      readonly body: ReviewPileBody;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

const REVIEW_VERDICTS: readonly ReviewVerdict[] = ["pass", "repair", "block"];

function extractJsonObjectCandidates(text: string): readonly string[] {
  const candidates: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        candidates.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }

  return candidates;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReviewVerdict(value: unknown): value is ReviewVerdict {
  return typeof value === "string" && (REVIEW_VERDICTS as readonly string[]).includes(value);
}

function isPileSource(value: unknown): value is PileSource {
  if (!isRecord(value)) return false;
  if (value.kind !== "fixture" && value.kind !== "dogpile") return false;
  if (value.uri !== undefined && typeof value.uri !== "string") return false;
  return true;
}

export function assertReviewPileResult(value: unknown): asserts value is ReviewPileResult {
  if (!isRecord(value)) {
    throw new Error("Invalid review pile result: value must be an object.");
  }
  if (typeof value.output !== "string") {
    throw new Error("Invalid review pile result: output must be a string.");
  }
  if (value.source !== undefined && !isPileSource(value.source)) {
    throw new Error("Invalid review pile result: source must be { kind: 'fixture'|'dogpile', uri?: string }.");
  }
}

function validateJudgeCritique(value: unknown, index: number, errors: string[]): JudgeCritique | null {
  if (!isRecord(value)) {
    errors.push(`judgeCritiques[${index}] must be an object.`);
    return null;
  }
  if (typeof value.judgeId !== "string") {
    errors.push(`judgeCritiques[${index}].judgeId must be a string.`);
  }
  if (typeof value.verdict !== "string") {
    errors.push(`judgeCritiques[${index}].verdict must be a string.`);
  }
  // Minimal validation per plan acceptance: judgeId + verdict required; other
  // fields preserved if present (Phase 8 will tighten the rubric vocabulary).
  if (errors.length > 0) {
    return null;
  }
  return {
    judgeId: String(value.judgeId),
    model: typeof value.model === "string" ? value.model : "",
    rubric: isRecord(value.rubric)
      ? Object.fromEntries(
          Object.entries(value.rubric).filter((entry): entry is [string, number] => typeof entry[1] === "number")
        )
      : {},
    verdict: isReviewVerdict(value.verdict) ? value.verdict : ("block" as ReviewVerdict),
    rationale: typeof value.rationale === "string" ? value.rationale : "",
    taskRefs: Array.isArray(value.taskRefs)
      ? value.taskRefs.filter((ref): ref is string => typeof ref === "string")
      : []
  };
}

export function parseReviewPileResult(input: ReviewPileResult): ReviewPileParseResult {
  // Tolerate raw inputs that have not yet been asserted; assert here so callers
  // get a single ingress point per the threat model (T-6-03).
  if (typeof input?.output !== "string") {
    return { ok: false, errors: ["output must be a string."] };
  }

  const parsedCandidates: unknown[] = [];
  let directParseError: string | undefined;
  try {
    parsedCandidates.push(JSON.parse(input.output));
  } catch (error: unknown) {
    directParseError = `output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
    for (const candidate of extractJsonObjectCandidates(input.output)) {
      try {
        parsedCandidates.push(JSON.parse(candidate));
      } catch {
        // Keep scanning. The final parse error reports the domain contract, not every brace pair.
      }
    }
  }

  if (parsedCandidates.length === 0) {
    return { ok: false, errors: [directParseError ?? "output is not valid JSON."] };
  }

  const bodies: ReviewPileBody[] = [];
  const errors: string[] = directParseError === undefined ? [] : [];
  for (const parsed of parsedCandidates) {
    const parsedBody = parseReviewPileBody(parsed);
    if (parsedBody.ok) {
      bodies.push(parsedBody.body);
    } else {
      errors.push(...parsedBody.errors);
    }
  }

  if (bodies.length === 0) {
    if (directParseError !== undefined) errors.unshift(directParseError);
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: mergeReviewPileBodies(bodies)
  };
}

function parseReviewPileBody(parsed: unknown): ReviewPileParseResult {
  if (!isRecord(parsed)) {
    return { ok: false, errors: ["output JSON body must be an object."] };
  }

  const errors: string[] = [];
  if (!Array.isArray(parsed.judgeCritiques)) {
    errors.push("body.judgeCritiques must be an array.");
  }
  if (parsed.aggregateVerdict !== undefined && !isReviewVerdict(parsed.aggregateVerdict)) {
    errors.push("body.aggregateVerdict must be one of 'pass' | 'repair' | 'block'.");
  }
  if (parsed.aggregateVerdict === undefined) {
    errors.push("body.aggregateVerdict is required.");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const critiques: JudgeCritique[] = [];
  const critiquesRaw = parsed.judgeCritiques as readonly unknown[];
  for (let i = 0; i < critiquesRaw.length; i += 1) {
    const critiqueErrors: string[] = [];
    const critique = validateJudgeCritique(critiquesRaw[i], i, critiqueErrors);
    if (critique === null) {
      errors.push(...critiqueErrors);
    } else {
      critiques.push(critique);
    }
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    body: {
      judgeCritiques: critiques,
      aggregateVerdict: parsed.aggregateVerdict as ReviewVerdict
    }
  };
}

function mergeReviewPileBodies(bodies: readonly ReviewPileBody[]): ReviewPileBody {
  const judgeCritiques = bodies.flatMap((body) => body.judgeCritiques);
  const verdicts = [
    ...bodies.map((body) => body.aggregateVerdict),
    ...judgeCritiques.map((critique) => critique.verdict)
  ];
  const aggregateVerdict: ReviewVerdict = verdicts.includes("block")
    ? "block"
    : verdicts.includes("repair")
      ? "repair"
      : "pass";

  return { judgeCritiques, aggregateVerdict };
}
