import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, it, mock } from "node:test";

import { validatePrBody } from "@protostar/delivery";
import { DELIVERY_RESULT_SCHEMA_VERSION, type CiSnapshot, type DeliveryRunOutcome, type ProtostarOctokit } from "@protostar/delivery-runtime";
import { mintDeliveryAuthorization } from "@protostar/review";

import { wireExecuteDelivery } from "./execute-delivery-wiring.js";
import type { DeliveryBodyInput } from "./assemble-delivery-body.js";

const cleanupDirs: string[] = [];

describe("wireExecuteDelivery", () => {
  afterEach(async () => {
    mock.restoreAll();
    await Promise.all(cleanupDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("delivers, writes delivery-result.json, emits PR/comment events, and drives CI polling", async () => {
    const runDir = await makeRunDir("run_wire_delivered_");
    const executeDelivery = mock.fn(async (): Promise<DeliveryRunOutcome> => deliveredOutcome());
    const pollCiStatus = mock.fn(() => generator([snapshot("2026-04-28T12:00:02.000Z", "pass", true)]));

    const result = await wireExecuteDelivery(baseInput(runDir), { executeDelivery, pollCiStatus });

    assert.deepEqual(result, { status: "delivered" });
    assert.equal(executeDelivery.mock.callCount(), 1);
    assert.equal(pollCiStatus.mock.callCount(), 1);
    const plan = (executeDelivery.mock.calls as readonly { readonly arguments: readonly unknown[] }[])[0]?.arguments[1] as
      | { readonly branch: string; readonly title: string }
      | undefined;
    assert.equal(plan?.branch.startsWith("protostar/cosmetic-tweak/run-wire-abcdef12"), true);
    assert.equal(String(plan?.title), "Deliver the factory run");
    const deliveryResult = await readResult(runDir);
    assert.equal(deliveryResult["schemaVersion"], DELIVERY_RESULT_SCHEMA_VERSION);
    assert.equal(deliveryResult["status"], "delivered");
    assert.equal(deliveryResult["ciVerdict"], "pass");
    assert.equal(deliveryResult["prUrl"], "https://github.com/protostar/factory/pull/7");
    assert.equal((deliveryResult["ciSnapshots"] as unknown[]).length, 2);
    assert.equal(await pathExists(resolve(runDir, "delivery/delivery-result.json.tmp")), false);
    assert.deepEqual((await readEvents(runDir)).map((event) => event["kind"]), [
      "pr-created",
      "comment-posted",
      "comment-failed",
      "ci-snapshot",
      "ci-terminal"
    ]);
  });

  it("persists delivery-blocked when executeDelivery refuses and does not start polling", async () => {
    const runDir = await makeRunDir("run_wire_blocked_");
    const executeDelivery = mock.fn(async (): Promise<DeliveryRunOutcome> => ({
      status: "delivery-blocked",
      refusal: { kind: "remote-diverged", evidence: { branch: "branch", expectedSha: null, remoteSha: "remote" } }
    }));
    const pollCiStatus = mock.fn(() => generator([]));

    const result = await wireExecuteDelivery(baseInput(runDir), { executeDelivery, pollCiStatus });

    assert.deepEqual(result, { status: "delivery-blocked" });
    assert.equal(executeDelivery.mock.callCount(), 1);
    assert.equal(pollCiStatus.mock.callCount(), 0);
    const deliveryResult = await readResult(runDir);
    assert.equal(deliveryResult["status"], "delivery-blocked");
    assert.deepEqual((deliveryResult["refusal"] as Record<string, unknown>)["kind"], "remote-diverged");
  });

  it("persists delivery-blocked for title brand refusals before executeDelivery", async () => {
    const runDir = await makeRunDir("run_wire_title_");
    const executeDelivery = mock.fn(async (): Promise<DeliveryRunOutcome> => deliveredOutcome());

    const result = await wireExecuteDelivery(
      {
        ...baseInput(runDir),
        intent: { title: "bad\u0007title", archetype: "cosmetic-tweak" }
      },
      { executeDelivery }
    );

    assert.deepEqual(result, { status: "delivery-blocked" });
    assert.equal(executeDelivery.mock.callCount(), 0);
    assert.equal((await readResult(runDir))["status"], "delivery-blocked");
    assert.deepEqual(((await readResult(runDir))["refusal"] as Record<string, unknown>)["kind"], "control-character");
  });

  it("writes a schema 1.0.0 result and PR-created event before CI capture mutates the result", async () => {
    const runDir = await makeRunDir("run_wire_schema_");

    await wireExecuteDelivery(baseInput(runDir), {
      executeDelivery: async () => deliveredOutcome(),
      pollCiStatus: () => generator([])
    });

    assert.equal((await readResult(runDir))["schemaVersion"], "1.0.0");
    assert.equal((await readEvents(runDir))[0]?.["kind"], "pr-created");
  });
});

function baseInput(runDir: string) {
  return {
    runId: "run-wire",
    runDir,
    authorization: mintDeliveryAuthorization({ runId: "run-wire", decisionPath: "review/decision.json" }),
    intent: { title: "Deliver the factory run", archetype: "cosmetic-tweak" },
    target: { owner: "protostar", repo: "factory", baseBranch: "main" },
    bodyInput: bodyInput(),
    token: "ghp_123456789012345678901234567890123456",
    octokit: {} as ProtostarOctokit,
    baseSha: "base-sha",
    workspaceDir: "/tmp/workspace",
    fs,
    signal: new AbortController().signal,
    branchSuffix: "abcdef12",
    requiredChecks: ["build"]
  };
}

function bodyInput(): DeliveryBodyInput {
  return {
    runId: "run-wire",
    target: { owner: "protostar", repo: "factory", baseBranch: "main" },
    mechanical: { verdict: "pass", findings: [] },
    critiques: [],
    iterations: [],
    artifacts: [
      {
        stage: "review",
        kind: "review-gate",
        uri: "review-gate.json",
        description: "Review gate"
      }
    ]
  };
}

function deliveredOutcome(): DeliveryRunOutcome {
  const validatedComment = validatePrBody("comment");
  const commentBody = validatedComment.ok ? validatedComment.value : undefined;
  assert.ok(commentBody);
  return {
    status: "delivered",
    prUrl: "https://github.com/protostar/factory/pull/7",
    prNumber: 7,
    headSha: "head-sha",
    baseSha: "base-sha",
    initialCiSnapshot: {
      at: "2026-04-28T12:00:01.000Z",
      checks: [{ name: "build", status: "queued", conclusion: null }]
    },
    evidenceComments: [{ kind: "mechanical-full", commentId: 11, url: "https://github.com/comment/11" }],
    commentFailures: [{ kind: "judge-transcripts", reason: "rate-limit" }]
  };
}

function snapshot(at: string, verdict: CiSnapshot["verdict"], terminal: boolean): CiSnapshot {
  return {
    at,
    verdict,
    terminal,
    checks: [{ name: "build", status: "completed", conclusion: verdict === "pass" ? "success" : null }]
  };
}

async function* generator(snapshots: readonly CiSnapshot[]): AsyncGenerator<CiSnapshot, void, unknown> {
  for (const snap of snapshots) {
    yield snap;
  }
}

async function makeRunDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(resolve(tmpdir(), prefix));
  cleanupDirs.push(dir);
  return dir;
}

async function readResult(runDir: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(resolve(runDir, "delivery/delivery-result.json"), "utf8")) as Record<string, unknown>;
}

async function readEvents(runDir: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(resolve(runDir, "delivery/ci-events.jsonl"), "utf8");
  return raw.trimEnd().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
