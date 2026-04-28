import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { Octokit } from "@octokit/rest";
import nock from "nock";

describe("nock-vs-octokit-22 fetch interception (Pitfall 6 gate)", () => {
  it("intercepts Octokit's native fetch and returns mocked response", async () => {
    const scope = nock("https://api.github.com")
      .get("/user")
      .reply(200, { login: "test-user" });

    nock.disableNetConnect();
    try {
      const octokit = new Octokit({ auth: "ghp_TESTFAKENOTREAL36CHARSxxxxxxxxxxxxxx" });
      const result = await octokit.rest.users.getAuthenticated();

      assert.equal(result.data.login, "test-user");
      scope.done();
    } finally {
      nock.cleanAll();
      nock.enableNetConnect();
    }
  });
});
