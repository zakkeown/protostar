import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

import {
  formatStressEventLine,
  formatStressReport,
  parseStressEvent,
  parseStressReport
} from "@protostar/artifacts";
import type { AdapterContext, AdapterEvent } from "@protostar/execution";
import {
  DEFAULT_HOSTED_OPENAI_API_KEY_ENV,
  createHostedOpenAiCompatibleCoderAdapter,
  redactionToken
} from "@protostar/hosted-llm-adapter";

const LEAK_SENTINEL = "sk-test-protostar-leak-sentinel";
const REDACTED = redactionToken(DEFAULT_HOSTED_OPENAI_API_KEY_ENV);

describe("hosted-secret-redaction contract", () => {
  it("keeps hosted secrets out of adapter events and stress artifacts", async () => {
    const adapter = createHostedOpenAiCompatibleCoderAdapter({
      baseUrl: "https://hosted.example/v1",
      model: "hosted-coder",
      env: { [DEFAULT_HOSTED_OPENAI_API_KEY_ENV]: LEAK_SENTINEL },
      fetchImpl: (async () => new Response(`denied ${LEAK_SENTINEL}`, { status: 401 })) as typeof fetch
    });

    const events = await collectEvents(adapter.execute(toAdapterTask(), createAdapterContext()));
    const adapterPayload = JSON.stringify(events);
    assert.match(adapterPayload, new RegExp(escapeRegExp(REDACTED)));
    assert.doesNotMatch(adapterPayload, new RegExp(escapeRegExp(LEAK_SENTINEL)));

    const reportBytes = formatStressReport(parseStressReport({
      sessionId: "stress_hosted_secret_redaction",
      startedAt: "2026-04-29T00:00:00Z",
      finishedAt: "2026-04-29T00:00:01Z",
      totalRuns: 1,
      headlessMode: "github-hosted",
      llmBackend: "hosted-openai-compatible",
      shape: "fault-injection",
      perArchetype: [
        {
          archetype: "feature-add",
          runs: 1,
          passes: 0,
          passRate: 0,
          threshold: 0.5,
          met: false
        }
      ],
      perRun: [
        {
          runId: "run_hosted_secret",
          seedId: "ttt-game",
          archetype: "feature-add",
          outcome: "failed",
          durationMs: 1,
          faultInjected: "network-drop"
        }
      ]
    }));
    const eventBytes = formatStressEventLine(parseStressEvent({
      sessionId: "stress_hosted_secret_redaction",
      sequence: 1,
      at: "2026-04-29T00:00:01Z",
      type: "hosted-adapter-failed",
      payload: { adapterEvents: JSON.parse(adapterPayload) as never }
    }));

    assert.doesNotMatch(reportBytes, new RegExp(escapeRegExp(LEAK_SENTINEL)));
    assert.doesNotMatch(eventBytes, new RegExp(escapeRegExp(LEAK_SENTINEL)));
    assert.match(eventBytes, new RegExp(escapeRegExp(REDACTED)));
  });
});

function toAdapterTask() {
  return {
    planTaskId: "task-hosted-redaction",
    title: "Update button color",
    targetFiles: ["src/Button.tsx"],
    adapterRef: "hosted-openai-compatible"
  };
}

function createAdapterContext(): AdapterContext {
  const bytes = new TextEncoder().encode("export const color = \"blue\";\n");
  return {
    signal: new AbortController().signal,
    confirmedIntent: {
      goalArchetype: "feature-add",
      acceptanceCriteria: ["Button color changes to green."],
      capabilityEnvelope: {}
    },
    resolvedEnvelope: {},
    budget: {
      adapterRetriesPerTask: 1,
      taskWallClockMs: 180_000
    },
    network: { allow: "allowlist", allowedHosts: ["hosted.example"] },
    repoReader: {
      async readFile(path: string) {
        assert.equal(path, "src/Button.tsx");
        return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
      },
      async glob() {
        return [];
      }
    },
    journal: {
      async appendToken() {
        return undefined;
      }
    }
  } as unknown as AdapterContext;
}

async function collectEvents(events: AsyncIterable<AdapterEvent>): Promise<AdapterEvent[]> {
  const collected: AdapterEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
