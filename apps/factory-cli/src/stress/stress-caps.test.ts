import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { resolveStressSessionPaths, writeCapBreach } from "./stress-session.js";
import {
  detectStressCapBreach,
  Q03_STRESS_CAP_DEFAULTS,
  resolveStressCaps
} from "./stress-caps.js";

const tempRoots: string[] = [];

describe("stress caps", () => {
  after(async () => {
    await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
  });

  it("resolves Q-03 default caps for sustained-load, concurrency, fault-injection, and ttt-delivery", () => {
    const resolved = resolveStressCaps({});

    assert.equal(resolved["sustained-load"].maxRuns, 500);
    assert.equal(resolved["sustained-load"].maxWallClockDays, 7);
    assert.equal(resolved.concurrency.maxSessions, 20);
    assert.equal(resolved.concurrency.maxWallClockDays, 3);
    assert.equal(resolved["fault-injection"].maxFaults, 100);
    assert.equal(resolved["fault-injection"].maxWallClockDays, 3);
    assert.equal(resolved["ttt-delivery"].maxAttempts, 50);
    assert.equal(resolved["ttt-delivery"].maxWallClockDays, 14);
    assert.deepEqual(resolved.sources["sustained-load"].maxRuns, "q03-default");
    assert.deepEqual(Q03_STRESS_CAP_DEFAULTS["ttt-delivery"], {
      shape: "ttt-delivery",
      maxAttempts: 50,
      maxWallClockDays: 14
    });
  });

  it("resolves precedence CLI > factory.stress.caps config > Q-03 defaults", () => {
    const resolved = resolveStressCaps({
      cli: {
        "sustained-load": {
          maxRuns: 12
        },
        concurrency: {
          maxWallClockDays: 2
        }
      },
      config: {
        sustainedLoad: {
          maxRuns: 111,
          maxWallClockDays: 6
        },
        concurrency: {
          maxSessions: 8,
          maxWallClockDays: 3
        },
        faultInjection: {
          maxFaults: 90,
          maxWallClockDays: 2
        },
        tttDelivery: {
          maxAttempts: 30,
          maxWallClockDays: 10
        }
      }
    });

    assert.equal(resolved["sustained-load"].maxRuns, 12);
    assert.equal(resolved["sustained-load"].maxWallClockDays, 6);
    assert.equal(resolved.concurrency.maxSessions, 8);
    assert.equal(resolved.concurrency.maxWallClockDays, 2);
    assert.equal(resolved["fault-injection"].maxFaults, 90);
    assert.equal(resolved["ttt-delivery"].maxAttempts, 30);
    assert.equal(resolved.sources["sustained-load"].maxRuns, "cli");
    assert.equal(resolved.sources["sustained-load"].maxWallClockDays, "factory.stress.caps");
    assert.equal(resolved.sources["ttt-delivery"].maxWallClockDays, "factory.stress.caps");
  });

  it("detectStressCapBreach reports run-count and wall-clock breaches with shape", () => {
    const runCount = detectStressCapBreach({
      shape: "sustained-load",
      count: 501,
      startedAt: "2026-04-20T00:00:00Z",
      now: "2026-04-22T00:00:00Z",
      caps: resolveStressCaps({})
    });
    const wallClock = detectStressCapBreach({
      shape: "concurrency",
      count: 1,
      startedAt: "2026-04-20T00:00:00Z",
      now: "2026-04-24T00:00:00Z",
      caps: resolveStressCaps({})
    });

    assert.deepEqual(runCount, {
      kind: "run-count",
      value: 501,
      limit: 500,
      shape: "sustained-load"
    });
    assert.deepEqual(wallClock, {
      kind: "wall-clock",
      value: 4,
      limit: 3,
      shape: "concurrency"
    });
  });

  it("writeCapBreach writes phase-11-cap-breach.json with shape and cap source", async () => {
    const workspace = await tempWorkspace();
    const paths = resolveStressSessionPaths(workspace, "stress_20260429_008");
    const breach = detectStressCapBreach({
      shape: "fault-injection",
      count: 101,
      startedAt: "2026-04-29T00:00:00Z",
      now: "2026-04-29T00:05:00Z",
      caps: resolveStressCaps({})
    });
    assert.ok(breach);

    await writeCapBreach({
      paths,
      breach,
      capSource: "factory.stress.caps",
      detectedAt: "2026-04-29T00:05:00Z"
    });

    const artifact = JSON.parse(await readFile(paths.capBreachPath, "utf8")) as {
      readonly breach: { readonly kind: string; readonly shape: string };
      readonly capSource: string;
    };
    assert.equal(paths.capBreachPath.endsWith("/phase-11-cap-breach.json"), true);
    assert.equal(artifact.breach.kind, "run-count");
    assert.equal(artifact.breach.shape, "fault-injection");
    assert.equal(artifact.capSource, "factory.stress.caps");
  });
});

async function tempWorkspace(): Promise<string> {
  const workspace = await mkdtemp(join(tmpdir(), "stress-caps-"));
  tempRoots.push(workspace);
  return workspace;
}
