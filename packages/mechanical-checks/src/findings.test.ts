import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFindings } from "./findings.js";

describe("buildFindings", () => {
  it("emits a critical build-failure for a failing verify command", () => {
    const findings = buildFindings({
      commandResults: [commandResult("verify", 1)],
      plan: planWithTasks([]),
      archetype: "feature-add",
      diffNameOnly: [],
      testStdout: ""
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "build-failure");
    assert.equal(findings[0]?.severity, "critical");
    assert.equal(findings[0]?.repairTaskId, undefined);
  });

  it("emits a major lint-failure for a failing lint command", () => {
    const findings = buildFindings({
      commandResults: [commandResult("lint", 2)],
      plan: planWithTasks([]),
      archetype: "feature-add",
      diffNameOnly: [],
      testStdout: ""
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "lint-failure");
    assert.equal(findings[0]?.severity, "major");
  });

  it("emits a critical cosmetic-archetype-violation when cosmetic-tweak touches two files", () => {
    const findings = buildFindings({
      commandResults: [],
      plan: planWithTasks([]),
      archetype: "cosmetic-tweak",
      diffNameOnly: ["a.ts", "b.ts"],
      testStdout: ""
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "cosmetic-archetype-violation");
    assert.equal(findings[0]?.severity, "critical");
    assert.deepEqual((findings[0]?.evidence as { touchedFiles?: readonly string[] }).touchedFiles, [
      "a.ts",
      "b.ts"
    ]);
  });

  it("does not emit a cosmetic violation when cosmetic-tweak touches one file", () => {
    const findings = buildFindings({
      commandResults: [],
      plan: planWithTasks([]),
      archetype: "cosmetic-tweak",
      diffNameOnly: ["a.ts"],
      testStdout: ""
    });

    assert.deepEqual(findings, []);
  });

  it("emits ac-uncovered when the referenced test file is not in the diff", () => {
    const findings = buildFindings({
      commandResults: [],
      plan: planWithTasks([
        {
          id: "task-x",
          acceptanceTestRefs: [{ acId: "ac-1", testFile: "a.test.ts", testName: "renders" }]
        }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["a.ts"],
      testStdout: "ok 1 - renders"
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "ac-uncovered");
    assert.equal(findings[0]?.severity, "major");
    assert.equal(findings[0]?.repairTaskId, "task-x");
    assert.deepEqual((findings[0]?.evidence as { missingTestFile?: string }).missingTestFile, "a.test.ts");
  });

  it("emits ac-uncovered when the referenced test name is missing from stdout", () => {
    const findings = buildFindings({
      commandResults: [],
      plan: planWithTasks([
        {
          id: "task-x",
          acceptanceTestRefs: [{ acId: "ac-1", testFile: "a.test.ts", testName: "renders" }]
        }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["a.test.ts"],
      testStdout: "ok 1 - compiles"
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "ac-uncovered");
    assert.equal(findings[0]?.severity, "major");
    assert.equal(findings[0]?.repairTaskId, "task-x");
    assert.deepEqual((findings[0]?.evidence as { missingTestName?: string }).missingTestName, "renders");
  });

  it("does not emit ac-uncovered when the test file is in the diff and name is in stdout", () => {
    const findings = buildFindings({
      commandResults: [],
      plan: planWithTasks([
        {
          id: "task-x",
          acceptanceTestRefs: [{ acId: "ac-1", testFile: "a.test.ts", testName: "renders" }]
        }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["a.test.ts"],
      testStdout: "ok 1 - renders"
    });

    assert.deepEqual(findings, []);
  });
});

function commandResult(id: string, exitCode: number) {
  return {
    id,
    argv: ["pnpm", id],
    exitCode,
    durationMs: 10,
    stdoutPath: `/tmp/${id}.stdout.log`,
    stderrPath: `/tmp/${id}.stderr.log`
  };
}

function planWithTasks(tasks: readonly unknown[]) {
  return {
    planId: "plan-1",
    runId: "run-1",
    tasks
  };
}
