import { access, readdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const outcomes = Object.freeze([
  "accepted",
  "ambiguous",
  "bad-plan",
  "failed-execution",
  "repaired-execution",
  "blocked-review",
  "pr-ready"
] as const);

const reviewOutcomes = new Set(["accepted", "repaired-execution", "blocked-review", "pr-ready"]);

describe("fixture-matrix coverage", () => {
  it("contains exactly the seven DOG-02 outcome directories", async () => {
    const fixturesDir = await matrixDir();
    const dirs = (await readdir(fixturesDir, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    assert.deepEqual(dirs, [...outcomes].sort());
  });

  it("requires every row to include expectations.ts, manifest.json, and trigger metadata", async () => {
    const fixturesDir = await matrixDir();

    for (const outcome of outcomes) {
      const rowDir = resolve(fixturesDir, outcome);
      await assertFile(resolve(rowDir, "manifest.json"), `${outcome} missing manifest.json`);
      const expectationsPath = resolve(rowDir, "expectations.ts");
      const expectations = await readFile(expectationsPath, "utf8");

      assert.match(expectations, /triggeredBy:/, `${outcome} missing triggeredBy literal`);
      assert.match(expectations, new RegExp(`outcome: "${outcome}"`), `${outcome} expectation names wrong outcome`);
    }
  });

  it("requires review-gate.json for rows that include review evidence", async () => {
    const fixturesDir = await matrixDir();

    for (const outcome of reviewOutcomes) {
      await assertFile(resolve(fixturesDir, outcome, "review-gate.json"), `${outcome} missing review-gate.json`);
    }
  });
});

async function assertFile(path: string, message: string): Promise<void> {
  try {
    await access(path);
  } catch {
    assert.fail(message);
  }
}

async function matrixDir(): Promise<string> {
  return resolve(await repoRoot(), "packages/fixtures/__fixtures__");
}

async function repoRoot(): Promise<string> {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      await access(resolve(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) throw new Error("repo root not found");
      current = parent;
    }
  }
}
