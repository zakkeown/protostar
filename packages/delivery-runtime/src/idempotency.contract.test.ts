import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import type { BranchName, EvidenceCommentKind, PrBody, PrTitle } from "@protostar/delivery";
import { buildEvidenceMarker } from "@protostar/delivery";
import { mintDeliveryAuthorization } from "@protostar/review";
import nock from "nock";

import { buildOctokit } from "./octokit-client.js";
import { executeDelivery, type DeliveryExecutionPlan, type DeliveryRunContext } from "./execute-delivery.js";
import {
  __resetPushBranchDependenciesForTests,
  __setPushBranchDependenciesForTests
} from "./push-branch.js";

const branch = "protostar/cosmetic-tweak/run-abc123" as BranchName;
const title = "Protostar delivery" as PrTitle;
const body = "Delivery body" as PrBody;
const target = { owner: "octo", repo: "repo", baseBranch: "main" };
const token = "ghp_FAKE00000000000000000000000000000000";
const authorization = mintDeliveryAuthorization({ runId: "run_123", decisionPath: "runs/run_123/review/decision.json" });
const kinds = ["mechanical-full", "judge-transcripts", "repair-history", "oversized-body-overflow"] as const satisfies readonly EvidenceCommentKind[];

describe("executeDelivery idempotency contract", () => {
  before(() => nock.disableNetConnect());
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    __resetPushBranchDependenciesForTests();
  });

  it("re-delivery with the same runId produces one PR and four updated comments, not duplicate comments", async (t) => {
    mockPushSuccess(t);
    nock("https://api.github.com").get("/repos/octo/repo/pulls").query(true).reply(200, []);
    nock("https://api.github.com")
      .post("/repos/octo/repo/pulls")
      .reply(201, { number: 31, html_url: "https://github.com/octo/repo/pull/31", head: { sha: "head-sha" }, base: { sha: "base-sha" } });
    for (const [index, kind] of kinds.entries()) {
      nock("https://api.github.com").get("/repos/octo/repo/issues/31/comments").query(true).reply(200, []);
      nock("https://api.github.com")
        .post("/repos/octo/repo/issues/31/comments")
        .reply(201, { id: 400 + index, html_url: `https://github.com/octo/repo/pull/31#issuecomment-${400 + index}` });
    }
    nockChecks("head-sha");

    const first = await executeDelivery(authorization, plan(), ctx());

    assert.equal(first.status, "delivered");
    assert.equal(first.evidenceComments.length, 4);

    mockPushSuccess(t);
    nock("https://api.github.com")
      .get("/repos/octo/repo/pulls")
      .query(true)
      .reply(200, [{ state: "open", html_url: "https://github.com/octo/repo/pull/31", number: 31, head: { sha: "head-sha" } }]);
    nock("https://api.github.com")
      .patch("/repos/octo/repo/pulls/31")
      .reply(200, { number: 31, html_url: "https://github.com/octo/repo/pull/31", head: { sha: "head-sha" }, base: { sha: "base-sha" } });

    const createCommentSecondRun = nock("https://api.github.com").post("/repos/octo/repo/issues/31/comments").reply(500);
    for (const [index, kind] of kinds.entries()) {
      const id = 400 + index;
      nock("https://api.github.com")
        .get("/repos/octo/repo/issues/31/comments")
        .query(true)
        .reply(200, [{ id, body: `${buildEvidenceMarker(kind, "run_123")}\n\nold`, html_url: `https://github.com/octo/repo/pull/31#issuecomment-${id}` }]);
      nock("https://api.github.com")
        .patch(`/repos/octo/repo/issues/comments/${id}`)
        .reply(200, { id, html_url: `https://github.com/octo/repo/pull/31#issuecomment-${id}` });
    }
    nockChecks("head-sha");

    const second = await executeDelivery(authorization, plan(), ctx());

    assert.equal(second.status, "delivered");
    assert.equal(second.prNumber, 31);
    assert.equal(second.evidenceComments.length, 4);
    assert.equal(createCommentSecondRun.isDone(), false, "second delivery must update marker comments instead of creating new ones");
  });
});

function plan(): DeliveryExecutionPlan {
  return {
    branch,
    title,
    body,
    target,
    artifacts: [],
    evidenceComments: kinds.map((kind) => ({ kind, body: `${kind} body` as PrBody }))
  };
}

function ctx(): DeliveryRunContext {
  return {
    runId: "run_123",
    token,
    signal: new AbortController().signal,
    fs: {},
    octokit: buildOctokit(token),
    remoteUrl: "https://github.com/octo/repo.git",
    workspaceDir: "/workspace",
    expectedRemoteSha: null
  };
}

function mockPushSuccess(t: { after: (fn: () => void) => void }): void {
  __setPushBranchDependenciesForTests({
    add: async () => undefined,
    branch: async () => undefined,
    commit: async () => "head-sha",
    fetch: async () => {
      const error = new Error("not found");
      Object.assign(error, { code: "NotFoundError" });
      throw error;
    },
    push: async () => ({ ok: true, error: null, refs: { [`refs/heads/${branch}`]: { ok: true, error: "" } } }),
    remove: async () => undefined,
    resolveRef: async () => "head-sha",
    statusMatrix: async () => [["src/Button.tsx", 1, 2, 1]]
  });
  t.after(() => __resetPushBranchDependenciesForTests());
}

function nockChecks(ref: string): void {
  nock("https://api.github.com").get(`/repos/octo/repo/commits/${ref}/check-runs`).query(true).reply(200, { check_runs: [] });
}
