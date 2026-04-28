import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import type { StageArtifactRef } from "@protostar/artifacts";

import { composeArtifactList } from "./compose-artifact-list.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = resolve(__dirname, "../../src/pr-body/compose-artifact-list.ts");

const KNOWN_RUNTIME_FILENAMES = [
  "delivery-result.json",
  "ci-events.jsonl",
  "manifest.json",
  "pr-body.md",
  "review-decision.json",
  "review.jsonl"
] as const;

describe("composeArtifactList drift-by-construction (DELIVER-06)", () => {
  it("source contains zero hardcoded runtime filenames", async () => {
    const src = await readFile(SOURCE_PATH, "utf8");
    const stripped = src.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const offenders = KNOWN_RUNTIME_FILENAMES.filter((name) => stripped.includes(name));

    assert.deepEqual(offenders, [], `Hardcoded filename(s) in compose-artifact-list.ts: ${offenders.join(", ")}`);
  });

  it("output is exactly derived from input artifact identifiers", () => {
    const input = [
      { stage: "intent", kind: "signed-intent", uri: "runs/r2/intent/signed.json" },
      { stage: "release", kind: "body", uri: "runs/r2/release/body.md" }
    ] satisfies readonly StageArtifactRef[];

    const out = composeArtifactList(input);
    for (const artifact of input) {
      const matches = out.match(new RegExp(escapeRegExp(artifact.uri), "g")) ?? [];
      assert.equal(matches.length, 1, `Expected ${artifact.uri} exactly once`);
    }

    const bullets = out
      .split("\n")
      .filter((line: string) => line.startsWith("- `"))
      .map((line: string) => line.slice(3, -1));

    assert.deepEqual(
      bullets,
      input.map((artifact) => artifact.uri)
    );
  });
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
