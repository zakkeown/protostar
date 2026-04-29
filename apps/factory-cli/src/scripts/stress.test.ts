import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { parseStressEvent, parseStressReport } from "@protostar/artifacts";

import {
  buildFactoryRunArgs,
  parseStressScriptArgs,
  runStressScript,
  type FactoryRunInput,
  type FactoryRunResult,
  type StressScriptDependencies
} from "./stress.js";

const tempRoots: string[] = [];

describe("TypeScript stress runner", () => {
  after(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("refuses sustained-load because bash owns that shape", () => {
    assert.throws(() => parseStressScriptArgs(["--shape", "sustained-load"]), /Use scripts\/stress\.sh for sustained-load/);
  });

  it("builds the signed-input factory run argv", () => {
    assert.deepEqual(buildFactoryRunArgs({
      draftPath: "/tmp/intent.draft.json",
      confirmedIntentPath: "/tmp/confirmed-intent.json",
      runId: "run_1",
      llmBackend: "mock",
      headlessMode: "local-daemon"
    }), [
      "run",
      "--draft",
      "/tmp/intent.draft.json",
      "--confirmed-intent",
      "/tmp/confirmed-intent.json",
      "--out",
      ".protostar/runs",
      "--executor",
      "real",
      "--planning-mode",
      "live",
      "--review-mode",
      "live",
      "--delivery-mode",
      "auto",
      "--trust",
      "trusted",
      "--run-id",
      "run_1",
      "--intent-mode",
      "brownfield",
      "--llm-backend",
      "mock",
      "--headless-mode",
      "local-daemon",
      "--non-interactive"
    ]);
  });

  it("runs concurrency workers with distinct branch names and prepared signed inputs", async () => {
    const workspace = await tempWorkspace();
    const prepareCalls: Parameters<StressScriptDependencies["prepareRunInput"]>[0][] = [];
    const factoryRuns: FactoryRunInput[] = [];

    const result = await runStressScript({
      workspaceRoot: workspace,
      sessionId: "stress_concurrency_001",
      shape: "concurrency",
      sessions: 2,
      concurrency: 2,
      llmBackend: "mock",
      headlessMode: "local-daemon"
    }, {
      prepareRunInput: fakePrepare(workspace, prepareCalls),
      runFactory: async (input) => {
        factoryRuns.push(input);
        return { exitCode: 0 };
      }
    });

    assert.equal(result.totalRuns, 2);
    assert.equal(factoryRuns.length, 2);
    assert.equal(prepareCalls.length, 2);
    assert.equal(new Set(factoryRuns.map((run) => run.branchName)).size, 2);
    assert.deepEqual(factoryRuns.map((run) => run.branchName), [
      "protostar/stress_concurrency_001/0-0",
      "protostar/stress_concurrency_001/1-1"
    ]);
    assert.equal(factoryRuns.every((run) => /^[a-zA-Z0-9._/-]+$/.test(run.branchName)), true);
    assert.equal(new Set(factoryRuns.map((run) => run.draftPath)).size, 2);
    assert.equal(new Set(factoryRuns.map((run) => run.confirmedIntentPath)).size, 2);
    for (const run of factoryRuns) {
      assert.equal(run.args.includes("--draft"), true);
      assert.equal(run.args.includes(run.draftPath), true);
      assert.equal(run.args.includes("--confirmed-intent"), true);
      assert.equal(run.args.includes(run.confirmedIntentPath), true);
      assert.equal(run.args.includes("--llm-backend"), true);
      assert.equal(run.args.includes("--headless-mode"), true);
    }

    const report = parseStressReport(JSON.parse(await readFile(result.reportPath ?? "", "utf8")));
    assert.equal(report.shape, "concurrency");
    assert.equal(report.totalRuns, 2);
    assert.equal(report.perRun.length, 2);
  });

  it("observes all four fault mechanisms through applyFaultInjection hooks", async () => {
    const workspace = await tempWorkspace();
    const factoryRuns: FactoryRunInput[] = [];

    const result = await runStressScript({
      workspaceRoot: workspace,
      sessionId: "stress_faults_001",
      shape: "fault-injection",
      concurrency: 2,
      runs: 1,
      llmBackend: "mock",
      headlessMode: "local-daemon",
      faultTimeoutMs: 1
    }, {
      prepareRunInput: fakePrepare(workspace, []),
      runFactory: async (input) => {
        factoryRuns.push(input);
        return fakeFaultRun(input);
      }
    });

    assert.equal(result.stressClean, true);
    assert.deepEqual(
      result.faultObservations.map((observation) => [observation.scenario, observation.mechanism, observation.observed]),
      [
        ["network-drop", "adapter-network-refusal", true],
        ["llm-timeout", "llm-abort-timeout", true],
        ["disk-full", "disk-write-enospc", true],
        ["abort-signal", "external-abort-signal", true]
      ]
    );
    assert.equal(
      factoryRuns.some((run) => run.env?.["PROTOSTAR_MOCK_LLM_MODE"] === "network-drop"),
      true
    );
    assert.equal(
      factoryRuns.some((run) => run.env?.["PROTOSTAR_MOCK_LLM_MODE"] === "llm-timeout" && run.signal !== undefined),
      true
    );
    assert.equal(
      factoryRuns.some((run) => run.env?.["PROTOSTAR_MOCK_LLM_MODE"] === undefined && run.signal !== undefined),
      true
    );

    const events = await readStressEvents(result.eventsPath);
    const observed = events.filter((event) => event.type === "fault-observed");
    assert.deepEqual(observed.map((event) => event.payload["mechanism"]), [
      "adapter-network-refusal",
      "llm-abort-timeout",
      "disk-write-enospc",
      "external-abort-signal"
    ]);
    assert.equal(events.some((event) => event.type === "stress-clean" && event.payload["stressClean"] === true), true);
  });

  it("does not report stressClean for a single observed fault label", async () => {
    const workspace = await tempWorkspace();

    const result = await runStressScript({
      workspaceRoot: workspace,
      sessionId: "stress_faults_002",
      shape: "fault-injection",
      scenario: "network-drop",
      runs: 1,
      llmBackend: "mock"
    }, {
      prepareRunInput: fakePrepare(workspace, []),
      runFactory: async (input) => fakeFaultRun(input)
    });

    assert.equal(result.stressClean, false);
    const events = await readStressEvents(result.eventsPath);
    assert.equal(events.some((event) => event.type === "stress-clean"), false);
    assert.deepEqual(
      events.filter((event) => event.type === "fault-observed").map((event) => event.payload["mechanism"]),
      ["adapter-network-refusal"]
    );
  });

  it("writes wedge evidence and stops the worker pool immediately on a stale run", async () => {
    const workspace = await tempWorkspace();
    const factoryRuns: FactoryRunInput[] = [];

    const result = await runStressScript({
      workspaceRoot: workspace,
      sessionId: "stress_wedge_001",
      shape: "concurrency",
      sessions: 3,
      concurrency: 1
    }, {
      prepareRunInput: fakePrepare(workspace, []),
      runFactory: async (input) => {
        factoryRuns.push(input);
        return { exitCode: null, outcome: "wedge" };
      }
    });

    assert.equal(result.aborted, true);
    assert.equal(result.totalRuns, 1);
    assert.equal(factoryRuns.length, 1);
    const wedge = JSON.parse(await readFile(join(result.sessionDir, "wedge-evidence.json"), "utf8")) as {
      readonly runId?: string;
      readonly reason?: string;
    };
    assert.equal(wedge.runId, factoryRuns[0]?.runId);
    assert.equal(wedge.reason, "status unchanged for > 5x p95");
  });
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "stress-script-"));
  tempRoots.push(workspace);
  return workspace;
}

function fakePrepare(
  workspace: string,
  calls: Parameters<StressScriptDependencies["prepareRunInput"]>[0][]
): StressScriptDependencies["prepareRunInput"] {
  return async (input) => {
    calls.push(input);
    return {
      seedId: `seed-${input.runIndex}`,
      archetype: input.runIndex % 2 === 0 ? "cosmetic-tweak" : "feature-add",
      draftPath: join(workspace, "drafts", input.runId, "intent.draft.json"),
      confirmedIntentPath: join(workspace, "drafts", input.runId, "confirmed-intent.json"),
      runId: input.runId
    };
  };
}

async function fakeFaultRun(input: FactoryRunInput): Promise<FactoryRunResult> {
  if (input.env?.["PROTOSTAR_MOCK_LLM_MODE"] === "network-drop") {
    return {
      exitCode: 1,
      stderr: "adapter-network-refusal",
      errorCode: "adapter-network-refusal"
    };
  }
  if (input.env?.["PROTOSTAR_MOCK_LLM_MODE"] === "llm-timeout") {
    await waitForAbort(input.signal);
    return {
      exitCode: null,
      errorCode: "llm-abort-timeout",
      signalAborted: input.signal?.aborted === true
    };
  }
  if (input.signal !== undefined) {
    await waitForAbort(input.signal);
    return {
      exitCode: null,
      errorCode: "external-abort-signal",
      signalAborted: input.signal.aborted
    };
  }
  return { exitCode: 0 };
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) {
    throw new Error("expected abort signal");
  }
  if (signal.aborted) return;
  await new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve(), { once: true }));
}

async function readStressEvents(eventsPath: string) {
  return (await readFile(eventsPath, "utf8"))
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => parseStressEvent(JSON.parse(line)));
}
