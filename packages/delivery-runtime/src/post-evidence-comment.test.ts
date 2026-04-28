import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import type { PrBody } from "@protostar/delivery";
import { buildEvidenceMarker } from "@protostar/delivery";
import nock from "nock";

import { buildOctokit } from "./octokit-client.js";
import { postEvidenceComment } from "./post-evidence-comment.js";
import type { DeliveryTarget } from "./preflight-full.js";

const target: DeliveryTarget = { owner: "octo", repo: "repo", baseBranch: "main" };
const token = "ghp_FAKE00000000000000000000000000000000";

describe("postEvidenceComment", () => {
  before(() => nock.disableNetConnect());
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("creates a marker-prefixed comment when no matching marker exists", async () => {
    const expectedBody = `${buildEvidenceMarker("mechanical-full", "run_123")}\n\nMechanical evidence` as PrBody;
    nock("https://api.github.com").get("/repos/octo/repo/issues/7/comments").query(true).reply(200, []);
    nock("https://api.github.com")
      .post("/repos/octo/repo/issues/7/comments", { body: expectedBody })
      .reply(201, { id: 101, html_url: "https://github.com/octo/repo/pull/7#issuecomment-101" });

    const result = await postEvidenceComment({
      target,
      prNumber: 7,
      runId: "run_123",
      kind: "mechanical-full",
      body: "Mechanical evidence" as PrBody,
      octokit: buildOctokit(token),
      signal: new AbortController().signal
    });

    assert.deepEqual(result, { ok: true, commentId: 101, url: "https://github.com/octo/repo/pull/7#issuecomment-101" });
  });

  it("updates an existing comment whose first marker line has the same kind and runId", async () => {
    const marker = buildEvidenceMarker("judge-transcripts", "run_123");
    const expectedBody = `${marker}\n\nUpdated judge evidence` as PrBody;
    nock("https://api.github.com")
      .get("/repos/octo/repo/issues/8/comments")
      .query(true)
      .reply(200, [{ id: 202, body: `${marker}\n\nOld`, html_url: "https://github.com/octo/repo/pull/8#issuecomment-202" }]);
    nock("https://api.github.com")
      .patch("/repos/octo/repo/issues/comments/202", { body: expectedBody })
      .reply(200, { id: 202, html_url: "https://github.com/octo/repo/pull/8#issuecomment-202" });

    const result = await postEvidenceComment({
      target,
      prNumber: 8,
      runId: "run_123",
      kind: "judge-transcripts",
      body: "Updated judge evidence" as PrBody,
      octokit: buildOctokit(token),
      signal: new AbortController().signal
    });

    assert.deepEqual(result, { ok: true, commentId: 202, url: "https://github.com/octo/repo/pull/8#issuecomment-202" });
  });

  it("does not update a reviewer comment with a partial marker and mismatched runId", async () => {
    const marker = buildEvidenceMarker("repair-history", "run_123");
    nock("https://api.github.com")
      .get("/repos/octo/repo/issues/9/comments")
      .query(true)
      .reply(200, [
        {
          id: 303,
          body: `${buildEvidenceMarker("repair-history", "run_other")}\n\nReviewer note mentioning ${marker}`,
          html_url: "https://github.com/octo/repo/pull/9#issuecomment-303"
        }
      ]);
    nock("https://api.github.com")
      .post("/repos/octo/repo/issues/9/comments")
      .reply(201, { id: 304, html_url: "https://github.com/octo/repo/pull/9#issuecomment-304" });

    const result = await postEvidenceComment({
      target,
      prNumber: 9,
      runId: "run_123",
      kind: "repair-history",
      body: "Repair evidence" as PrBody,
      octokit: buildOctokit(token),
      signal: new AbortController().signal
    });

    assert.deepEqual(result, { ok: true, commentId: 304, url: "https://github.com/octo/repo/pull/9#issuecomment-304" });
  });

  it("returns a non-blocking failure when GitHub rejects the comment body", async () => {
    nock("https://api.github.com").get("/repos/octo/repo/issues/10/comments").query(true).reply(200, []);
    nock("https://api.github.com").post("/repos/octo/repo/issues/10/comments").reply(422, { message: "Validation Failed" });

    const result = await postEvidenceComment({
      target,
      prNumber: 10,
      runId: "run_123",
      kind: "oversized-body-overflow",
      body: "Overflow evidence" as PrBody,
      octokit: buildOctokit(token),
      signal: new AbortController().signal
    });

    assert.equal(result.ok, false);
    assert.match(result.reason, /Validation Failed|422/);
  });
});
