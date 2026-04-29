import {
  buildCoderMessages,
  buildReformatNudgeMessages,
  parseDiffBlock,
  type CoderMessages
} from "@protostar/lmstudio-adapter";
import type {
  AdapterContext,
  AdapterEvent,
  AdapterEvidence,
  AdapterFailureReason,
  ExecutionAdapter,
  ExecutionAdapterTaskInput
} from "@protostar/execution";

import {
  callHostedOpenAiCompatibleChatStream,
  DEFAULT_HOSTED_OPENAI_API_KEY_ENV,
  redactionToken
} from "./hosted-openai-client.js";

export interface HostedOpenAiCompatibleCoderAdapterConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKeyEnv?: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly fetchImpl?: typeof fetch;
}

interface ResolvedHostedConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly apiKeyEnv: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

interface PreImage {
  readonly bytes: Uint8Array;
  readonly sha256: string;
}

interface PlanChangeSet {
  readonly entries: readonly PlanChangeSetEntry[];
}

interface PlanChangeSetEntry {
  readonly path: string;
  readonly op: "modify";
  readonly diff: string;
  readonly preImageSha256: string;
}

interface ReplacementChangeSet {
  readonly entries: readonly ReplacementChangeSetEntry[];
}

interface ReplacementChangeSetEntry {
  readonly path: string;
  readonly content: string;
}

type TerminalFailureReason = Exclude<AdapterFailureReason, "lmstudio-model-not-loaded">;

export class HostedOpenAiCompatibleConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HostedOpenAiCompatibleConfigError";
  }
}

export function createHostedOpenAiCompatibleCoderAdapter(
  config: HostedOpenAiCompatibleCoderAdapterConfig
): ExecutionAdapter {
  const resolved = resolveHostedConfig(config);
  return {
    id: "hosted-openai-compatible-coder",
    async *execute(task, ctx) {
      yield* executeCoderTask(task, ctx, resolved);
    }
  };
}

function resolveHostedConfig(config: HostedOpenAiCompatibleCoderAdapterConfig): ResolvedHostedConfig {
  const apiKeyEnv = config.apiKeyEnv ?? DEFAULT_HOSTED_OPENAI_API_KEY_ENV;
  const apiKey = config.env?.[apiKeyEnv] ?? process.env[apiKeyEnv];
  if (apiKey === undefined || apiKey.length === 0) {
    throw new HostedOpenAiCompatibleConfigError(
      `Missing hosted OpenAI-compatible API key in ${apiKeyEnv} (${redactionToken(apiKeyEnv)})`
    );
  }

  return {
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey,
    apiKeyEnv,
    ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
    ...(config.topP !== undefined ? { topP: config.topP } : {}),
    ...(config.timeoutMs !== undefined ? { timeoutMs: config.timeoutMs } : {}),
    ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {})
  };
}

async function* executeCoderTask(
  task: ExecutionAdapterTaskInput,
  ctx: AdapterContext,
  config: ResolvedHostedConfig
): AsyncIterable<AdapterEvent> {
  const startedAt = Date.now();
  const retries: AdapterEvidence["retries"][number][] = [];
  const preImages = await readTargetPreImages(task, ctx);
  const fileContents = new Map(
    [...preImages.entries()].map(([path, image]) => [path, new TextDecoder().decode(image.bytes)])
  );
  const promptTask = {
    ...task,
    targetFiles: [...fileContents.keys()]
  };
  let messages = buildCoderMessages({
    task: promptTask,
    fileContents,
    acceptanceCriteria: ctx.confirmedIntent.acceptanceCriteria.map((criterion) =>
      typeof criterion === "string" ? criterion : (criterion.statement ?? "")
    ),
    archetype: ctx.confirmedIntent.goalArchetype ?? "unknown"
  });

  const maxAttempts = Math.max(1, Math.floor(ctx.budget.adapterRetriesPerTask));
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    let assistantContent = "";
    let streamErrored = false;

    for await (const ev of callHostedOpenAiCompatibleChatStream({
      baseUrl: config.baseUrl,
      model: config.model,
      apiKey: config.apiKey,
      apiKeyEnv: config.apiKeyEnv,
      messages: messages.messages,
      signal: ctx.signal,
      timeoutMs: config.timeoutMs ?? ctx.budget.taskWallClockMs,
      ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
      ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
      ...(config.topP !== undefined ? { topP: config.topP } : {})
    })) {
      if (ev.kind === "done") break;
      if (ev.kind === "error") {
        streamErrored = true;
        yield { kind: "progress", message: ev.message };
        yield finalFailure(mapHostedFailure(ev.errorClass), config, startedAt, attempts, retries);
        return;
      }
      if (ev.text.length === 0) continue;
      assistantContent += ev.text;
      yield { kind: "token", text: ev.text };
      await ctx.journal.appendToken(task.planTaskId, attempt, ev.text);
    }

    if (streamErrored) continue;

    const parsedReplacement = parseReplacementChangeSetBlock(assistantContent);
    if (parsedReplacement.ok) {
      const changeSet = buildReplacementChangeSet(parsedReplacement.changeSet, preImages);
      if (!changeSet.ok) {
        yield finalFailure(changeSet.reason, config, startedAt, attempts, retries);
        return;
      }
      yield finalChangeSet(changeSet.changeSet, config, startedAt, attempts, retries);
      return;
    }

    if (parsedReplacement.reason === "parse-multiple-blocks") {
      yield finalFailure("parse-multiple-blocks", config, startedAt, attempts, retries);
      return;
    }

    const parsed = parseDiffBlock(assistantContent);
    if (parsed.ok) {
      const changeSet = buildChangeSet(parsed.diff, preImages);
      if (!changeSet.ok) {
        yield finalFailure(changeSet.reason, config, startedAt, attempts, retries);
        return;
      }
      yield finalChangeSet(changeSet.changeSet, config, startedAt, attempts, retries);
      return;
    }

    if (parsed.reason === "parse-multiple-blocks") {
      yield finalFailure("parse-multiple-blocks", config, startedAt, attempts, retries);
      return;
    }

    if (attempt === 1 && attempt < maxAttempts) {
      messages = buildReformatNudgeMessages(messages as CoderMessages, assistantContent);
      retries.push(retryEvidence(attempt, "parse-reformat", startedAt));
      continue;
    }

    yield finalFailure("parse-reformat-failed", config, startedAt, attempts, retries);
    return;
  }

  yield finalFailure("retries-exhausted", config, startedAt, attempts, retries);
}

async function readTargetPreImages(
  task: ExecutionAdapterTaskInput,
  ctx: AdapterContext
): Promise<Map<string, PreImage>> {
  const preImages = new Map<string, PreImage>();
  for (const target of task.targetFiles) {
    if (preImages.has(target)) continue;
    // Hash 1 of 2 — see Phase 4 Q-06. Do not collapse with apply-time hash in repo.applyChangeSet.
    preImages.set(target, await ctx.repoReader.readFile(target));
  }
  return preImages;
}

function finalChangeSet(
  changeSet: PlanChangeSet,
  config: ResolvedHostedConfig,
  startedAt: number,
  attempts: number,
  retries: AdapterEvidence["retries"]
): AdapterEvent {
  return {
    kind: "final",
    result: {
      outcome: "change-set",
      changeSet: changeSet as never,
      evidence: evidence(config, startedAt, attempts, retries)
    }
  };
}

function finalFailure(
  reason: TerminalFailureReason,
  config: ResolvedHostedConfig,
  startedAt: number,
  attempts: number,
  retries: AdapterEvidence["retries"]
): AdapterEvent {
  return {
    kind: "final",
    result: {
      outcome: "adapter-failed",
      reason,
      evidence: evidence(config, startedAt, attempts, retries)
    }
  };
}

function evidence(
  config: ResolvedHostedConfig,
  startedAt: number,
  attempts: number,
  retries: AdapterEvidence["retries"]
): AdapterEvidence {
  return {
    model: config.model,
    attempts,
    durationMs: Date.now() - startedAt,
    auxReads: [],
    retries
  };
}

function retryEvidence(
  attempt: number,
  retryReason: "transient" | "parse-reformat",
  startedAt: number
): AdapterEvidence["retries"][number] {
  return {
    attempt,
    retryReason,
    durationMs: Date.now() - startedAt
  };
}

function mapHostedFailure(errorClass: string): TerminalFailureReason {
  if (errorClass === "TimeoutError") return "timeout";
  if (errorClass === "AbortError") return "aborted";
  if (errorClass.startsWith("HTTP_")) return "lmstudio-http-error";
  if (errorClass === "MalformedResponse") return "lmstudio-http-error";
  return "lmstudio-unreachable";
}

function parseReplacementChangeSetBlock(
  content: string
):
  | { readonly ok: true; readonly changeSet: ReplacementChangeSet }
  | { readonly ok: false; readonly reason: "parse-no-block" | "parse-multiple-blocks" } {
  const trimmed = content.trim();
  const jsonFenceOpenings = [...trimmed.matchAll(/```json\b/gm)];
  if (jsonFenceOpenings.length === 0) {
    return { ok: false, reason: "parse-no-block" };
  }
  if (jsonFenceOpenings.length > 1) {
    return { ok: false, reason: "parse-multiple-blocks" };
  }

  const jsonBody = unwrapJsonFence(trimmed) ?? unwrapUnclosedJsonFence(trimmed);
  if (jsonBody === undefined) {
    return { ok: false, reason: "parse-no-block" };
  }

  try {
    const value: unknown = JSON.parse(jsonBody);
    if (!isReplacementChangeSet(value)) {
      return { ok: false, reason: "parse-no-block" };
    }
    return { ok: true, changeSet: value };
  } catch {
    return { ok: false, reason: "parse-no-block" };
  }
}

function unwrapJsonFence(fencedBlock: string): string | undefined {
  const trimmed = fencedBlock.trim();
  if (!trimmed.startsWith("```json")) return undefined;
  if (!trimmed.endsWith("```")) return undefined;
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  return trimmed.slice(firstLineEnd + 1, -"```".length).replace(/\n$/u, "");
}

function unwrapUnclosedJsonFence(fencedBlock: string): string | undefined {
  const trimmed = fencedBlock.trim();
  if (!trimmed.startsWith("```json")) return undefined;
  const firstLineEnd = trimmed.indexOf("\n");
  if (firstLineEnd < 0) return undefined;
  return extractBalancedJsonObject(trimmed.slice(firstLineEnd + 1).trim());
}

function extractBalancedJsonObject(input: string): string | undefined {
  if (!input.startsWith("{")) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = inString;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return input.slice(0, index + 1);
      }
    }
  }

  return undefined;
}

function isReplacementChangeSet(value: unknown): value is ReplacementChangeSet {
  if (typeof value !== "object" || value === null) return false;
  const entries = (value as { readonly entries?: unknown }).entries;
  return (
    Array.isArray(entries) &&
    entries.length > 0 &&
    entries.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { readonly path?: unknown }).path === "string" &&
        typeof (entry as { readonly content?: unknown }).content === "string"
    )
  );
}

function buildReplacementChangeSet(
  replacement: ReplacementChangeSet,
  preImages: ReadonlyMap<string, PreImage>
):
  | { readonly ok: true; readonly changeSet: PlanChangeSet }
  | { readonly ok: false; readonly reason: "parse-no-block" } {
  const decoder = new TextDecoder();
  const entries: PlanChangeSetEntry[] = [];

  for (const replacementEntry of replacement.entries) {
    const preImage = preImages.get(replacementEntry.path);
    if (preImage === undefined) {
      return { ok: false, reason: "parse-no-block" };
    }

    const oldContent = decoder.decode(preImage.bytes);
    if (oldContent === replacementEntry.content) {
      continue;
    }

    entries.push({
      path: replacementEntry.path,
      op: "modify",
      diff: unifiedReplacementDiff(replacementEntry.path, oldContent, replacementEntry.content),
      preImageSha256: preImage.sha256
    });
  }

  return { ok: true, changeSet: { entries } };
}

function buildChangeSet(
  diff: string,
  preImages: ReadonlyMap<string, PreImage>
):
  | { readonly ok: true; readonly changeSet: PlanChangeSet }
  | { readonly ok: false; readonly reason: "parse-no-block" } {
  const headers = [...diff.matchAll(/^--- a\/(.+)$/gm)];
  if (headers.length === 0) {
    return { ok: false, reason: "parse-no-block" };
  }

  const entries: PlanChangeSetEntry[] = [];
  for (const [index, match] of headers.entries()) {
    const path = match[1];
    const start = match.index;
    if (path === undefined || start === undefined) {
      return { ok: false, reason: "parse-no-block" };
    }

    const preImage = preImages.get(path);
    if (preImage === undefined) {
      return { ok: false, reason: "parse-no-block" };
    }

    const nextStart = headers[index + 1]?.index ?? diff.length;
    entries.push({
      path,
      op: "modify",
      diff: diff.slice(start, nextStart).trimEnd(),
      preImageSha256: preImage.sha256
    });
  }

  return { ok: true, changeSet: { entries } };
}

function unifiedReplacementDiff(path: string, oldContent: string, newContent: string): string {
  const oldLines = splitPatchLines(oldContent);
  const newLines = splitPatchLines(newContent);
  return [
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -1,${Math.max(oldLines.length, 1)} +1,${Math.max(newLines.length, 1)} @@`,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`)
  ].join("\n");
}

function splitPatchLines(content: string): readonly string[] {
  if (content.length === 0) return [""];
  const normalized = content.endsWith("\n") ? content.slice(0, -1) : content;
  return normalized.length === 0 ? [""] : normalized.split("\n");
}
