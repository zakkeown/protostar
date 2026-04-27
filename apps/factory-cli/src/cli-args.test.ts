import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ArgvError, parseCliArgs } from "./cli-args.js";

describe("factory CLI argv parser", () => {
  it("defaults trust to untrusted when the flag is absent", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out"]).trust, "untrusted");
  });

  it("parses --trust trusted", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust", "trusted"]).trust, "trusted");
  });

  it("parses --trust=trusted", () => {
    assert.equal(parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust=trusted"]).trust, "trusted");
  });

  it("rejects unsupported trust values with ArgvError", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--trust", "root"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--trust"
    );
  });

  it("parses --confirmed-intent path", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent", "/tmp/intent.json"])
        .confirmedIntent,
      "/tmp/intent.json"
    );
  });

  it("parses --confirmed-intent=path", () => {
    assert.equal(
      parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent=/tmp/intent.json"])
        .confirmedIntent,
      "/tmp/intent.json"
    );
  });

  it("rejects --confirmed-intent with no path", () => {
    assert.throws(
      () => parseCliArgs(["run", "--draft", "draft.json", "--out", "out", "--confirmed-intent"]),
      (error: unknown) => error instanceof ArgvError && error.flag === "--confirmed-intent"
    );
  });
});
