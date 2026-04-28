import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startStubLmstudio } from "../internal/test-fixtures/stub-lmstudio-server.js";
import {
  callLmstudioChatJson,
  callLmstudioChatStream,
  preflightLmstudioModel
} from "./lmstudio-client.js";

describe("lmstudio-client", () => {
  it("streams token events from LM Studio chat completions", async (t) => {
    const server = await startStubLmstudio({ chunks: ["hello", " ", "world"] });
    t.after(() => void server.close());

    const events = await collect(
      callLmstudioChatStream({
        baseUrl: server.baseUrl,
        model: "qwen3-coder-next-mlx-4bit",
        apiKey: "test",
        messages: [{ role: "user", content: "say hello" }],
        stream: true,
        signal: new AbortController().signal,
        timeoutMs: 1_000
      })
    );

    assert.equal(events.filter((event) => event.kind === "token").map((event) => event.text).join(""), "hello world");
    assert.equal(events.at(-1)?.kind, "done");
  });

  it("returns error events for HTTP failures", async (t) => {
    const server = await startStubLmstudio({ chatStatus: 503 });
    t.after(() => void server.close());

    const events = await collect(
      callLmstudioChatStream({
        baseUrl: server.baseUrl,
        model: "qwen3-coder-next-mlx-4bit",
        messages: [{ role: "user", content: "fail" }],
        stream: true,
        signal: new AbortController().signal,
        timeoutMs: 1_000
      })
    );

    assert.deepEqual(events.map((event) => event.kind), ["error"]);
    assert.equal(events[0]?.kind === "error" ? events[0].errorClass : "", "HTTP_503");
  });

  it("posts JSON-mode chat requests", async () => {
    const calls: unknown[] = [];
    const result = await callLmstudioChatJson({
      baseUrl: "http://127.0.0.1:1234/v1",
      model: "qwen3-80b-a3b-mlx-4bit",
      messages: [{ role: "user", content: "judge" }],
      stream: false,
      responseFormat: "json_object",
      signal: new AbortController().signal,
      timeoutMs: 1_000,
      fetchImpl: (async (_url, init) => {
        calls.push(JSON.parse(String(init?.body)));
        return Response.json({ choices: [{ message: { content: "{\"verdict\":\"pass\"}" } }] });
      }) as typeof fetch
    });

    assert.deepEqual(result, { choices: [{ message: { content: "{\"verdict\":\"pass\"}" } }] });
    assert.deepEqual(calls, [
      {
        model: "qwen3-80b-a3b-mlx-4bit",
        messages: [{ role: "user", content: "judge" }],
        stream: false,
        temperature: 0.2,
        top_p: 0.9,
        response_format: { type: "json_object" }
      }
    ]);
  });

  it("preflights a loaded model", async (t) => {
    const server = await startStubLmstudio({
      models: ["qwen3-coder-next-mlx-4bit", "qwen3-80b-a3b-mlx-4bit"]
    });
    t.after(() => void server.close());

    const result = await preflightLmstudioModel({
      baseUrl: server.baseUrl,
      model: "qwen3-80b-a3b-mlx-4bit",
      timeoutMs: 1_000
    });

    assert.deepEqual(result, { status: "ready" });
  });

  it("classifies missing preflight models", async (t) => {
    const server = await startStubLmstudio({ models: ["qwen3-coder-next-mlx-4bit"] });
    t.after(() => void server.close());

    const result = await preflightLmstudioModel({
      baseUrl: server.baseUrl,
      model: "qwen3-80b-a3b-mlx-4bit",
      timeoutMs: 1_000
    });

    assert.equal(result.status, "model-not-loaded");
    assert.equal(result.detail, "qwen3-coder-next-mlx-4bit");
  });
});

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}
