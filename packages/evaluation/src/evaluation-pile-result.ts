import { EVALUATION_RUBRIC_DIMENSIONS, type EvaluationRubricDimension } from "./index.js";

export interface EvaluationJudgeCritique {
  readonly judgeId: string;
  readonly model: string;
  readonly rubric: Readonly<Record<EvaluationRubricDimension, number>>;
  readonly verdict: "pass" | "fail";
  readonly rationale: string;
}

export interface EvaluationPileBody {
  readonly judgeCritiques: readonly EvaluationJudgeCritique[];
}

export type EvaluationPileResult =
  | {
      readonly ok: true;
      readonly body: EvaluationPileBody;
    }
  | {
      readonly ok: false;
      readonly errors: readonly string[];
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEvaluationVerdict(value: unknown): value is "pass" | "fail" {
  return value === "pass" || value === "fail";
}

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

function validateRubric(
  rubric: Record<string, unknown>,
  critiquePath: string,
  errors: string[]
): Readonly<Record<EvaluationRubricDimension, number>> | null {
  const allowedKeys = new Set<string>(EVALUATION_RUBRIC_DIMENSIONS);
  const rubricKeys = Object.keys(rubric);
  const unknownKeys = rubricKeys.filter((key) => !allowedKeys.has(key));
  const missingKeys = EVALUATION_RUBRIC_DIMENSIONS.filter((key) => !Object.hasOwn(rubric, key));

  for (const key of unknownKeys) {
    errors.push(`${critiquePath}.rubric unknown rubric key: ${key}`);
  }
  for (const key of missingKeys) {
    errors.push(`${critiquePath}.rubric missing rubric key: ${key}`);
  }

  const values: Partial<Record<EvaluationRubricDimension, number>> = {};
  for (const key of EVALUATION_RUBRIC_DIMENSIONS) {
    const value = rubric[key];
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${critiquePath}.rubric.${key} rubric value not numeric`);
      continue;
    }
    if (value < 0 || value > 1) {
      errors.push(`${critiquePath}.rubric.${key} rubric value out of range`);
    }
    values[key] = value;
  }

  if (unknownKeys.length > 0 || missingKeys.length > 0) {
    return null;
  }

  return values as Readonly<Record<EvaluationRubricDimension, number>>;
}

function validateCritique(value: unknown, index: number, errors: string[]): EvaluationJudgeCritique | null {
  const critiquePath = `judgeCritiques[${index}]`;
  if (!isRecord(value)) {
    errors.push(`${critiquePath} must be object`);
    return null;
  }

  if (typeof value.judgeId !== "string") {
    errors.push(`${critiquePath}.judgeId must be string`);
  }
  if (typeof value.model !== "string") {
    errors.push(`${critiquePath}.model must be string`);
  }
  if (!isEvaluationVerdict(value.verdict)) {
    errors.push(`${critiquePath}.verdict must be pass|fail`);
  }
  if (typeof value.rationale !== "string") {
    errors.push(`${critiquePath}.rationale must be string`);
  }
  if (!isRecord(value.rubric)) {
    errors.push(`${critiquePath}.rubric must be object`);
  }

  const rubric = isRecord(value.rubric) ? validateRubric(value.rubric, critiquePath, errors) : null;
  if (
    typeof value.judgeId !== "string" ||
    typeof value.model !== "string" ||
    !isEvaluationVerdict(value.verdict) ||
    typeof value.rationale !== "string" ||
    rubric === null
  ) {
    return null;
  }

  return {
    judgeId: value.judgeId,
    model: value.model,
    rubric,
    verdict: value.verdict,
    rationale: value.rationale
  };
}

export function parseEvaluationPileResult(jsonText: string): EvaluationPileResult {
  const parsedCandidates: unknown[] = [];
  let directParseError: string | undefined;
  try {
    parsedCandidates.push(JSON.parse(jsonText));
  } catch (error: unknown) {
    directParseError = `JSON.parse: ${error instanceof Error ? error.message : String(error)}`;
    for (const candidate of extractJsonObjectCandidates(jsonText)) {
      try {
        parsedCandidates.push(JSON.parse(candidate));
      } catch {
        // Keep scanning. The returned error remains tied to EvaluationResult.
      }
    }
  }

  if (parsedCandidates.length === 0) {
    return { ok: false, errors: [directParseError ?? "JSON.parse: output is not valid JSON"] };
  }

  const bodies: EvaluationPileBody[] = [];
  const errors: string[] = [];
  for (const parsed of parsedCandidates) {
    const parsedBody = parseEvaluationPileBody(parsed);
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
    body: {
      judgeCritiques: bodies.flatMap((body) => body.judgeCritiques)
    }
  };
}

function parseEvaluationPileBody(parsed: unknown): EvaluationPileResult {
  if (!isRecord(parsed)) {
    return { ok: false, errors: ["root must be object"] };
  }

  const errors: string[] = [];
  const critiques: EvaluationJudgeCritique[] = [];
  if (!Array.isArray(parsed.judgeCritiques)) {
    errors.push("judgeCritiques must be array");
  } else {
    for (let i = 0; i < parsed.judgeCritiques.length; i += 1) {
      const critique = validateCritique(parsed.judgeCritiques[i], i, errors);
      if (critique !== null) {
        critiques.push(critique);
      }
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, body: { judgeCritiques: critiques } };
}
