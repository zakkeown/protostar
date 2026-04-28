import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import nock from "nock";

import { buildOctokit } from "./octokit-client.js";
import { pollCiStatus } from "./poll-ci-status.js";
import type { DeliveryTarget } from "./preflight-full.js";

const target: DeliveryTarget = { owner: "octo", repo: "repo", baseBranch: "main" };
const token = "ghp_FAKE00000000000000000000000000000000";
const headSha = "head-sha";

describe("pollCiStatus", () => {
  before(() => nock.disableNetConnect());
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("yields one terminal snapshot when required checks pass", async () => {
    nockChecks(headSha, [{ name: "build", status: "completed", conclusion: "success" }]);

    const snapshots = await collectPolls({ requiredChecks: ["build"] });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.verdict, "pass");
    assert.equal(snapshots[0]?.terminal, true);
    assert.deepEqual(snapshots[0]?.checks, [{ name: "build", status: "completed", conclusion: "success" }]);
  });

  it("continues after a pending snapshot and stops on terminal success", async () => {
    nockChecks(headSha, [{ name: "build", status: "in_progress", conclusion: null }]);
    nockChecks(headSha, [{ name: "build", status: "completed", conclusion: "success" }]);

    const snapshots = await collectPolls({ requiredChecks: ["build"], intervalMs: 1 });

    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.verdict),
      ["pending", "pass"]
    );
    assert.deepEqual(
      snapshots.map((snapshot) => snapshot.terminal),
      [false, true]
    );
  });

  it("treats an empty required-check allowlist as terminal no-checks-configured", async () => {
    nockChecks(headSha, [{ name: "build", status: "completed", conclusion: "failure" }]);

    const snapshots = await collectPolls({ requiredChecks: [] });

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.verdict, "no-checks-configured");
    assert.equal(snapshots[0]?.terminal, true);
  });

  it("throws AbortError before polling when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("sigint");

    const generator = pollCiStatus({
      target,
      headSha,
      requiredChecks: ["build"],
      octokit: buildOctokit(token),
      signal: controller.signal
    });

    await assert.rejects(generator.next(), isAbortError);
    assert.equal(nock.pendingMocks().length, 0);
  });

  it("throws AbortError when cancelled during the inter-poll sleep", async () => {
    nockChecks(headSha, [{ name: "build", status: "in_progress", conclusion: null }]);
    const controller = new AbortController();
    const generator = pollCiStatus({
      target,
      headSha,
      requiredChecks: ["build"],
      octokit: buildOctokit(token),
      signal: controller.signal,
      intervalMs: 50
    });

    const first = await generator.next();
    assert.equal(first.done, false);
    assert.equal(first.value.verdict, "pending");

    controller.abort("sigint");
    await assert.rejects(generator.next(), isAbortError);
  });
});

async function collectPolls(input: { readonly requiredChecks: readonly string[]; readonly intervalMs?: number }) {
  const snapshots = [];
  const pollInput = {
    target,
    headSha,
    requiredChecks: input.requiredChecks,
    octokit: buildOctokit(token),
    signal: new AbortController().signal,
    ...(input.intervalMs === undefined ? {} : { intervalMs: input.intervalMs })
  };
  for await (const snapshot of pollCiStatus(pollInput)) {
    snapshots.push(snapshot);
  }
  return snapshots;
}

function nockChecks(ref: string, checks: readonly { readonly name: string; readonly status: string; readonly conclusion: string | null }[]): void {
  nock("https://api.github.com")
    .get(`/repos/octo/repo/commits/${ref}/check-runs`)
    .query(true)
    .reply(200, { check_runs: checks });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
