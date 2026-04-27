import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assessConfirmedIntentAmbiguity,
  parseConfirmedIntent,
  type IntentAmbiguityAssessment,
  type IntentAmbiguityMode,
  type IntentDraft
} from "@protostar/intent";

import { promoteIntentDraft, type PromoteIntentDraftResult } from "./index.js";

export const EXAMPLE_INTENT_FIXTURE_CONFIRMED_AT = "2026-04-25T00:00:00.000Z";

const policyDistDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(policyDistDir, "../../..");

export const EXAMPLE_INTENT_FIXTURE_DIR = resolve(repoRoot, "examples/intents");

export type ExampleIntentFixtureKind = "draft" | "confirmed-intent" | "ambiguity-assessment";

export interface ExampleIntentFixtureAmbiguityStatusExpectation {
  readonly mode?: IntentAmbiguityMode;
  readonly threshold?: number;
  readonly expectedAccepted?: boolean;
  readonly expectedScore?: number;
  readonly structurallyMissingDimensions?: readonly string[];
}

export interface ExampleIntentFixtureCapabilityEnvelopeExpectation {
  readonly status?: string;
  readonly goalArchetype?: string;
  readonly policyStatus?: string;
  readonly blockingFindings?: readonly string[];
  readonly unresolvedFindings?: readonly unknown[];
  readonly sourceFixture?: string;
  readonly missingFields?: readonly string[];
}

export interface ExampleIntentFixtureAdmissionExpectation {
  readonly expectedAdmissionOutcome?: string;
  readonly expectedAmbiguityStatus?: ExampleIntentFixtureAmbiguityStatusExpectation;
  readonly expectedCapabilityEnvelopeResult?: ExampleIntentFixtureCapabilityEnvelopeExpectation;
}

export interface LoadedExampleIntentFixture {
  readonly path: string;
  readonly relativePath: string;
  readonly kind: ExampleIntentFixtureKind;
  readonly value: unknown;
  readonly expectation?: ExampleIntentFixtureAdmissionExpectation;
}

export interface DraftExampleIntentAdmissionFixture {
  readonly kind: "draft";
  readonly fixture: LoadedExampleIntentFixture;
  readonly mode: IntentAmbiguityMode;
  readonly draft: IntentDraft;
  readonly promotion: PromoteIntentDraftResult;
  readonly ambiguityAssessment: IntentAmbiguityAssessment;
}

export interface ConfirmedExampleIntentAdmissionFixture {
  readonly kind: "confirmed-intent";
  readonly fixture: LoadedExampleIntentFixture;
  readonly mode: IntentAmbiguityMode;
  readonly parseResult: ReturnType<typeof parseConfirmedIntent>;
  readonly ambiguityAssessment?: IntentAmbiguityAssessment;
}

export interface AmbiguityAssessmentExampleIntentFixture {
  readonly kind: "ambiguity-assessment";
  readonly fixture: LoadedExampleIntentFixture;
  readonly mode: IntentAmbiguityMode;
  readonly assessment: IntentAmbiguityAssessmentFixture;
}

export type ExampleIntentAdmissionFixture =
  | DraftExampleIntentAdmissionFixture
  | ConfirmedExampleIntentAdmissionFixture
  | AmbiguityAssessmentExampleIntentFixture;

export interface IntentAmbiguityAssessmentFixture {
  readonly mode: IntentAmbiguityMode;
  readonly threshold: number;
  readonly ambiguity: number;
  readonly accepted: boolean;
  readonly scores: readonly unknown[];
  readonly missingFields: readonly string[];
  readonly requiredClarifications: readonly string[];
  readonly structurallyMissingDimensions: readonly string[];
}

export async function loadExampleIntentAdmissionFixtures(input?: {
  readonly fixtureDir?: string;
}): Promise<readonly LoadedExampleIntentFixture[]> {
  const fixtureDir = input?.fixtureDir ?? EXAMPLE_INTENT_FIXTURE_DIR;
  const fixturePaths = await listJsonFiles(fixtureDir);

  return Promise.all(
    fixturePaths.map(async (path): Promise<LoadedExampleIntentFixture> => {
      const value = JSON.parse(await readFile(path, "utf8"));
      const expectation = readAdmissionExpectation(value);

      return {
        path,
        relativePath: toPosixPath(relative(fixtureDir, path)),
        kind: classifyExampleIntentFixture(path, value),
        value,
        ...(expectation === undefined ? {} : { expectation })
      };
    })
  );
}

export async function loadAndAdmitExampleIntentFixtures(input?: {
  readonly fixtureDir?: string;
  readonly confirmedAt?: string;
}): Promise<readonly ExampleIntentAdmissionFixture[]> {
  const fixtures = await loadExampleIntentAdmissionFixtures(input);

  return fixtures.map((fixture) =>
    admitExampleIntentFixture(
      fixture,
      input?.confirmedAt === undefined
        ? undefined
        : {
            confirmedAt: input.confirmedAt
          }
    )
  );
}

export function admitExampleIntentFixture(
  fixture: LoadedExampleIntentFixture,
  input?: {
    readonly confirmedAt?: string;
  }
): ExampleIntentAdmissionFixture {
  const mode = resolveExampleIntentFixtureMode(fixture);

  if (fixture.kind === "draft") {
    const draft = fixture.value as IntentDraft;
    const promotion = promoteIntentDraft({
      draft,
      mode,
      confirmedAt: input?.confirmedAt ?? EXAMPLE_INTENT_FIXTURE_CONFIRMED_AT
    });

    return {
      kind: "draft",
      fixture,
      mode,
      draft,
      promotion,
      ambiguityAssessment: promotion.ambiguityAssessment
    };
  }

  if (fixture.kind === "confirmed-intent") {
    const parseResult = parseConfirmedIntent(fixture.value);

    if (parseResult.ok) {
      return {
        kind: "confirmed-intent",
        fixture,
        mode,
        parseResult,
        ambiguityAssessment: assessConfirmedIntentAmbiguity(parseResult.data, {
          mode
        })
      };
    }

    return {
      kind: "confirmed-intent",
      fixture,
      mode,
      parseResult
    };
  }

  return {
    kind: "ambiguity-assessment",
    fixture,
    mode,
    assessment: parseIntentAmbiguityAssessmentFixture(fixture.value)
  };
}

export function resolveExampleIntentFixtureMode(fixture: LoadedExampleIntentFixture): IntentAmbiguityMode {
  const expectedMode = fixture.expectation?.expectedAmbiguityStatus?.mode;
  if (isIntentAmbiguityMode(expectedMode)) {
    return expectedMode;
  }

  if (isRecord(fixture.value) && isIntentAmbiguityMode(fixture.value["mode"])) {
    return fixture.value["mode"];
  }

  return "brownfield";
}

function classifyExampleIntentFixture(path: string, value: unknown): ExampleIntentFixtureKind {
  if (isRecord(value) && value["draftId"] !== undefined) {
    return "draft";
  }
  if (path.endsWith(".draft.json")) {
    return "draft";
  }
  if (path.includes(".ambiguity.") || readFixtureKind(value) === "ambiguity-assessment") {
    return "ambiguity-assessment";
  }

  return "confirmed-intent";
}

function parseIntentAmbiguityAssessmentFixture(value: unknown): IntentAmbiguityAssessmentFixture {
  if (!isRecord(value)) {
    throw new Error("Ambiguity assessment fixture must be a JSON object.");
  }

  const mode = value["mode"];
  if (!isIntentAmbiguityMode(mode)) {
    throw new Error("Ambiguity assessment fixture mode must be greenfield or brownfield.");
  }

  const threshold = value["threshold"];
  const ambiguity = value["ambiguity"];
  const accepted = value["accepted"];
  const scores = value["scores"];
  const missingFields = value["missingFields"];
  const requiredClarifications = value["requiredClarifications"];
  const structurallyMissingDimensions = value["structurallyMissingDimensions"];

  if (
    typeof threshold !== "number" ||
    typeof ambiguity !== "number" ||
    typeof accepted !== "boolean" ||
    !Array.isArray(scores) ||
    !isStringArray(missingFields) ||
    !isStringArray(requiredClarifications) ||
    !isStringArray(structurallyMissingDimensions)
  ) {
    throw new Error("Ambiguity assessment fixture is missing required scorer fields.");
  }

  return {
    mode,
    threshold,
    ambiguity,
    accepted,
    scores,
    missingFields,
    requiredClarifications,
    structurallyMissingDimensions
  };
}

async function listJsonFiles(dir: string): Promise<readonly string[]> {
  const entries = await readdir(dir, {
    withFileTypes: true
  });
  const files = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonFiles(path);
      }
      return entry.isFile() && entry.name.endsWith(".json") ? [path] : [];
    })
  );

  return files.flat().sort((left, right) => left.localeCompare(right));
}

function readAdmissionExpectation(value: unknown): ExampleIntentFixtureAdmissionExpectation | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const metadata = value["metadata"];
  if (!isRecord(metadata)) {
    return undefined;
  }
  const expectation = metadata["admissionExpectation"];
  if (!isRecord(expectation)) {
    return undefined;
  }

  return expectation as unknown as ExampleIntentFixtureAdmissionExpectation;
}

function readFixtureKind(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const metadata = value["metadata"];
  if (!isRecord(metadata)) {
    return undefined;
  }
  const fixtureKind = metadata["fixtureKind"];
  return typeof fixtureKind === "string" ? fixtureKind : undefined;
}

function isIntentAmbiguityMode(value: unknown): value is IntentAmbiguityMode {
  return value === "greenfield" || value === "brownfield";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}
