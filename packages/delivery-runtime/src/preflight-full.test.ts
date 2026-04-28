import { strict as assert } from "node:assert";
import { afterEach, describe, it } from "node:test";
import { Octokit } from "@octokit/rest";
import nock from "nock";
import { preflightDeliveryFull } from "./preflight-full.js";

const token = "ghp_123456789012345678901234567890123456";
const fineGrainedToken =
  "github_pat_1234567890123456789012_12345678901234567890123456789012345678901234567890123456789";
const target = { owner: "protostar", repo: "factory", baseBranch: "main" } as const;
const baseSha = "0123456789abcdef0123456789abcdef01234567";

function octokit(auth = token): Octokit {
  return new Octokit({ auth, userAgent: "protostar-test/0.0.0" });
}

function okRepoAndBranch(scope: nock.Scope): void {
  scope.get("/repos/protostar/factory").reply(200, { name: "factory" });
  scope.get("/repos/protostar/factory/branches/main").reply(200, { commit: { sha: baseSha } });
}

describe("preflightDeliveryFull", () => {
  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  it("returns ok with token login, base sha, and classic PAT scopes", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" });
    okRepoAndBranch(scope);

    nock.disableNetConnect();
    const result = await preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit());

    assert.deepEqual(result, {
      outcome: "ok",
      tokenLogin: "protostar-bot",
      baseSha,
      tokenScopes: ["public_repo"]
    });
    scope.done();
  });

  it("returns token-invalid for malformed token format before making requests", async () => {
    nock.disableNetConnect();
    const result = await preflightDeliveryFull(
      { token: "not-a-token", target, signal: new AbortController().signal },
      octokit("not-a-token")
    );

    assert.deepEqual(result, { outcome: "token-invalid", reason: "format" });
    assert.equal(nock.pendingMocks().length, 0);
  });

  it("returns token-invalid for 401 from users.getAuthenticated", async () => {
    const scope = nock("https://api.github.com").get("/user").reply(401, { message: "Bad credentials" });

    nock.disableNetConnect();
    const result = await preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit());

    assert.deepEqual(result, { outcome: "token-invalid", reason: "401" });
    scope.done();
  });

  it("returns excessive-pat-scope when the token has an admin scope", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo, admin:org" });

    nock.disableNetConnect();
    const result = await preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit());

    assert.deepEqual(result, {
      outcome: "excessive-pat-scope",
      scopes: ["public_repo", "admin:org"],
      forbidden: ["admin:org"]
    });
    scope.done();
  });

  it("returns repo-inaccessible for 403 from repos.get", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" })
      .get("/repos/protostar/factory")
      .reply(403, { message: "Forbidden" });

    nock.disableNetConnect();
    const result = await preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit());

    assert.deepEqual(result, { outcome: "repo-inaccessible", status: 403 });
    scope.done();
  });

  it("returns repo-inaccessible for 404 from repos.get", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" })
      .get("/repos/protostar/factory")
      .reply(404, { message: "Not found" });

    nock.disableNetConnect();
    const result = await preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit());

    assert.deepEqual(result, { outcome: "repo-inaccessible", status: 404 });
    scope.done();
  });

  it("returns base-branch-missing for 404 from repos.getBranch", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "protostar-bot" }, { "X-OAuth-Scopes": "public_repo" })
      .get("/repos/protostar/factory")
      .reply(200, { name: "factory" })
      .get("/repos/protostar/factory/branches/main")
      .reply(404, { message: "Branch not found" });

    nock.disableNetConnect();
    const result = await preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit());

    assert.deepEqual(result, { outcome: "base-branch-missing", baseBranch: "main" });
    scope.done();
  });

  it("treats absent X-OAuth-Scopes as empty scopes for fine-grained PATs", async () => {
    const scope = nock("https://api.github.com").get("/user").reply(200, { login: "protostar-bot" });
    okRepoAndBranch(scope);

    nock.disableNetConnect();
    const result = await preflightDeliveryFull(
      { token: fineGrainedToken, target, signal: new AbortController().signal },
      octokit(fineGrainedToken)
    );

    assert.deepEqual(result, {
      outcome: "ok",
      tokenLogin: "protostar-bot",
      baseSha,
      tokenScopes: []
    });
    scope.done();
  });

  it("propagates hard Octokit errors for callers to classify", async () => {
    const scope = nock("https://api.github.com").get("/user").reply(500, { message: "Server error" });

    nock.disableNetConnect();
    await assert.rejects(
      preflightDeliveryFull({ token, target, signal: new AbortController().signal }, octokit()),
      (error: unknown) => error instanceof Error && "status" in error && error.status === 500
    );
    scope.done();
  });
});
