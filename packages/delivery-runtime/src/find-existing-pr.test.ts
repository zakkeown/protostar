import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import type { BranchName } from "@protostar/delivery";
import nock from "nock";

import { buildOctokit } from "./octokit-client.js";
import { findExistingPr } from "./find-existing-pr.js";
import type { DeliveryTarget } from "./preflight-full.js";

const target: DeliveryTarget = { owner: "octo", repo: "repo", baseBranch: "main" };
const branch = "protostar/cosmetic-tweak/run-abc123" as BranchName;

describe("findExistingPr", () => {
  before(() => nock.disableNetConnect());
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("returns none when the owner:branch query has no PRs", async () => {
    nock("https://api.github.com")
      .get("/repos/octo/repo/pulls")
      .query({ head: "octo:protostar/cosmetic-tweak/run-abc123", state: "all", per_page: "10" })
      .reply(200, []);

    const result = await findExistingPr(target, branch, buildOctokit("ghp_FAKE00000000000000000000000000000000"), new AbortController().signal);

    assert.deepEqual(result, { state: "none" });
  });

  it("returns the open PR details including head SHA", async () => {
    nock("https://api.github.com")
      .get("/repos/octo/repo/pulls")
      .query(true)
      .reply(200, [{ state: "open", html_url: "https://github.com/octo/repo/pull/9", number: 9, head: { sha: "sha-open" } }]);

    const result = await findExistingPr(target, branch, buildOctokit("ghp_FAKE00000000000000000000000000000000"), new AbortController().signal);

    assert.deepEqual(result, {
      state: "open",
      prUrl: "https://github.com/octo/repo/pull/9",
      prNumber: 9,
      headSha: "sha-open"
    });
  });

  it("returns the closed PR details without treating it as reusable", async () => {
    nock("https://api.github.com")
      .get("/repos/octo/repo/pulls")
      .query(true)
      .reply(200, [{ state: "closed", html_url: "https://github.com/octo/repo/pull/10", number: 10, head: { sha: "sha-closed" } }]);

    const result = await findExistingPr(target, branch, buildOctokit("ghp_FAKE00000000000000000000000000000000"), new AbortController().signal);

    assert.deepEqual(result, { state: "closed", prUrl: "https://github.com/octo/repo/pull/10", prNumber: 10 });
  });

  it("returns ambiguous when more than one PR matches the branch", async () => {
    nock("https://api.github.com")
      .get("/repos/octo/repo/pulls")
      .query(true)
      .reply(200, [
        { state: "open", html_url: "https://github.com/octo/repo/pull/11", number: 11, head: { sha: "sha-1" } },
        { state: "closed", html_url: "https://github.com/octo/repo/pull/12", number: 12, head: { sha: "sha-2" } }
      ]);

    const result = await findExistingPr(target, branch, buildOctokit("ghp_FAKE00000000000000000000000000000000"), new AbortController().signal);

    assert.deepEqual(result, {
      state: "ambiguous",
      prUrls: ["https://github.com/octo/repo/pull/11", "https://github.com/octo/repo/pull/12"]
    });
  });
});
