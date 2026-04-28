import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it } from "node:test";

import { DELIVERY_RESULT_SCHEMA_VERSION, type CiSnapshot, type DeliveryResult } from "@protostar/delivery-runtime";

import { drivePollCiStatus } from "./poll-ci-driver.js";

const cleanupDirs: string[] = [];

describe("drivePollCiStatus", () => {
  afterEach(async () => {
    await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("persists one terminal snapshot, terminal event, and updated result", async () => {
    const runDir = await makeRunDir("run_ci_terminal_");
    const initial = initialResult();

    const result = await drivePollCiStatus({
      initialResult: initial,
      poll: generator([snapshot("2026-04-28T12:00:00.000Z", "pass", true)]),
      runDir,
      fs,
      signal: new AbortController().signal
    });

    assert.equal(result.ciVerdict, "pass");
    assert.equal(result.ciSnapshots.length, 1);
    assert.equal((await readEvents(runDir)).length, 2);
    assert.deepEqual((await readEvents(runDir)).map((event) => event["kind"]), ["ci-snapshot", "ci-terminal"]);
    assert.equal((await readResult(runDir))["ciVerdict"], "pass");
  });

  it("keeps all snapshots when fewer than the rolling window cap", async () => {
    const runDir = await makeRunDir("run_ci_pending_");
    const snapshots = [
      ...Array.from({ length: 5 }, (_, index) => snapshot(`2026-04-28T12:00:0${index}.000Z`, "pending", false)),
      snapshot("2026-04-28T12:00:06.000Z", "fail", true)
    ];

    const result = await drivePollCiStatus({
      initialResult: initialResult(),
      poll: generator(snapshots),
      runDir,
      fs,
      signal: new AbortController().signal
    });

    assert.equal(result.ciVerdict, "fail");
    assert.equal(result.ciSnapshots.length, 6);
    assert.equal((await readEvents(runDir)).length, 7);
  });

  it("keeps first snapshot plus last ten when the rolling window exceeds eleven", async () => {
    const runDir = await makeRunDir("run_ci_rolling_");
    const snapshots = Array.from({ length: 15 }, (_, index) =>
      snapshot(`2026-04-28T12:00:${String(index).padStart(2, "0")}.000Z`, index === 14 ? "pass" : "pending", index === 14)
    );

    const result = await drivePollCiStatus({
      initialResult: initialResult(),
      poll: generator(snapshots),
      runDir,
      fs,
      signal: new AbortController().signal
    });

    assert.equal(result.ciSnapshots.length, 11);
    assert.equal(result.ciSnapshots[0]?.at, "2026-04-28T12:00:00.000Z");
    assert.equal(result.ciSnapshots[1]?.at, "2026-04-28T12:00:05.000Z");
    assert.equal(result.ciSnapshots[10]?.at, "2026-04-28T12:00:14.000Z");
    assert.equal(await pathExists(resolve(runDir, "delivery/delivery-result.json.tmp")), false);
  });

  it("records pre-aborted cancellation without iterating the poll generator", async () => {
    const runDir = await makeRunDir("run_ci_cancelled_");
    const controller = new AbortController();
    controller.abort("sigint");

    const result = await drivePollCiStatus({
      initialResult: initialResult(),
      poll: throwingGenerator(new Error("poll should not be consumed")),
      runDir,
      fs,
      signal: controller.signal
    });

    assert.equal(result.ciVerdict, "cancelled");
    assert.deepEqual((await readEvents(runDir)).map((event) => event["kind"]), ["ci-cancelled"]);
  });

  it("records cancellation when the generator throws AbortError after a snapshot", async () => {
    const runDir = await makeRunDir("run_ci_abort_mid_");
    const controller = new AbortController();

    const result = await drivePollCiStatus({
      initialResult: initialResult(),
      poll: abortAfterFirstSnapshot(controller),
      runDir,
      fs,
      signal: controller.signal
    });

    assert.equal(result.ciVerdict, "cancelled");
    assert.deepEqual((await readEvents(runDir)).map((event) => event["kind"]), ["ci-snapshot", "ci-cancelled"]);
  });

  it("records timeout-pending with exhaustedAt for timeout aborts", async () => {
    const runDir = await makeRunDir("run_ci_timeout_");
    const controller = new AbortController();
    controller.abort("timeout");

    const result = await drivePollCiStatus({
      initialResult: initialResult(),
      poll: throwingGenerator(abortError()),
      runDir,
      fs,
      signal: controller.signal
    });

    assert.equal(result.ciVerdict, "timeout-pending");
    assert.equal(typeof result.exhaustedAt, "string");
    assert.deepEqual((await readEvents(runDir)).map((event) => event["kind"]), ["ci-timeout"]);
  });

  it("writes ci-events.jsonl append-only with monotonically growing byte offsets", async () => {
    const runDir = await makeRunDir("run_ci_append_");

    await drivePollCiStatus({
      initialResult: initialResult(),
      poll: generator([
        snapshot("2026-04-28T12:00:00.000Z", "pending", false),
        snapshot("2026-04-28T12:00:01.000Z", "pending", false),
        snapshot("2026-04-28T12:00:02.000Z", "pass", true)
      ]),
      runDir,
      fs,
      signal: new AbortController().signal
    });

    const raw = await fs.readFile(resolve(runDir, "delivery/ci-events.jsonl"), "utf8");
    const offsets = raw.trimEnd().split("\n").map((line, index, lines) =>
      Buffer.byteLength(lines.slice(0, index + 1).join("\n") + "\n", "utf8")
    );
    assert.deepEqual(offsets, [...offsets].sort((a, b) => a - b));
    assert.equal((await stat(resolve(runDir, "delivery/ci-events.jsonl"))).size, offsets.at(-1));
  });
});

function initialResult(): DeliveryResult {
  return {
    schemaVersion: DELIVERY_RESULT_SCHEMA_VERSION,
    runId: "run_20260428120000",
    status: "delivered",
    branch: "protostar/cosmetic-tweak/20260428120000-abcdef12",
    prUrl: "https://github.com/protostar/factory/pull/1",
    prNumber: 1,
    headSha: "head",
    baseSha: "base",
    baseBranch: "main",
    createdAt: "2026-04-28T12:00:00.000Z",
    ciVerdict: "pending",
    ciVerdictUpdatedAt: "2026-04-28T12:00:00.000Z",
    ciSnapshots: [],
    evidenceComments: [],
    commentFailures: [],
    screenshots: { status: "deferred-v01", reason: "test" }
  };
}

function snapshot(at: string, verdict: CiSnapshot["verdict"], terminal: boolean): CiSnapshot {
  return {
    at,
    verdict,
    terminal,
    checks: [{ name: "build", status: terminal ? "completed" : "queued", conclusion: terminal && verdict === "pass" ? "success" : null }]
  };
}

async function* generator(snapshots: readonly CiSnapshot[]): AsyncGenerator<CiSnapshot, void, unknown> {
  for (const snap of snapshots) {
    yield snap;
  }
}

async function* abortAfterFirstSnapshot(controller: AbortController): AsyncGenerator<CiSnapshot, void, unknown> {
  yield snapshot("2026-04-28T12:00:00.000Z", "pending", false);
  controller.abort("sentinel");
  throw abortError();
}

async function* throwingGenerator(error: Error): AsyncGenerator<CiSnapshot, void, unknown> {
  throw error;
}

function abortError(): Error {
  const error = new Error("AbortError");
  error.name = "AbortError";
  return error;
}

async function makeRunDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

async function readEvents(runDir: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(resolve(runDir, "delivery/ci-events.jsonl"), "utf8");
  return raw.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function readResult(runDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(resolve(runDir, "delivery/delivery-result.json"), "utf8")) as Record<string, unknown>;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
