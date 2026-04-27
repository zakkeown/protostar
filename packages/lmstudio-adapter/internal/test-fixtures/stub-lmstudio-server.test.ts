import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";

import { startStubLmstudio } from "./stub-lmstudio-server.js";

describe("stub LM Studio server", () => {
  it("serves configured model ids from GET /v1/models", async (t) => {
    const server = await startStubLmstudio({ models: ["m1", "m2"] });
    t.after(() => server.close());

    const response = await fetch(`${server.baseUrl}/models`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      object: "list",
      data: [
        { id: "m1", object: "model", owned_by: "organization_owner" },
        { id: "m2", object: "model", owned_by: "organization_owner" }
      ]
    });
  });

  it("streams configured chat completion chunks followed by DONE", async (t) => {
    const server = await startStubLmstudio({ chunks: ["a", "b", "c"] });
    t.after(() => server.close());

    const frames = await postAndReadSseFrames(server.baseUrl, { stream: true });
    assert.deepEqual(contentFrames(frames), ["a", "b", "c"]);
    assert.equal(frames.at(-1), "data: [DONE]");
  });

  it("returns a non-streaming body for configured chat status failures", async (t) => {
    const server = await startStubLmstudio({ chatStatus: 503 });
    t.after(() => server.close());

    const response = await postChat(server.baseUrl, { stream: true });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), "stub lmstudio chat failure: 503");
  });

  it("closes the socket after the configured number of chunks", async (t) => {
    const server = await startStubLmstudio({ chunks: ["a", "b"], closeAfterChunks: 1 });
    t.after(() => server.close());

    const response = await postChat(server.baseUrl, { stream: true });
    assert.equal(response.status, 200);
    assert.ok(response.body);
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.equal(first.done, false);
    const firstText = new TextDecoder().decode(first.value);
    assert.match(firstText, /"content":"a"/);
    await assert.rejects(async () => {
      while (!(await reader.read()).done) {
        // Drain until undici reports the aborted socket.
      }
    });
  });

  it("delays between streamed chunks", async (t) => {
    const server = await startStubLmstudio({
      chunks: ["a", "b"],
      delayMsBetweenChunks: 100
    });
    t.after(() => server.close());

    const response = await postChat(server.baseUrl, { stream: true });
    assert.ok(response.body);
    const reader = response.body.getReader();
    await reader.read();
    const start = performance.now();
    await reader.read();
    const elapsedMs = performance.now() - start;
    assert.ok(elapsedMs >= 80, `expected at least 80ms delay, got ${elapsedMs}`);
  });

  it("emits only DONE for empty streams", async (t) => {
    const server = await startStubLmstudio({ emptyStream: true });
    t.after(() => server.close());

    assert.deepEqual(await postAndReadSseFrames(server.baseUrl, { stream: true }), ["data: [DONE]"]);
  });

  it("emits malformed SSE for parser rejection tests", async (t) => {
    const server = await startStubLmstudio({ malformedSse: true });
    t.after(() => server.close());

    assert.deepEqual(await postAndReadSseFrames(server.baseUrl, { stream: true }), [
      "data: {not json"
    ]);
  });

  it("records each chat request body", async (t) => {
    const server = await startStubLmstudio();
    t.after(() => server.close());

    await postAndReadSseFrames(server.baseUrl, { stream: true, messages: [{ role: "user", content: "one" }] });
    await postAndReadSseFrames(server.baseUrl, { stream: true, messages: [{ role: "user", content: "two" }] });

    assert.equal(server.chatRequests.length, 2);
    assert.deepEqual(server.chatRequests.map((request) => request.method), ["POST", "POST"]);
    assert.deepEqual(server.chatRequests.map((request) => request.body), [
      { stream: true, messages: [{ role: "user", content: "one" }] },
      { stream: true, messages: [{ role: "user", content: "two" }] }
    ]);
  });

  it("releases the listening socket on close", async () => {
    const server = await startStubLmstudio();
    const url = `${server.baseUrl}/models`;
    await server.close();
    await delay(10);

    await assert.rejects(fetch(url));
  });
});

async function postAndReadSseFrames(baseUrl: string, body: unknown): Promise<string[]> {
  const response = await postChat(baseUrl, body);
  assert.equal(response.status, 200);
  assert.ok(response.body);
  return readSseFrames(response.body);
}

async function postChat(baseUrl: string, body: unknown): Promise<Response> {
  return fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function readSseFrames(stream: ReadableStream<Uint8Array>): Promise<string[]> {
  const text = await new Response(stream).text();
  return text
    .trim()
    .split("\n\n")
    .filter((frame) => frame.length > 0);
}

function contentFrames(frames: readonly string[]): string[] {
  return frames
    .filter((frame) => frame.startsWith("data: {"))
    .map((frame) => JSON.parse(frame.slice("data: ".length)))
    .filter((payload) => payload.choices?.[0]?.delta?.content !== undefined)
    .map((payload) => payload.choices[0].delta.content);
}
