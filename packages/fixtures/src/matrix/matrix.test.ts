import { access, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { getMatrixRow, listOutcomes } from "./index.js";

const expectedOutcomes = Object.freeze([
  "accepted",
  "ambiguous",
  "bad-plan",
  "failed-execution",
  "repaired-execution",
  "blocked-review",
  "pr-ready"
] as const);

describe("fixture matrix", () => {
  it("listOutcomes returns the frozen canonical outcome list", () => {
    const outcomes = listOutcomes();

    assert.deepEqual(outcomes, expectedOutcomes);
    assert.equal(Object.isFrozen(outcomes), true);
  });

  it("returns the pr-ready row with real-seed PR expectations", () => {
    assert.deepEqual(getMatrixRow("pr-ready"), {
      outcome: "pr-ready",
      archetype: "cosmetic-tweak",
      triggeredBy: "real-seed",
      expected: {
        manifestStatus: "ready-to-release",
        reviewVerdict: "pass",
        hasPrUrl: true
      }
    });
  });

  it("returns the ambiguous row with synthetic-intent refusal expectations", () => {
    const row = getMatrixRow("ambiguous");

    assert.equal(row.triggeredBy, "synthetic-intent");
    assert.equal(row.expected.refusalKind, "intent-ambiguous");
  });

  it("returns the failed-execution row as an envelope-tweak fixture", () => {
    assert.equal(getMatrixRow("failed-execution").triggeredBy, "envelope-tweak");
  });

  it("throws for unknown outcomes", () => {
    assert.throws(() => getMatrixRow("unknown"), {
      name: "TypeError",
      message: "unknown outcome: unknown"
    });
  });

  it("has one filesystem row per outcome with required files", async () => {
    const fixturesDir = resolve(await repoRoot(), "packages/fixtures/__fixtures__");
    const entries = await readdir(fixturesDir, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

    assert.deepEqual(dirs, [...expectedOutcomes].sort());
    for (const outcome of expectedOutcomes) {
      const rowDir = resolve(fixturesDir, outcome);
      await assertFile(resolve(rowDir, "expectations.ts"));
      await assertFile(resolve(rowDir, "manifest.json"));
    }
  });
});

async function assertFile(path: string): Promise<void> {
  await access(path);
}

async function repoRoot(): Promise<string> {
  let current = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      await access(resolve(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        throw new Error("repo root not found");
      }
      current = parent;
    }
  }
}
