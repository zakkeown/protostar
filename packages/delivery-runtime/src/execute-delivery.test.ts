import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import type { StageArtifactRef } from "@protostar/artifacts";
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

const commentKinds = [
  "mechanical-full",
  "judge-transcripts",
  "repair-history",
  "oversized-body-overflow"
] as const satisfies readonly EvidenceCommentKind[];

describe("executeDelivery", () => {
  before(() => nock.disableNetConnect());
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    __resetPushBranchDependenciesForTests();
  });

  it("pushes, creates a PR, posts evidence comments, captures the first CI snapshot, and returns delivered", async (t) => {
    mockPushSuccess(t);
    nockFindExisting([]);
    nockCreatePr({ number: 17, htmlUrl: "https://github.com/octo/repo/pull/17", headSha: "head-sha", baseSha: "base-sha" });
    for (const [index, kind] of commentKinds.entries()) {
      nockCreateEvidenceComment(17, kind, 100 + index);
    }
    nockChecks("head-sha", [{ name: "build", status: "completed", conclusion: "success" }]);

    const result = await executeDelivery(authorization, plan(), ctx());

    assert.equal(result.status, "delivered");
    assert.equal(result.prNumber, 17);
    assert.equal(result.headSha, "head-sha");
    assert.equal(result.baseSha, "base-sha");
    assert.deepEqual(result.initialCiSnapshot.checks, [{ name: "build", status: "completed", conclusion: "success" }]);
    assert.equal(result.evidenceComments.length, 4);
    assert.deepEqual(result.commentFailures, []);
  });

  it("reuses an open PR by updating its body instead of creating a second PR", async (t) => {
    mockPushSuccess(t);
    nockFindExisting([{ state: "open", html_url: "https://github.com/octo/repo/pull/18", number: 18, head: { sha: "head-open" } }]);
    nock("https://api.github.com")
      .patch("/repos/octo/repo/pulls/18", { body })
      .reply(200, { number: 18, html_url: "https://github.com/octo/repo/pull/18", head: { sha: "head-open" }, base: { sha: "base-open" } });
    nockChecks("head-open", []);

    const result = await executeDelivery(authorization, { ...plan(), evidenceComments: [] }, ctx());

    assert.equal(result.status, "delivered");
    assert.equal(result.prNumber, 18);
    assert.equal(result.prUrl, "https://github.com/octo/repo/pull/18");
  });

  it("blocks when the branch already has a closed PR", async (t) => {
    mockPushSuccess(t);
    nockFindExisting([{ state: "closed", html_url: "https://github.com/octo/repo/pull/19", number: 19, head: { sha: "head-closed" } }]);

    const result = await executeDelivery(authorization, plan(), ctx());

    assert.deepEqual(result, {
      status: "delivery-blocked",
      refusal: { kind: "pr-already-closed", evidence: { prUrl: "https://github.com/octo/repo/pull/19", prNumber: 19 } }
    });
  });

  it("records comment failures without blocking delivery", async (t) => {
    mockPushSuccess(t);
    nockFindExisting([]);
    nockCreatePr({ number: 20, htmlUrl: "https://github.com/octo/repo/pull/20", headSha: "head-comment", baseSha: "base-comment" });
    nock("https://api.github.com").get("/repos/octo/repo/issues/20/comments").query(true).reply(200, []);
    nock("https://api.github.com")
      .post("/repos/octo/repo/issues/20/comments")
      .reply(422, { message: `Validation Failed for ${token}` });
    nockChecks("head-comment", []);

    const result = await executeDelivery(authorization, {
      ...plan(),
      evidenceComments: [{ kind: "mechanical-full", body: "bad comment" as PrBody }]
    }, ctx());

    assert.equal(result.status, "delivered");
    assert.deepEqual(result.evidenceComments, []);
    assert.equal(result.commentFailures.length, 1);
    assert.equal(result.commentFailures[0]?.kind, "mechanical-full");
    assert.equal(result.commentFailures[0]?.reason.includes(token), false);
  });

  it("returns delivery-blocked when push refuses the branch", async (t) => {
    __setPushBranchDependenciesForTests({
      fetch: async () => ({ defaultBranch: null, fetchHead: "remote-sha", fetchHeadDescription: null }),
      push: async () => {
        throw new Error("push should not be called");
      },
      resolveRef: async () => "remote-sha"
    });
    t.after(() => __resetPushBranchDependenciesForTests());

    const result = await executeDelivery(authorization, plan(), ctx({ expectedRemoteSha: "different-sha" }));

    assert.equal(result.status, "delivery-blocked");
    assert.equal(result.refusal.kind, "remote-diverged");
  });

  it("blocks delivery when authorization belongs to another run", async () => {
    const result = await executeDelivery(
      mintDeliveryAuthorization({ runId: "run_other", decisionPath: "runs/run_other/review/decision.json" }),
      plan(),
      ctx()
    );

    assert.deepEqual(result, {
      status: "delivery-blocked",
      refusal: {
        kind: "delivery-authorization-mismatch",
        evidence: { expectedRunId: "run_other", actualRunId: "run_123" }
      }
    });
  });

  it("updates the PR body with its assigned URL when a finalizer is provided", async (t) => {
    mockPushSuccess(t);
    nockFindExisting([]);
    nockCreatePr({ number: 21, htmlUrl: "https://github.com/octo/repo/pull/21", headSha: "head-final", baseSha: "base-final" });
    nock("https://api.github.com")
      .patch("/repos/octo/repo/pulls/21", { body: "Delivery body\nPR: https://github.com/octo/repo/pull/21" })
      .reply(200, { number: 21, html_url: "https://github.com/octo/repo/pull/21", head: { sha: "head-final" }, base: { sha: "base-final" } });
    nockChecks("head-final", []);

    const result = await executeDelivery(
      authorization,
      { ...plan(), evidenceComments: [], finalizeBodyWithPrUrl: (prUrl) => `Delivery body\nPR: ${prUrl}` as PrBody },
      ctx()
    );

    assert.equal(result.status, "delivered");
    assert.equal(result.prUrl, "https://github.com/octo/repo/pull/21");
  });

  it("keeps a delivered result when initial CI capture fails after PR creation", async (t) => {
    mockPushSuccess(t);
    nockFindExisting([]);
    nockCreatePr({ number: 22, htmlUrl: "https://github.com/octo/repo/pull/22", headSha: "head-ci-fail", baseSha: "base-ci-fail" });
    nock("https://api.github.com").get("/repos/octo/repo/commits/head-ci-fail/check-runs").query(true).reply(500, {
      message: `Server error ${token}`
    });

    const result = await executeDelivery(authorization, { ...plan(), evidenceComments: [] }, ctx());

    assert.equal(result.status, "delivered");
    assert.equal(result.prNumber, 22);
    assert.deepEqual(result.initialCiSnapshot.checks, []);
    assert.equal(result.initialCiSnapshot.captureError?.includes(token), false);
  });
});

function plan(): DeliveryExecutionPlan {
  return {
    branch,
    title,
    body,
    target,
    artifacts: [{ stage: "review", kind: "decision", uri: "runs/run_123/review/decision.json" } satisfies StageArtifactRef],
    evidenceComments: commentKinds.map((kind) => ({ kind, body: `${kind} body` as PrBody }))
  };
}

function ctx(overrides: Partial<DeliveryRunContext> = {}): DeliveryRunContext {
  return {
    runId: "run_123",
    token,
    signal: new AbortController().signal,
    fs: {},
    octokit: buildOctokit(token),
    remoteUrl: "https://github.com/octo/repo.git",
    workspaceDir: "/workspace",
    expectedRemoteSha: null,
    ...overrides
  };
}

function mockPushSuccess(t: { after: (fn: () => void) => void }): void {
  __setPushBranchDependenciesForTests({
    fetch: async () => {
      const error = new Error("not found");
      Object.assign(error, { code: "NotFoundError" });
      throw error;
    },
    push: async () => ({ ok: true, error: null, refs: { [`refs/heads/${branch}`]: { ok: true, error: "" } } }),
    resolveRef: async () => "head-sha"
  });
  t.after(() => __resetPushBranchDependenciesForTests());
}

function nockFindExisting(prs: readonly unknown[]): void {
  nock("https://api.github.com").get("/repos/octo/repo/pulls").query(true).reply(200, prs);
}

function nockCreatePr(input: { readonly number: number; readonly htmlUrl: string; readonly headSha: string; readonly baseSha: string }): void {
  nock("https://api.github.com")
    .post("/repos/octo/repo/pulls", { head: branch, base: "main", title, body })
    .reply(201, {
      number: input.number,
      html_url: input.htmlUrl,
      head: { sha: input.headSha },
      base: { sha: input.baseSha }
    });
}

function nockCreateEvidenceComment(prNumber: number, kind: EvidenceCommentKind, commentId: number): void {
  const expectedBody = `${buildEvidenceMarker(kind, "run_123")}\n\n${kind} body`;
  nock("https://api.github.com").get(`/repos/octo/repo/issues/${prNumber}/comments`).query(true).reply(200, []);
  nock("https://api.github.com")
    .post(`/repos/octo/repo/issues/${prNumber}/comments`, { body: expectedBody })
    .reply(201, { id: commentId, html_url: `https://github.com/octo/repo/pull/${prNumber}#issuecomment-${commentId}` });
}

function nockChecks(ref: string, checks: readonly { readonly name: string; readonly status: string; readonly conclusion: string | null }[]): void {
  nock("https://api.github.com")
    .get(`/repos/octo/repo/commits/${ref}/check-runs`)
    .query(true)
    .reply(200, { check_runs: checks });
}
