import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  callHostedOpenAiCompatibleChatStream,
  redactHostedSecret,
  type HostedOpenAiCompatibleChatEvent
} from "./hosted-openai-client.js";

const API_KEY_ENV = "PROTOSTAR_HOSTED_LLM_API_KEY";
const FAKE_SECRET = "sk-hosted-test-secret";
const REDACTED = "<redacted:PROTOSTAR_HOSTED_LLM_API_KEY>";

describe("hosted-openai-client", () => {
  it("posts OpenAI-compatible chat completions and streams token events", async () => {
    const seen: { readonly url: string; readonly authorization: string | null; readonly body: unknown }[] = [];

    const events = await collect(
      callHostedOpenAiCompatibleChatStream({
        baseUrl: "https://hosted.example/v1/",
        model: "hosted-coder",
        apiKey: FAKE_SECRET,
        apiKeyEnv: API_KEY_ENV,
        messages: [{ role: "user", content: "write a diff" }],
        signal: new AbortController().signal,
        timeoutMs: 1_000,
        fetchImpl: (async (input, init) => {
          const headers = new Headers(init?.headers);
          seen.push({
            url: String(input),
            authorization: headers.get("authorization"),
            body: JSON.parse(String(init?.body))
          });
          return new Response(sseStream(["hello", " world"]), {
            status: 200,
            headers: { "content-type": "text/event-stream" }
          });
        }) as typeof fetch
      })
    );

    assert.equal(seen[0]?.url, "https://hosted.example/v1/chat/completions");
    assert.equal(seen[0]?.authorization, `Bearer ${FAKE_SECRET}`);
    assert.deepEqual(seen[0]?.body, {
      model: "hosted-coder",
      messages: [{ role: "user", content: "write a diff" }],
      stream: true,
      temperature: 0.2,
      top_p: 0.9
    });
    assert.equal(tokens(events), "hello world");
    assert.equal(events.at(-1)?.kind, "done");
  });

  it("redacts HTTP 401 bodies that echo the configured API key", async () => {
    const events = await collect(
      callHostedOpenAiCompatibleChatStream({
        baseUrl: "https://hosted.example/v1",
        model: "hosted-coder",
        apiKey: FAKE_SECRET,
        apiKeyEnv: API_KEY_ENV,
        messages: [{ role: "user", content: "fail" }],
        signal: new AbortController().signal,
        timeoutMs: 1_000,
        fetchImpl: (async () => new Response(`bad token ${FAKE_SECRET}`, { status: 401 })) as typeof fetch
      })
    );

    assert.equal(events[0]?.kind, "error");
    const payload = JSON.stringify(events);
    assert.match(payload, /HTTP_401/);
    assert.match(payload, new RegExp(REDACTED));
    assert.doesNotMatch(payload, new RegExp(FAKE_SECRET));
  });

  it("aborts timed out requests and redacts the fake secret from error text", async () => {
    const events = await collect(
      callHostedOpenAiCompatibleChatStream({
        baseUrl: "https://hosted.example/v1",
        model: "hosted-coder",
        apiKey: FAKE_SECRET,
        apiKeyEnv: API_KEY_ENV,
        messages: [{ role: "user", content: "timeout" }],
        signal: new AbortController().signal,
        timeoutMs: 1,
        fetchImpl: timeoutFetch(FAKE_SECRET)
      })
    );

    assert.deepEqual(events.map((event) => event.kind), ["error"]);
    assert.equal(events[0]?.kind === "error" ? events[0].errorClass : "", "TimeoutError");
    const payload = JSON.stringify(events);
    assert.match(payload, new RegExp(REDACTED));
    assert.doesNotMatch(payload, new RegExp(FAKE_SECRET));
  });

  it("classifies malformed JSON chat responses", async () => {
    const events = await collect(
      callHostedOpenAiCompatibleChatStream({
        baseUrl: "https://hosted.example/v1",
        model: "hosted-coder",
        apiKey: FAKE_SECRET,
        apiKeyEnv: API_KEY_ENV,
        messages: [{ role: "user", content: "malformed" }],
        signal: new AbortController().signal,
        timeoutMs: 1_000,
        fetchImpl: (async () => Response.json({ object: "chat.completion" })) as typeof fetch
      })
    );

    assert.deepEqual(events.map((event) => event.kind), ["error"]);
    assert.equal(events[0]?.kind === "error" ? events[0].errorClass : "", "MalformedResponse");
  });

  it("redacts direct strings with the hosted secret helper", () => {
    assert.equal(redactHostedSecret(`prefix ${FAKE_SECRET} suffix`, FAKE_SECRET, API_KEY_ENV), `prefix ${REDACTED} suffix`);
  });
});

function timeoutFetch(secret: string): typeof fetch {
  return ((_input, init) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new DOMException(`timeout while using ${secret}`, "AbortError")),
        { once: true }
      );
    })) as typeof fetch;
}

function sseStream(chunks: readonly string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }]
            })}\n\n`
          )
        );
      }
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
          })}\n\n`
        )
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}

async function collect<T>(events: AsyncIterable<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function tokens(events: readonly HostedOpenAiCompatibleChatEvent[]): string {
  return events
    .filter((event): event is Extract<HostedOpenAiCompatibleChatEvent, { kind: "token" }> => event.kind === "token")
    .map((event) => event.text)
    .join("");
}
