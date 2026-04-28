import { strict as assert } from "node:assert";
import { describe, it, mock } from "node:test";
import nock from "nock";
import { buildOctokit, createProtostarOctokitClass } from "./octokit-client.js";

describe("buildOctokit", () => {
  it("returns an Octokit instance with auth configured", async () => {
    const token = "ghp_123456789012345678901234567890123456";
    const scope = nock("https://api.github.com", {
      reqheaders: { authorization: `token ${token}` }
    })
      .get("/user")
      .reply(200, { login: "protostar-bot" });

    nock.disableNetConnect();
    try {
      const octokit = buildOctokit(token, { userAgent: "protostar-test/0.0.0" });
      const result = await octokit.rest.users.getAuthenticated();

      assert.equal(result.data.login, "protostar-bot");
      scope.done();
    } finally {
      nock.cleanAll();
      nock.enableNetConnect();
    }
  });

  it("composes retry and throttling plugins through the Octokit plugin chain", () => {
    const retryPlugin = mock.fn((_octokit: unknown, _options: unknown) => ({}));
    const throttlingPlugin = mock.fn((_octokit: unknown, _options: unknown) => ({}));

    const OctokitClass = createProtostarOctokitClass(retryPlugin, throttlingPlugin);
    new OctokitClass({ auth: "ghp_123456789012345678901234567890123456" });

    assert.equal(retryPlugin.mock.callCount(), 1);
    assert.equal(throttlingPlugin.mock.callCount(), 1);
  });

  it("uses safe retry and throttling defaults", () => {
    const retryPlugin = mock.fn((_octokit: unknown, _options: unknown) => ({}));
    const throttlingPlugin = mock.fn((_octokit: unknown, _options: unknown) => ({}));
    const OctokitClass = createProtostarOctokitClass(retryPlugin, throttlingPlugin);

    new OctokitClass({
      auth: "ghp_123456789012345678901234567890123456",
      throttle: {
        onRateLimit: (_retryAfter: number, _options: unknown, _octokit: unknown, retryCount: number) => retryCount < 2,
        onSecondaryRateLimit: () => false
      },
      retry: { doNotRetry: [400, 401, 403, 404, 422] }
    });

    const retryOptions = retryPlugin.mock.calls[0]?.arguments[1] as unknown as { retry?: { doNotRetry?: readonly number[] } };
    const throttleOptions = throttlingPlugin.mock.calls[0]?.arguments[1] as unknown as {
      throttle?: {
        onRateLimit?: (retryAfter: number, options: unknown, octokit: unknown, retryCount: number) => boolean;
        onSecondaryRateLimit?: () => boolean;
      };
    };

    assert.deepEqual(retryOptions.retry?.doNotRetry, [400, 401, 403, 404, 422]);
    assert.equal(throttleOptions.throttle?.onRateLimit?.(1, {}, {}, 0), true);
    assert.equal(throttleOptions.throttle?.onRateLimit?.(1, {}, {}, 1), true);
    assert.equal(throttleOptions.throttle?.onRateLimit?.(1, {}, {}, 2), false);
    assert.equal(throttleOptions.throttle?.onSecondaryRateLimit?.(), false);
  });
});
