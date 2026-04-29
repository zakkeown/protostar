import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, it } from "node:test";

import { formatStressReport, parseStressEvent, parseStressReport } from "@protostar/artifacts";

import {
  appendStressEvent,
  resolveStressSessionPaths,
  writeCapBreach,
  writeStressReportAtomic,
  writeWedgeEvidence
} from "./stress-session.js";

const sourceDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../src");
const tempRoots: string[] = [];

describe("stress session paths", () => {
  after(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("confines sessions to the exact .protostar/stress/<sessionId> root", async () => {
    const workspace = await tempWorkspace();

    const paths = resolveStressSessionPaths(workspace, "stress_20260429_001");

    assert.equal(paths.stressRoot, join(workspace, ".protostar", "stress"));
    assert.equal(paths.sessionDir, join(workspace, ".protostar", "stress", "stress_20260429_001"));
    assert.equal(paths.cursorPath, join(paths.sessionDir, "cursor.json"));
    assert.equal(paths.eventsPath, join(paths.sessionDir, "events.jsonl"));
    assert.equal(paths.reportPath, join(paths.sessionDir, "stress-report.json"));
    assert.equal(paths.capBreachPath, join(paths.sessionDir, "phase-11-cap-breach.json"));
    assert.equal(paths.wedgeEvidencePath, join(paths.sessionDir, "wedge-evidence.json"));
  });

  for (const sessionId of ["", "../escape", "nested/session", "nested\\session"] as const) {
    it(`rejects unsafe session id ${JSON.stringify(sessionId)}`, async () => {
      const workspace = await tempWorkspace();

      assert.throws(() => resolveStressSessionPaths(workspace, sessionId), /sessionId/);
    });
  }

  it("appends events without truncating prior evidence and assigns monotonic sequences", async () => {
    const workspace = await tempWorkspace();
    const paths = resolveStressSessionPaths(workspace, "stress_20260429_002");
    const existing = {
      sessionId: "stress_20260429_002",
      sequence: 7,
      at: "2026-04-29T00:00:00Z",
      type: "existing",
      payload: { runId: "run_existing" }
    };
    await mkdir(dirname(paths.eventsPath), { recursive: true });
    await writeFile(paths.eventsPath, `${JSON.stringify(existing)}\n`, "utf8");
    const beforeHash = await sha256(paths.eventsPath);

    const [first, second] = await Promise.all([
      appendStressEvent({
        paths,
        at: "2026-04-29T00:00:01Z",
        type: "run-started",
        payload: { runId: "run_a" }
      }),
      appendStressEvent({
        paths,
        at: "2026-04-29T00:00:02Z",
        type: "run-finished",
        payload: { runId: "run_b" }
      })
    ]);

    assert.notEqual(await sha256(paths.eventsPath), beforeHash);
    const lines = (await readFile(paths.eventsPath, "utf8")).trim().split("\n");
    assert.equal(lines.length, 3);
    const events = lines.map((line) => parseStressEvent(JSON.parse(line)));
    assert.deepEqual(events.map((event) => event.sequence), [7, 8, 9]);
    assert.deepEqual([first.sequence, second.sequence].sort((left, right) => left - right), [8, 9]);
  });

  it("uses append mode and datasync for durable events.jsonl writes", async () => {
    const source = await readFile(join(sourceDir, "stress", "stress-session.ts"), "utf8");

    assert.match(source, /events\.jsonl/);
    assert.match(source, /O_APPEND|appendFile|open\([^)]*"a/);
    assert.match(source, /datasync\(/);
  });

  it("writes canonical stress reports atomically using the Plan 11-08 formatter", async () => {
    const workspace = await tempWorkspace();
    const paths = resolveStressSessionPaths(workspace, "stress_20260429_003");
    const report = parseStressReport({
      sessionId: "stress_20260429_003",
      startedAt: "2026-04-29T00:00:00Z",
      finishedAt: "2026-04-29T00:03:00Z",
      totalRuns: 1,
      headlessMode: "local-daemon",
      llmBackend: "mock",
      shape: "sustained-load",
      perArchetype: [
        {
          archetype: "cosmetic-tweak",
          runs: 1,
          passes: 1,
          passRate: 1,
          threshold: 0.8,
          met: true
        }
      ],
      perRun: [
        {
          runId: "run_one",
          seedId: "button-color-hover",
          archetype: "cosmetic-tweak",
          outcome: "pass",
          durationMs: 180000
        }
      ]
    });

    await writeStressReportAtomic({ paths, report });

    assert.equal(await readFile(paths.reportPath, "utf8"), formatStressReport(report));
    await assertMissing(`${paths.reportPath}.tmp`);
  });

  it("writes phase-11-cap-breach.json and wedge-evidence.json under the stress session", async () => {
    const workspace = await tempWorkspace();
    const paths = resolveStressSessionPaths(workspace, "stress_20260429_004");

    await writeCapBreach({
      paths,
      breach: {
        kind: "run-count",
        value: 501,
        limit: 500,
        shape: "sustained-load"
      },
      capSource: "factory.stress.caps",
      detectedAt: "2026-04-29T00:04:00Z"
    });
    await writeWedgeEvidence({
      paths,
      evidence: {
        sessionId: "stress_20260429_004",
        runId: "run_wedged",
        detectedAt: "2026-04-29T00:05:00Z",
        p95SuccessfulDurationMs: 1000,
        idleDurationMs: 5001,
        reason: "status unchanged for > 5x p95"
      }
    });

    const capBreach = JSON.parse(await readFile(paths.capBreachPath, "utf8")) as {
      readonly breach: { readonly kind: string; readonly shape: string };
      readonly capSource: string;
    };
    assert.equal(capBreach.breach.kind, "run-count");
    assert.equal(capBreach.breach.shape, "sustained-load");
    assert.equal(capBreach.capSource, "factory.stress.caps");
    assert.equal(paths.capBreachPath.endsWith(".protostar/stress/stress_20260429_004/phase-11-cap-breach.json"), true);

    const wedge = JSON.parse(await readFile(paths.wedgeEvidencePath, "utf8")) as { readonly runId: string };
    assert.equal(wedge.runId, "run_wedged");
    assert.equal(paths.wedgeEvidencePath.endsWith(".protostar/stress/stress_20260429_004/wedge-evidence.json"), true);
  });
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "stress-session-"));
  tempRoots.push(workspace);
  return workspace;
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function assertMissing(path: string): Promise<void> {
  await assert.rejects(access(path), /ENOENT/);
}
