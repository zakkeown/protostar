import { access, readdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const maxFixtureAgeMs = 60 * 24 * 60 * 60 * 1000;

describe("fixture-matrix age", () => {
  it("fails when any DOG-02 fixture row is older than 60 days", async () => {
    const now = Date.now();
    const fixturesDir = resolve(await repoRoot(), "packages/fixtures/__fixtures__");
    const entries = await readdir(fixturesDir, { withFileTypes: true });
    const dirs = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);

    assert.ok(dirs.length > 0, "fixture matrix has no rows");
    for (const dir of dirs) {
      const manifestPath = resolve(fixturesDir, dir, "manifest.json");
      const manifestStat = await stat(manifestPath);
      const ageMs = now - manifestStat.mtimeMs;

      assert.ok(
        ageMs <= maxFixtureAgeMs,
        `${dir} manifest fixture is older than 60 days; run bash scripts/regen-matrix.sh and commit reviewed artifacts`
      );
    }
  });
});

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
