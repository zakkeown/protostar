import assert from "node:assert/strict";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const cliPath = resolve(repoRoot, "apps/factory-cli/dist/main.js");
const snapshotRoot = resolve(repoRoot, "docs/cli");

const publicHelpSurfaces = [
  { name: "root", args: ["--help"] },
  { name: "run", args: ["run", "--help"] },
  { name: "status", args: ["status", "--help"] },
  { name: "inspect", args: ["inspect", "--help"] },
  { name: "cancel", args: ["cancel", "--help"] },
  { name: "resume", args: ["resume", "--help"] },
  { name: "deliver", args: ["deliver", "--help"] },
  { name: "prune", args: ["prune", "--help"] }
] as const;

describe("cli-help-snapshot-drift", () => {
  it("docs/cli snapshots match live public --help output", () => {
    const updateFixtures = process.env["UPDATE_FIXTURES"] === "1";
    const expectedFiles = new Set(publicHelpSurfaces.map((surface) => `${surface.name}.txt`));
    mkdirSync(snapshotRoot, { recursive: true });

    for (const surface of publicHelpSurfaces) {
      if (surface.name.startsWith("__")) continue;

      const result = spawnSync(process.execPath, [cliPath, ...surface.args], {
        cwd: repoRoot,
        encoding: "utf8"
      });
      assert.equal(result.status, 0, `${surface.name} --help exited ${result.status}`);
      assert.equal(result.stdout, "", `${surface.name} --help must write stdout-empty help`);

      const snapshotPath = resolve(snapshotRoot, `${surface.name}.txt`);
      if (updateFixtures) {
        writeFileSync(snapshotPath, result.stderr);
      } else {
        assert.equal(result.stderr, readFileSync(snapshotPath, "utf8"), `${surface.name} help snapshot drift`);
      }
    }

    const actualFiles = readdirSync(snapshotRoot).filter((entry) => entry.endsWith(".txt")).sort();
    const orphans = actualFiles.filter((entry) => !expectedFiles.has(entry));
    if (updateFixtures) {
      for (const orphan of orphans) {
        rmSync(resolve(snapshotRoot, orphan));
      }
    } else {
      assert.deepEqual(orphans, [], `orphan docs/cli snapshots: ${orphans.join(", ")}`);
    }

    const refreshedFiles = readdirSync(snapshotRoot).filter((entry) => entry.endsWith(".txt")).sort();
    assert.deepEqual(
      refreshedFiles,
      [...expectedFiles].sort(),
      "every public CLI help surface must have exactly one docs/cli snapshot"
    );
  });
});
