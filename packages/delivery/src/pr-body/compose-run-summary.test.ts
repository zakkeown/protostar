import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { composeRunSummary } from "./compose-run-summary.js";

describe("composeRunSummary", () => {
  it("renders the top-of-body factory run block", () => {
    const out = composeRunSummary({
      runId: "run_20260428",
      target: { owner: "acme", repo: "widget", baseBranch: "main" }
    });

    assert.equal(
      out,
      "# Protostar Factory Run\n\n- Run: `run_20260428`\n- Target: `acme/widget@main`\n"
    );
  });

  it("renders PR URL when the caller has one", () => {
    const out = composeRunSummary({
      runId: "run_with_pr",
      prUrl: "https://github.com/acme/widget/pull/1",
      target: { owner: "acme", repo: "widget", baseBranch: "release/v1" }
    });

    assert.equal(
      out,
      "# Protostar Factory Run\n\n- Run: `run_with_pr`\n- Target: `acme/widget@release/v1`\n- PR: https://github.com/acme/widget/pull/1\n"
    );
  });
});
