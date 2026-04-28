import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");
const cliPath = resolve(repoRoot, "apps/factory-cli/dist/main.js");
const fixtureRoot = resolve(repoRoot, "packages/admission-e2e/src/fixtures/help");

const cases = [
  { name: "root", args: ["--help"], fixture: "root-help.txt" },
  { name: "run", args: ["run", "--help"], fixture: "run-help.txt" },
  { name: "status", args: ["status", "--help"], fixture: "status-help.txt" },
  { name: "resume", args: ["resume", "--help"], fixture: "resume-help.txt" },
  { name: "cancel", args: ["cancel", "--help"], fixture: "cancel-help.txt" },
  { name: "inspect", args: ["inspect", "--help"], fixture: "inspect-help.txt" },
  { name: "deliver", args: ["deliver", "--help"], fixture: "deliver-help.txt" },
  { name: "prune", args: ["prune", "--help"], fixture: "prune-help.txt" }
] as const;

describe("factory-cli help snapshots - Phase 9 Q-04/OP-07 lock", () => {
  for (const entry of cases) {
    it(`${entry.name} --help writes stderr only and matches fixture`, () => {
      const result = spawnSync(process.execPath, [cliPath, ...entry.args], {
        cwd: repoRoot,
        encoding: "utf8"
      });

      assert.equal(result.status, 0);
      assert.equal(result.stdout, "");
      assert.equal(result.stderr, readFileSync(resolve(fixtureRoot, entry.fixture), "utf8"));
    });
  }
});
