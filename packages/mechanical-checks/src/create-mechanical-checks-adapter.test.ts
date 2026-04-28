import assert from "node:assert/strict";
import * as fs from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import git from "isomorphic-git";

import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

import { createMechanicalChecksAdapter } from "./create-mechanical-checks-adapter.js";

const AUTHOR = {
  name: "protostar-test",
  email: "test@protostar.local",
  timestamp: 1_700_000_002,
  timezoneOffset: 0
} as const;

describe("createMechanicalChecksAdapter", () => {
  it("emits change-set final evidence with no findings when commands and AC pass", async (t) => {
    const repo = await repoWithCommit([{ path: "a.test.ts", content: "test('renders', () => {});\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const subprocess = subprocessStub([
      subprocessResult("verify", 0, "/tmp/verify.stdout.log"),
      subprocessResult("lint", 0, "/tmp/lint.stdout.log")
    ]);
    const adapter = createMechanicalChecksAdapter({
      workspaceRoot: repo.dir,
      commands: [
        { id: "verify", argv: ["pnpm", "verify"] },
        { id: "lint", argv: ["pnpm", "lint"] }
      ],
      archetype: "cosmetic-tweak",
      baseRef: repo.baseRef,
      runId: "run-1",
      attempt: 0,
      plan: planWithTask("task-x", "a.test.ts", "renders"),
      readFile: async () => "ok 1 - renders",
      gitFs: fs,
      subprocess
    });

    const events = await collectEvents(adapter.execute(taskInput(), adapterContext()));
    const final = finalEvent(events);

    assert.equal(final.result.outcome, "change-set");
    assert.deepEqual((final.result as any).changeSet.patches, []);
    assert.deepEqual((final.result as any).evidence.findings, []);
  });

  it("includes a critical build-failure finding when verify fails", async (t) => {
    const repo = await repoWithCommit([{ path: "a.ts", content: "a\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig(repo),
      subprocess: subprocessStub([subprocessResult("verify", 1, "/tmp/verify.stdout.log")])
    });

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.findings[0].ruleId, "build-failure");
    assert.equal((final.result as any).evidence.findings[0].severity, "critical");
  });

  it("includes a cosmetic-archetype-violation when the run diff touches two files", async (t) => {
    const repo = await repoWithCommit([
      { path: "a.ts", content: "a\n" },
      { path: "b.ts", content: "b\n" }
    ]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const adapter = createMechanicalChecksAdapter(baseConfig(repo));

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.findings[0].ruleId, "cosmetic-archetype-violation");
  });

  it("runs configured commands sequentially", async (t) => {
    const repo = await repoWithCommit([{ path: "a.ts", content: "a\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const calls: string[] = [];
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig(repo),
      commands: [
        { id: "verify", argv: ["pnpm", "verify"] },
        { id: "lint", argv: ["pnpm", "lint"] }
      ],
      subprocess: {
        async runCommand(input: { readonly argv: readonly string[] }) {
          calls.push(input.argv.join(" "));
          return subprocessResult(calls.length === 1 ? "verify" : "lint", 0, `/tmp/${calls.length}.log`);
        }
      }
    });

    await collectEvents(adapter.execute(taskInput(), adapterContext()));

    assert.deepEqual(calls, ["pnpm verify", "pnpm lint"]);
  });

  it("converts subprocess timeouts into critical findings and still emits final", async (t) => {
    const repo = await repoWithCommit([{ path: "a.ts", content: "a\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig(repo),
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
    const adapter = createMechanicalChecksAdapter(baseConfig({ dir: ".", baseRef: "HEAD" }));

    assert.equal(adapter.id, "mechanical-checks");
  });

  it("uses injected readFile for verify stdout and does not import fs in adapter source", async (t) => {
    const repo = await repoWithCommit([{ path: "a.test.ts", content: "test('renders', () => {});\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const readFileCalls: string[] = [];
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig(repo),
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

  it("emits passing mechanicalScores for successful build/lint, one-file cosmetic diff, and covered AC", async (t) => {
    const repo = await repoWithCommit([{ path: "a.test.ts", content: "test('renders', () => {});\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const adapter = createMechanicalChecksAdapter({
      workspaceRoot: repo.dir,
      commands: [
        { id: "build", argv: ["pnpm", "build"] },
        { id: "lint", argv: ["pnpm", "lint"] }
      ],
      archetype: "cosmetic-tweak",
      baseRef: repo.baseRef,
      runId: "run-1",
      attempt: 0,
      plan: planWithTask("task-x", "a.test.ts", "renders"),
      readFile: async () => "ok 1 - renders",
      gitFs: fs,
      subprocess: subprocessStub([
        subprocessResult("build", 0, "/tmp/build.stdout.log"),
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

  it("emits a failing lint mechanical score when lint exits non-zero", async (t) => {
    const repo = await repoWithCommit([{ path: "a.test.ts", content: "test('renders', () => {});\n" }]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const adapter = createMechanicalChecksAdapter({
      ...baseConfig(repo),
      commands: [{ id: "lint", argv: ["pnpm", "lint"] }],
      subprocess: subprocessStub([subprocessResult("lint", 1, "/tmp/lint.stdout.log")])
    });

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.mechanicalScores.lint, 0);
  });

  it("emits an oversized diff mechanical score for a three-file cosmetic-tweak diff", async (t) => {
    const repo = await repoWithCommit([
      { path: "a.ts", content: "a\n" },
      { path: "b.ts", content: "b\n" },
      { path: "c.ts", content: "c\n" }
    ]);
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const adapter = createMechanicalChecksAdapter(baseConfig(repo));

    const final = finalEvent(await collectEvents(adapter.execute(taskInput(), adapterContext())));

    assert.equal((final.result as any).evidence.mechanicalScores.diffSize, 0);
  });
});

async function repoWithCommit(files: readonly { readonly path: string; readonly content: string }[]) {
  const repo = await buildSacrificialRepo();
  await commitFiles(repo.dir, files);
  return { dir: repo.dir, baseRef: repo.headSha };
}

function baseConfig(repo: { readonly dir: string; readonly baseRef: string }) {
  return {
    workspaceRoot: repo.dir,
    commands: [{ id: "verify", argv: ["pnpm", "verify"] }],
    archetype: "cosmetic-tweak" as const,
    baseRef: repo.baseRef,
    runId: "run-1",
    attempt: 0,
    plan: planWithTask("task-x", "a.test.ts", "renders"),
    readFile: async () => "",
    gitFs: fs,
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

async function commitFiles(
  dir: string,
  files: readonly { readonly path: string; readonly content: string }[]
): Promise<void> {
  for (const file of files) {
    const absolutePath = join(dir, file.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.content);
    await git.add({ fs, dir, filepath: file.path });
  }

  await git.commit({
    fs,
    dir,
    message: `commit ${files.map((file) => file.path).join(", ")}`,
    author: AUTHOR,
    committer: AUTHOR
  });
}
