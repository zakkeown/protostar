import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTransientFailure, TRANSIENT_HTTP_STATUSES } from "./retry-classifier.js";

describe("isTransientFailure", () => {
  it("classifies retryable HTTP statuses as transient", () => {
    for (const status of [408, 429, 500, 502, 503, 504]) {
      assert.equal(TRANSIENT_HTTP_STATUSES.has(status), true);
      assert.equal(isTransientFailure({ kind: "http", status }), true);
    }
  });

  it("classifies permanent HTTP statuses as non-transient", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      assert.equal(TRANSIENT_HTTP_STATUSES.has(status), false);
      assert.equal(isTransientFailure({ kind: "http", status }), false);
    }
  });

  it("classifies Node network error codes as transient", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"]) {
      const error = Object.assign(new Error(code), { code });

      assert.equal(isTransientFailure({ kind: "error", error }), true);
    }
  });

  it("classifies undici TypeError causes with network codes as transient", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"]) {
      const error = new TypeError("fetch failed", {
        cause: Object.assign(new Error(code), { code })
      });

      assert.equal(isTransientFailure({ kind: "error", error }), true);
    }
  });

  it("classifies AbortError as non-transient", () => {
    assert.equal(
      isTransientFailure({
        kind: "error",
        error: new DOMException("The operation was aborted", "AbortError")
      }),
      false
    );
  });

  it("classifies plain errors as non-transient", () => {
    assert.equal(isTransientFailure({ kind: "error", error: new Error("nope") }), false);
  });
});
