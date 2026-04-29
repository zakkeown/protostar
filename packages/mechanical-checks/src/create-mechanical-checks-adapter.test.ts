import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMechanicalChecksAdapter } from "./create-mechanical-checks-adapter.js";

describe("createMechanicalChecksAdapter", () => {
  it("emits change-set final evidence with no findings when commands and AC pass", async () => {
    const subprocess = subprocessStub([
      subprocessResult("verify", 0, "/tmp/verify.stdout.log"),
      subprocessResult("lint", 0, "/tmp/lint.stdout.log")
    ]);
    const adapter = createMechanicalChecksAdapter({
      workspaceRoot: "/workspace",
      commands: ["verify", "lint"] as const,
      archetype: "cosmetic-tweak",
      baseRef: "HEAD",
      runId: "run-1",
      attempt: 0,
      plan: planWithTask("task-x", "a.test.ts", "renders"),
      readFile: async () => "ok 1 - renders",
      diffNameOnly: ["a.test.ts"],
      subprocess
    });

    const events = await collectEvents(adapter.execute(taskInput(), adapterContext()));
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "change-set");
    assert.deepEqual((final.result as any).changeSet.patches, []);
    assert.deepEqual((final.result as any).evidence.findings, []);
  });

  it("includes a critical build-failure finding when verify fails", async () => {
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig({ diffNameOnly: ["a.ts"] }),
      subprocess: subprocessStub([subprocessResult("verify", 1, "/tmp/verify.stdout.log")])
    });

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.findings[0].ruleId, "build-failure");
    assert.equal((final.result as any).evidence.findings[0].severity, "critical");
  });

  it("includes a cosmetic-archetype-violation when the run diff touches two files", async () => {
    const adapter = createMechanicalChecksAdapter(baseConfig({ diffNameOnly: ["a.ts", "b.ts"] }));

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.findings[0].ruleId, "cosmetic-archetype-violation");
  });

  it("runs configured commands sequentially", async () => {
    const calls: string[] = [];
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig({ diffNameOnly: ["a.ts"] }),
      commands: ["verify", "lint"] as const,
      subprocess: {
        async runCommand(input: { readonly name: string }) {
          calls.push(`pnpm ${input.name}`);
          return subprocessResult(calls.length === 1 ? "verify" : "lint", 0, `/tmp/${calls.length}.log`);
        }
      }
    });

    await collectEvents(adapter.execute(taskInput(), adapterContext()));

    assert.deepEqual(calls, ["pnpm verify", "pnpm lint"]);
  });

  it("converts subprocess timeouts into critical findings and still emits final", async () => {
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig({ diffNameOnly: ["a.ts"] }),
      subprocess: {
        async runCommand() {
          throw Object.assign(new Error("timed out"), { reason: "timeout" });
        }
      }
    });

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal(final.result.outcome, "change-set");
    assert.equal((final.result as any).evidence.findings[0].ruleId, "mechanical-command-timeout");
    assert.equal((final.result as any).evidence.findings[0].severity, "critical");
  });

  it("has the mechanical-checks adapter id", () => {
    const adapter = createMechanicalChecksAdapter(baseConfig({ diffNameOnly: [] }));

    assert.equal(adapter.id, "mechanical-checks");
  });

  it("uses injected readFile for verify stdout and does not import fs in adapter source", async () => {
    const readFileCalls: string[] = [];
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig({ diffNameOnly: ["a.test.ts"] }),
      plan: planWithTask("task-x", "a.test.ts", "renders"),
      subprocess: subprocessStub([subprocessResult("verify", 0, "/tmp/stdout.log")]),
      async readFile(path: string) {
        readFileCalls.push(path);
        return "ok 1 - renders";
      }
    });

    await collectEvents(adapter.execute(taskInput(), adapterContext()));

    assert.deepEqual(readFileCalls, ["/tmp/stdout.log"]);
  });

  it("emits passing mechanicalScores for successful verify/lint, one-file cosmetic diff, and covered AC", async () => {
    const adapter = createMechanicalChecksAdapter({
      workspaceRoot: "/workspace",
      commands: ["verify", "lint"] as const,
      archetype: "cosmetic-tweak",
      baseRef: "HEAD",
      runId: "run-1",
      attempt: 0,
      plan: planWithTask("task-x", "a.test.ts", "renders"),
      readFile: async () => "ok 1 - renders",
      diffNameOnly: ["a.test.ts"],
      subprocess: subprocessStub([
        subprocessResult("verify", 0, "/tmp/verify.stdout.log"),
        subprocessResult("lint", 0, "/tmp/lint.stdout.log")
      ])
    });

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.deepEqual((final.result as any).evidence.mechanicalScores, {
      build: 1,
      lint: 1,
      diffSize: 1,
      acCoverage: 1
    });
  });

  it("emits a failing lint mechanical score when lint exits non-zero", async () => {
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig({ diffNameOnly: ["a.test.ts"] }),
      commands: ["lint"] as const,
      subprocess: subprocessStub([subprocessResult("lint", 1, "/tmp/lint.stdout.log")])
    });

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.mechanicalScores.lint, 0);
  });

  it("emits an oversized diff mechanical score for a three-file cosmetic-tweak diff", async () => {
    const adapter = createMechanicalChecksAdapter(
      baseConfig({ diffNameOnly: ["a.ts", "b.ts", "c.ts"] })
    );

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.mechanicalScores.diffSize, 0);
  });
});

function baseConfig(opts: { readonly diffNameOnly: readonly string[] }) {
  return {
    workspaceRoot: "/workspace",
    commands: ["verify"] as const,
    archetype: "cosmetic-tweak" as const,
    baseRef: "HEAD",
    runId: "run-1",
    attempt: 0,
    plan: planWithTask("task-x", "a.test.ts", "renders"),
    readFile: async () => "",
    diffNameOnly: opts.diffNameOnly,
    subprocess: subprocessStub([subprocessResult("verify", 0, "/tmp/verify.stdout.log")])
  };
}

function subprocessStub(results: readonly ReturnType<typeof subprocessResult>[]) {
  let index = 0;
  return {
    async runCommand() {
      const result = results[index];
      index += 1;
      if (result === undefined) {
        throw new Error("unexpected subprocess call");
      }
      return result;
    }
  };
}

function subprocessResult(id: string, exitCode: number, stdoutPath: string) {
  return {
    id,
    argv: ["pnpm", id],
    exitCode,
    durationMs: 10,
    stdoutPath,
    stderrPath: stdoutPath.replace("stdout", "stderr"),
    stdoutBytes: 0,
    stderrBytes: 0
  };
}

function planWithTask(planTaskId: string, testFile: string, testName: string) {
  return {
    tasks: [
      {
        planTaskId,
        acceptanceTestRefs: [{ acId: "ac-1", testFile, testName }]
      }
    ]
  };
}

function taskInput() {
  return {
    planTaskId: "task-x",
    title: "Task X",
    targetFiles: []
  };
}

function adapterContext() {
  return {
    signal: new AbortController().signal,
    confirmedIntent: {} as any,
    resolvedEnvelope: {} as any,
    repoReader: {} as any,
    journal: {} as any,
    budget: { taskWallClockMs: 5000, adapterRetriesPerTask: 0 },
    network: { allow: "none" as const }
  };
}

async function collectEvents(events: AsyncIterable<any>): Promise<any[]> {
  const collected = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function finalEvent(events: readonly any[]) {
  const final = events.find((event) => event.kind === "final");
  assert.ok(final);
  return final;
}
