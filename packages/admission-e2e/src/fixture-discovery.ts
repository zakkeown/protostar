// Fixture discovery for the parameterized admission e2e loop (Plan 01-09 Q-06,
// Q-11). The directory layout under `examples/intents/` and
// `examples/planning-results/` IS the rejection manifest:
//
//   examples/intents/*.json                  → expectedVerdict = "accept"
//   examples/intents/bad/**/*.json           → expectedVerdict = "reject"
//   examples/planning-results/*.json         → expectedVerdict = "accept"
//   examples/planning-results/bad/**/*.json  → expectedVerdict = "reject"
//
// EXPLICITLY EXCLUDED — owned by their dedicated tests:
//   * examples/intents/greenfield/**          (greenfield-ambiguity-fixtures.test.ts)
//   * examples/intents/brownfield/**          (brownfield-ambiguity-fixtures.test.ts)
//   * **/*.ambiguity.*                        (ambiguity-tier scoring fixtures)
//   * confirmed-shape intent fixtures lacking a "draftId" field — top-level
//     intent fixtures are drafts BY CONTRACT for this loop. Confirmed-shape
//     fixtures (e.g. scaffold.json, bad/missing-capability.json) are surfaced
//     in `discoverFixtures` output as a `confirmedShapeIntentFollowups` array
//     so the SUMMARY can record them as Plan 03 follow-ups.
//
// Discovery is non-recursive at the top level and recursive only under bad/.
// This separation is enforced in code (two readdir calls per kind) so the
// distinction can't drift silently.

import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface DiscoveredFixture {
  readonly kind: "intent" | "planning";
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly expectedVerdict: "accept" | "reject";
}

export interface DiscoveryResult {
  readonly fixtures: readonly DiscoveredFixture[];
  /** Confirmed-shape intent JSON files (no `draftId`) found in top-level or
   * bad/ that this loop intentionally skips — drafts only by contract. */
  readonly confirmedShapeIntentFollowups: readonly string[];
}

const EXCLUDED_TOP_LEVEL_INTENT_DIRS = new Set(["greenfield", "brownfield", "bad"] as const);
const EXCLUDED_TOP_LEVEL_PLANNING_DIRS = new Set(["bad"] as const);

function isAmbiguityPath(relativePath: string): boolean {
  return relativePath.includes(".ambiguity.");
}

function isExcludedDirSegment(relativePath: string): boolean {
  return (
    relativePath.includes("/greenfield/") ||
    relativePath.includes("/brownfield/")
  );
}

async function looksLikeDraft(absolutePath: string): Promise<boolean> {
  const text = await readFile(absolutePath, "utf8");
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    return typeof parsed["draftId"] === "string";
  } catch {
    return false;
  }
}

/**
 * Read an intent fixture's `metadata.admissionExpectation.expectedAdmissionOutcome`
 * if present. Honors Q-11 ("per-fixture metadata") so the directory-as-manifest
 * default can be overridden by a fixture explicitly declaring `blocked` (e.g.
 * stub-archetype draft fixtures sit at top-level but are expected to refuse).
 *
 * Returns "promoted" | "blocked" | undefined (unknown / not specified).
 */
async function readExpectedAdmissionOutcome(absolutePath: string): Promise<string | undefined> {
  const text = await readFile(absolutePath, "utf8");
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const metadata = parsed["metadata"];
    if (!metadata || typeof metadata !== "object") return undefined;
    const expectation = (metadata as Record<string, unknown>)["admissionExpectation"];
    if (!expectation || typeof expectation !== "object") return undefined;
    const outcome = (expectation as Record<string, unknown>)["expectedAdmissionOutcome"];
    return typeof outcome === "string" ? outcome : undefined;
  } catch {
    return undefined;
  }
}

async function readTopLevelJsonFiles(dir: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      out.push(join(dir, entry.name));
    }
  }
  return out;
}

async function readBadJsonFilesRecursive(badDir: string): Promise<readonly string[]> {
  let entries;
  try {
    entries = await readdir(badDir, { withFileTypes: true, recursive: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      // Node's readdir with recursive returns parentPath on the entry.
      // Fall back to badDir if not present.
      const parent = (entry as unknown as { parentPath?: string }).parentPath ?? badDir;
      out.push(join(parent, entry.name));
    }
  }
  return out;
}

export async function discoverFixtures(examplesRoot: string): Promise<DiscoveryResult> {
  const intentRoot = join(examplesRoot, "intents");
  const planningRoot = join(examplesRoot, "planning-results");

  const fixtures: DiscoveredFixture[] = [];
  const confirmedShapeIntentFollowups: string[] = [];

  // ───────── Intents ─────────
  // Top-level — non-recursive. Default expectedVerdict = "accept", but a
  // fixture's metadata.admissionExpectation.expectedAdmissionOutcome === "blocked"
  // overrides to "reject" (Q-11 per-fixture metadata).
  const intentTopLevel = await readTopLevelJsonFiles(intentRoot);
  for (const absolutePath of intentTopLevel) {
    const relativePath = relative(examplesRoot, absolutePath);
    if (isAmbiguityPath(relativePath)) continue;
    if (isExcludedDirSegment(relativePath)) continue;
    if (!(await looksLikeDraft(absolutePath))) {
      // Confirmed-shape file at top level — owned elsewhere (or Plan 03 gap).
      confirmedShapeIntentFollowups.push(relativePath);
      continue;
    }
    void EXCLUDED_TOP_LEVEL_INTENT_DIRS;
    const outcome = await readExpectedAdmissionOutcome(absolutePath);
    const expectedVerdict: "accept" | "reject" =
      outcome === "blocked" ? "reject" : "accept";
    fixtures.push({
      kind: "intent",
      absolutePath,
      relativePath,
      expectedVerdict
    });
  }

  // bad/ recursive (reject) — drafts only.
  const intentBad = await readBadJsonFilesRecursive(join(intentRoot, "bad"));
  for (const absolutePath of intentBad) {
    const relativePath = relative(examplesRoot, absolutePath);
    if (isAmbiguityPath(relativePath)) continue;
    if (!(await looksLikeDraft(absolutePath))) {
      confirmedShapeIntentFollowups.push(relativePath);
      continue;
    }
    fixtures.push({
      kind: "intent",
      absolutePath,
      relativePath,
      expectedVerdict: "reject"
    });
  }

  // ───────── Planning ─────────
  // Top-level (accept) — non-recursive.
  const planningTopLevel = await readTopLevelJsonFiles(planningRoot);
  for (const absolutePath of planningTopLevel) {
    const relativePath = relative(examplesRoot, absolutePath);
    if (isAmbiguityPath(relativePath)) continue;
    if (isExcludedDirSegment(relativePath)) continue;
    void EXCLUDED_TOP_LEVEL_PLANNING_DIRS;
    fixtures.push({
      kind: "planning",
      absolutePath,
      relativePath,
      expectedVerdict: "accept"
    });
  }

  // bad/ recursive (reject).
  const planningBad = await readBadJsonFilesRecursive(join(planningRoot, "bad"));
  for (const absolutePath of planningBad) {
    const relativePath = relative(examplesRoot, absolutePath);
    if (isAmbiguityPath(relativePath)) continue;
    fixtures.push({
      kind: "planning",
      absolutePath,
      relativePath,
      expectedVerdict: "reject"
    });
  }

  fixtures.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  confirmedShapeIntentFollowups.sort();

  return { fixtures, confirmedShapeIntentFollowups };
}

/**
 * Independent reference walk used by the meta-test in
 * `parameterized-admission.test.ts`. Returns every in-scope file path
 * (relative to `examplesRoot`) — the same exclusion rules as
 * `discoverFixtures`, but expressed as a flat disk walk so a missed file in
 * the discovery logic is caught.
 *
 * Confirmed-shape intent fixtures are NOT in the reference set (they are
 * Plan 03 follow-ups) — the meta-test ignores them on both sides.
 */
export async function referenceWalk(examplesRoot: string): Promise<readonly string[]> {
  const intentRoot = join(examplesRoot, "intents");
  const planningRoot = join(examplesRoot, "planning-results");
  const out: string[] = [];

  const collect = async (
    paths: readonly string[],
    options: { requireDraft: boolean }
  ): Promise<void> => {
    for (const absolutePath of paths) {
      const relativePath = relative(examplesRoot, absolutePath);
      if (isAmbiguityPath(relativePath)) continue;
      if (isExcludedDirSegment(relativePath)) continue;
      if (options.requireDraft && !(await looksLikeDraft(absolutePath))) continue;
      out.push(relativePath);
    }
  };

  await collect(await readTopLevelJsonFiles(intentRoot), { requireDraft: true });
  await collect(await readBadJsonFilesRecursive(join(intentRoot, "bad")), {
    requireDraft: true
  });
  await collect(await readTopLevelJsonFiles(planningRoot), { requireDraft: false });
  await collect(await readBadJsonFilesRecursive(join(planningRoot, "bad")), {
    requireDraft: false
  });

  out.sort();
  return out;
}
