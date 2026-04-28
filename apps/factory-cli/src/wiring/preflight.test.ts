import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { preflightCoderAndJudge } from "./preflight.js";

describe("preflightCoderAndJudge", () => {
  it("returns ready when both coder and judge models are loaded", async () => {
    const result = await preflightCoderAndJudge({
      coderBaseUrl: "http://coder.example.local/v1",
      judgeBaseUrl: "http://judge.example.local/v1",
      coderModel: "coder",
      judgeModel: "judge",
      timeoutMs: 1_000,
      fetchImpl: modelsFetch(["coder", "judge"])
    });

    assert.deepEqual(result, { status: "ready" });
  });

  it("returns coder-model-not-loaded and short-circuits judge checks", async () => {
    let calls = 0;
    const result = await preflightCoderAndJudge({
      coderBaseUrl: "http://coder.example.local/v1",
      judgeBaseUrl: "http://judge.example.local/v1",
      coderModel: "coder",
      judgeModel: "judge",
      timeoutMs: 1_000,
      fetchImpl: (async () => {
        calls += 1;
        return Response.json({ data: [{ id: "judge" }] });
      }) as typeof fetch
    });

    assert.deepEqual(result, { status: "coder-model-not-loaded", detail: "coder" });
    assert.equal(calls, 1);
  });

  it("returns judge-model-not-loaded when the coder is loaded but judge is missing", async () => {
    const result = await preflightCoderAndJudge({
      coderBaseUrl: "http://coder.example.local/v1",
      judgeBaseUrl: "http://judge.example.local/v1",
      coderModel: "coder",
      judgeModel: "judge",
      timeoutMs: 1_000,
      fetchImpl: modelsFetch(["coder"])
    });

    assert.deepEqual(result, { status: "judge-model-not-loaded", detail: "judge" });
  });

  it("returns unreachable when LM Studio cannot be reached", async () => {
    const result = await preflightCoderAndJudge({
      coderBaseUrl: "http://127.0.0.1:9/v1",
      judgeBaseUrl: "http://127.0.0.1:9/v1",
      coderModel: "coder",
      judgeModel: "judge",
      timeoutMs: 20
    });

    assert.equal(result.status, "unreachable");
  });

  it("checks coder and judge models against their configured base URLs", async () => {
    const urls: string[] = [];

    const result = await preflightCoderAndJudge({
      coderBaseUrl: "http://coder.example.local/v1",
      judgeBaseUrl: "http://judge.example.local/v1",
      coderModel: "coder",
      judgeModel: "judge",
      timeoutMs: 1_000,
      fetchImpl: (async (url) => {
        urls.push(String(url));
        return Response.json({ data: [{ id: urls.length === 1 ? "coder" : "judge" }] });
      }) as typeof fetch
    });

    assert.deepEqual(result, { status: "ready" });
    assert.deepEqual(urls, [
      "http://coder.example.local/v1/models",
      "http://judge.example.local/v1/models"
    ]);
  });
});

function modelsFetch(models: readonly string[]): typeof fetch {
  return (async () => Response.json({ data: models.map((id) => ({ id })) })) as typeof fetch;
}
