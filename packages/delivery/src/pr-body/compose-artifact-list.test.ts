import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";

import { composeArtifactList } from "./compose-artifact-list.js";

const artifacts = [
  { stage: "planning", kind: "plan", uri: "runs/r1/planning/plan.json" },
  { stage: "execution", kind: "result", uri: "runs/r1/execution/result.json" },
  { stage: "review", kind: "decision", uri: "runs/r1/review/decision.json" }
] satisfies readonly StageArtifactRef[];

describe("composeArtifactList", () => {
  it("renders the empty artifact state", () => {
    assert.equal(composeArtifactList([]), "## Artifacts\n\n_No artifacts._\n");
  });

  it("renders a deterministic list from input artifact order", () => {
    assert.equal(
      composeArtifactList(artifacts),
      [
        "## Artifacts",
        "",
        "- `runs/r1/planning/plan.json`",
        "- `runs/r1/execution/result.json`",
        "- `runs/r1/review/decision.json`",
        ""
      ].join("\n")
    );
  });

  it("round-trips markdown bullets back to the input artifact identifiers", () => {
    const out = composeArtifactList(artifacts);
    const identifiers = out
      .split("\n")
      .filter((line: string) => line.startsWith("- `"))
      .map((line: string) => line.slice(3, -1));

    assert.deepEqual(
      identifiers,
      artifacts.map((artifact) => artifact.uri)
    );
  });
});
