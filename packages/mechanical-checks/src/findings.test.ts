import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFindings,
  computeMechanicalScoresFromFindings,
  type MechanicalChecksPlanInput
} from "./findings.js";

describe("buildFindings", () => {
  it("emits a repairable build-failure for a failing verify command", () => {
    const findings = buildFindings({
      commandResults: [commandResult("verify", 1)],
      plan: planWithTasks([
        { id: "task-a", targetFiles: ["src/a.ts"] },
        { id: "task-b", targetFiles: ["src/b.ts"] }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["src/a.ts"],
      testStdout: ""
    });

    assert.equal(findings.length, 1);
    assert.equal(findings[0]?.ruleId, "build-failure");
    assert.equal(findings[0]?.severity, "major");
    assert.equal(findings[0]?.repairTaskId, "task-a");
  });

  it("falls back to all plan tasks when a command failure cannot be matched to changed target files", () => {
    const findings = buildFindings({
      commandResults: [commandResult("build", 2)],
      plan: planWithTasks([
        { id: "task-a", targetFiles: ["src/a.ts"] },
        { id: "task-b", targetFiles: ["src/b.ts"] }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["src/c.ts"],
      testStdout: ""
    });

    assert.deepEqual(findings.map((finding) => finding.repairTaskId), ["task-a", "task-b"]);
    assert.deepEqual(findings.map((finding) => finding.severity), ["major", "major"]);
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

  it("treats synthetic live-planning evidence as covered when a test command passes", () => {
    const findings = buildFindings({
      commandResults: [commandResult("test", 0)],
      plan: planWithTasks([
        {
          id: "task-x",
          acceptanceTestRefs: [
            {
              acId: "ac-1",
              testFile: "src/App.tsx",
              testName: "Protostar live planning build-and-test evidence"
            }
          ]
        }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["src/App.tsx"],
      testStdout: "2 passed"
    });

    assert.deepEqual(findings, []);
  });

  it("does not bury a failing test command under synthetic live-planning coverage findings", () => {
    const findings = buildFindings({
      commandResults: [commandResult("test", 1)],
      plan: planWithTasks([
        {
          id: "task-x",
          acceptanceTestRefs: [
            {
              acId: "ac-1",
              testFile: "src/App.tsx",
              testName: "Protostar live planning build-and-test evidence"
            }
          ]
        }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["src/App.tsx"],
      testStdout: "1 failed"
    });

    assert.deepEqual(findings.map((finding) => String(finding.ruleId)), ["generic-command-failure"]);
  });

  it("still emits ac-uncovered for a missing test file when tests fail", () => {
    const findings = buildFindings({
      commandResults: [commandResult("test", 1)],
      plan: planWithTasks([
        {
          id: "task-x",
          acceptanceTestRefs: [{ acId: "ac-1", testFile: "a.test.ts", testName: "renders" }]
        }
      ]),
      archetype: "feature-add",
      diffNameOnly: ["a.ts"],
      testStdout: "1 failed"
    });

    assert.equal(findings.map((finding) => String(finding.ruleId)).includes("ac-uncovered"), true);
  });
});

describe("computeMechanicalScoresFromFindings", () => {
  it("returns all passing scores for successful commands, one-file cosmetic diff, and full AC coverage", () => {
    assert.deepEqual(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 0,
        diffNameOnly: ["a.test.ts"],
        archetype: "cosmetic-tweak",
        totalAcCount: 5,
        coveredAcCount: 5
      }),
      { build: 1, lint: 1, diffSize: 1, acCoverage: 1 }
    );
  });

  it("scores an absent build command as passing", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: undefined,
        lintExitCode: 0,
        diffNameOnly: ["a.test.ts"],
        archetype: "cosmetic-tweak",
        totalAcCount: 1,
        coveredAcCount: 1
      }).build,
      1
    );
  });

  it("scores a non-zero lint exit code as failing", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 1,
        diffNameOnly: ["a.test.ts"],
        archetype: "cosmetic-tweak",
        totalAcCount: 1,
        coveredAcCount: 1
      }).lint,
      0
    );
  });

  it("scores a cosmetic-tweak two-file diff as oversized", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 0,
        diffNameOnly: ["a.ts", "b.ts"],
        archetype: "cosmetic-tweak",
        totalAcCount: 1,
        coveredAcCount: 1
      }).diffSize,
      0
    );
  });

  it("scores a cosmetic-tweak zero-file diff as within bounds", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 0,
        diffNameOnly: [],
        archetype: "cosmetic-tweak",
        totalAcCount: 1,
        coveredAcCount: 1
      }).diffSize,
      1
    );
  });

  it("scores a feature-add five-file diff as passing the graduated diff-size rule", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 0,
        diffNameOnly: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"],
        archetype: "feature-add",
        totalAcCount: 1,
        coveredAcCount: 1
      }).diffSize,
      1
    );
  });

  it("scores partial AC coverage as covered divided by total", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 0,
        diffNameOnly: ["a.test.ts"],
        archetype: "feature-add",
        totalAcCount: 5,
        coveredAcCount: 3
      }).acCoverage,
      0.6
    );
  });

  it("scores zero ACs as fully covered", () => {
    assert.equal(
      computeMechanicalScoresFromFindings({
        buildExitCode: 0,
        lintExitCode: 0,
        diffNameOnly: ["a.test.ts"],
        archetype: "feature-add",
        totalAcCount: 0,
        coveredAcCount: 0
      }).acCoverage,
      1
    );
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

function planWithTasks(tasks: MechanicalChecksPlanInput["tasks"]): MechanicalChecksPlanInput {
  return {
    planId: "plan-1",
    runId: "run-1",
    tasks
  } as MechanicalChecksPlanInput;
}
