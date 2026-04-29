import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { ExitCode } from "../exit-codes.js";
import { main } from "../main.js";
import { buildRunOptions } from "./run.js";

const originalStdoutWrite = process.stdout.write.bind(process.stdout);
const originalStderrWrite = process.stderr.write.bind(process.stderr);

afterEach(() => {
  process.exitCode = undefined;
  process.stdout.write = originalStdoutWrite as typeof process.stdout.write;
  process.stderr.write = originalStderrWrite as typeof process.stderr.write;
});

describe("run command headless options", () => {
  it("maps --headless-mode github-hosted and --non-interactive into run options", () => {
    const parsed = buildRunOptions({
      draft: "draft.json",
      out: "out",
      headlessMode: "github-hosted",
      nonInteractive: true
    });

    if (!parsed.ok) {
      assert.fail(parsed.error);
    }
    assert.equal(parsed.options.headlessMode, "github-hosted");
    assert.equal(parsed.options.nonInteractive, true);
  });

  it("maps --llm-backend hosted-openai-compatible into run options", () => {
    const parsed = buildRunOptions({
      draft: "draft.json",
      out: "out",
      llmBackend: "hosted-openai-compatible"
    });

    if (!parsed.ok) {
      assert.fail(parsed.error);
    }
    assert.equal(parsed.options.llmBackend, "hosted-openai-compatible");
  });

  it("rejects invalid --headless-mode values through the usage-code path", async () => {
    const result = await captureMain(["run", "--draft", "draft.json", "--out", "out", "--headless-mode", "ci"]);

    assert.equal(result.exitCode, ExitCode.UsageOrArgError);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /--headless-mode/);
    assert.doesNotMatch(result.stderr, /Usage:/);
    assert.doesNotMatch(result.stderr, /Options:/);
  });

  it("rejects provider aliases for --llm-backend through the usage-code path", async () => {
    for (const alias of ["openai", "anthropic"] as const) {
      const result = await captureMain(["run", "--draft", "draft.json", "--out", "out", "--llm-backend", alias]);

      assert.equal(result.exitCode, ExitCode.UsageOrArgError);
      assert.equal(result.stdout, "");
      assert.match(result.stderr, /--llm-backend/);
      assert.doesNotMatch(result.stderr, /Usage:/);
      assert.doesNotMatch(result.stderr, /Options:/);
    }
  });

  it("preserves stdout=data discipline when headless parsing succeeds but required run args are missing", async () => {
    const result = await captureMain(["run", "--headless-mode", "github-hosted", "--non-interactive"]);

    assert.notEqual(result.exitCode, ExitCode.Success);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Missing required --intent-draft/);
    assert.doesNotMatch(result.stderr, /Usage:/);
    assert.doesNotMatch(result.stderr, /Options:/);
  });
});

async function captureMain(args: readonly string[]): Promise<{
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdoutChunks.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderrChunks.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  const exitCode = await main(args);

  return {
    exitCode,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join("")
  };
}
