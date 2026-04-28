import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { computeCiVerdict } from "./compute-ci-verdict.js";

describe("computeCiVerdict", () => {
  it("returns no-checks-configured when the allowlist is empty", () => {
    assert.equal(
      computeCiVerdict([{ name: "build", status: "completed", conclusion: "failure" }], []),
      "no-checks-configured"
    );
  });

  it("returns pending when any required check is missing", () => {
    assert.equal(
      computeCiVerdict([{ name: "build", status: "completed", conclusion: "success" }], ["build", "test"]),
      "pending"
    );
  });

  it("returns pass when the required completed check succeeds", () => {
    assert.equal(computeCiVerdict([{ name: "build", status: "completed", conclusion: "success" }], ["build"]), "pass");
  });

  it("returns fail when the required completed check fails", () => {
    assert.equal(computeCiVerdict([{ name: "build", status: "completed", conclusion: "failure" }], ["build"]), "fail");
  });

  it("returns pending when the required check is still running", () => {
    assert.equal(computeCiVerdict([{ name: "build", status: "in_progress", conclusion: null }], ["build"]), "pending");
  });

  it("treats neutral and success conclusions as passing", () => {
    assert.equal(
      computeCiVerdict(
        [
          { name: "build", status: "completed", conclusion: "neutral" },
          { name: "test", status: "completed", conclusion: "success" }
        ],
        ["build", "test"]
      ),
      "pass"
    );
  });

  it("lets failing required checks dominate passing required checks", () => {
    assert.equal(
      computeCiVerdict(
        [
          { name: "build", status: "completed", conclusion: "success" },
          { name: "test", status: "completed", conclusion: "failure" }
        ],
        ["build", "test"]
      ),
      "fail"
    );
  });

  it("ignores failing checks outside the allowlist", () => {
    assert.equal(
      computeCiVerdict(
        [
          { name: "build", status: "completed", conclusion: "success" },
          { name: "lint", status: "completed", conclusion: "success" },
          { name: "test", status: "completed", conclusion: "failure" }
        ],
        ["build", "lint"]
      ),
      "pass"
    );
  });

  it("returns pending for completed required checks with unknown conclusions", () => {
    assert.equal(computeCiVerdict([{ name: "build", status: "completed", conclusion: "startup_failure" }], ["build"]), "pending");
  });
});
