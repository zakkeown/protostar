import {
  isTransientFailure,
  nextBackoffMs,
  type AdapterContext,
  type AdapterEvent,
  type AdapterEvidence,
  type AdapterFailureReason,
  type ExecutionAdapter,
  type ExecutionAdapterTaskInput
} from "@protostar/execution";
import type { RepoChangeSet } from "@protostar/repo";
import { createTwoFilesPatch } from "diff";

import { parseDiffBlock } from "./diff-parser.js";
import { callLmstudioChatStream } from "./lmstudio-client.js";
import {
  buildCoderMessages,
  buildReformatNudgeMessages,
  buildRepairNoopNudgeMessages,
  type CoderMessages
} from "./prompt-builder.js";

export interface LmstudioAdapterConfig {
  readonly baseUrl: string;
  readonly model: string;
  readonly apiKey: string;
  readonly temperature?: number;
  readonly topP?: number;
  readonly auxReadBudget?: number;
  readonly rng?: () => number;
  readonly fetchImpl?: typeof fetch;
  readonly sleepMs?: (ms: number, signal: AbortSignal) => Promise<void>;
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

type TerminalFailureReason = Exclude<AdapterFailureReason, "lmstudio-model-not-loaded">;

interface ReplacementChangeSet {
  readonly entries: readonly ReplacementChangeSetEntry[];
}

interface ReplacementChangeSetEntry {
  readonly path: string;
  readonly content: string;
}

export function createLmstudioCoderAdapter(config: LmstudioAdapterConfig): ExecutionAdapter {
  return {
    id: "lmstudio-coder",
    async *execute(task, ctx) {
      yield* executeCoderTask(task, ctx, config);
    }
  };
}

async function* executeCoderTask(
  task: ExecutionAdapterTaskInput,
  ctx: AdapterContext,
  config: LmstudioAdapterConfig
): AsyncIterable<AdapterEvent> {
  const startedAt = Date.now();
  const retries: AdapterEvidence["retries"][number][] = [];
  const preImages = new Map<string, PreImage>();
  const auxReadBudget = config.auxReadBudget ?? 3;

  await readTargetPreImages(task, ctx, preImages);

  if (auxReadBudget < 0) {
    yield finalFailure("aux-read-budget-exceeded", config, startedAt, 0, retries);
    return;
  }

  const fileContents = new Map(
    [...preImages.entries()].map(([path, image]) => [path, new TextDecoder().decode(image.bytes)])
  );
  const promptTask = {
    ...task,
    targetFiles: [...fileContents.keys()]
  };
  let messages = buildCoderMessages({
    task: promptTask,
    intentTitle: ctx.confirmedIntent.title,
    problem: ctx.confirmedIntent.problem,
    ...(ctx.confirmedIntent.context !== undefined ? { context: ctx.confirmedIntent.context } : {}),
    constraints: ctx.confirmedIntent.constraints,
    fileContents,
    acceptanceCriteria: ctx.confirmedIntent.acceptanceCriteria.map((criterion) =>
      typeof criterion === "string" ? criterion : (criterion.statement ?? "")
    ),
    archetype: ctx.confirmedIntent.goalArchetype ?? "unknown",
    repairContext: ctx.repairContext
  });

  const maxAttempts = Math.max(1, Math.floor(ctx.budget.adapterRetriesPerTask));
  const sleepImpl = config.sleepMs ?? sleep;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attempts = attempt;
    const attemptStartedAt = Date.now();
    const abort = chainAbortSignal(ctx.signal);

    try {
      let assistantContent = "";
      let streamErrored = false;
      for await (const ev of callLmstudioChatStream({
        baseUrl: config.baseUrl,
        model: config.model,
        apiKey: config.apiKey,
        messages: messages.messages,
        stream: true,
        signal: abort.signal,
        timeoutMs: ctx.budget.taskWallClockMs,
        ...(config.fetchImpl !== undefined ? { fetchImpl: config.fetchImpl } : {}),
        ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
        ...(config.topP !== undefined ? { topP: config.topP } : {})
      })) {
        if (ev.kind === "done") break;
        if (ev.kind === "error") {
          streamErrored = true;
          if (abort.signal.aborted || ctx.signal.aborted) {
            yield finalFailure(abortReason(ctx.signal), config, startedAt, attempts, retries);
            return;
          }
          const status = httpStatusFromErrorClass(ev.errorClass);
          const transient =
            status === undefined
              ? isTransientFailure({ kind: "error", error: classifierErrorFromEvent(ev.errorClass, ev.message) })
              : isTransientFailure({ kind: "http", status });
          if (transient && attempt < maxAttempts) {
            retries.push(retryEvidence(attempt, "transient", attemptStartedAt, ev.errorClass));
            await sleepImpl(nextBackoffMs(attempt, config.rng ?? Math.random), ctx.signal);
            break;
          }
          yield finalFailure(
            transient ? "retries-exhausted" : status === undefined ? "lmstudio-unreachable" : "lmstudio-http-error",
            config,
            startedAt,
            attempts,
            retries
          );
          return;
        }
        if (ev.text.length === 0) continue;
        assistantContent += ev.text;
        yield { kind: "token", text: ev.text };
        await ctx.journal.appendToken(task.planTaskId, attempt, ev.text);
      }
      if (streamErrored) {
        continue;
      }

      const parsedReplacement = parseReplacementChangeSetBlock(assistantContent);
      if (parsedReplacement.ok) {
        const changeSet = buildReplacementChangeSet(parsedReplacement.changeSet, preImages);
        if (!changeSet.ok) {
          yield finalFailure(changeSet.reason, config, startedAt, attempts, retries);
          return;
        }
        if (
          ctx.repairContext !== undefined &&
          changeSet.changeSet.entries.length === 0
        ) {
          if (attempt < maxAttempts) {
            messages = buildRepairNoopNudgeMessages(messages, assistantContent);
            retries.push(retryEvidence(attempt, "repair", attemptStartedAt));
            continue;
          }
          yield finalFailure("empty-repair-change-set", config, startedAt, attempts, retries);
          return;
        }
        yield {
          kind: "final",
          result: {
            outcome: "change-set",
            changeSet: changeSet.changeSet as unknown as RepoChangeSet,
            evidence: evidence(config, startedAt, attempts, retries)
          }
        };
        return;
      }

      if (parsedReplacement.reason === "parse-multiple-blocks") {
        yield finalFailure("parse-multiple-blocks", config, startedAt, attempts, retries);
        return;
      }

      const parsed = parseDiffBlock(assistantContent);
      if (parsed.ok) {
        const changeSet = buildChangeSet(parsed.diff, preImages, auxReadBudget);
        if (!changeSet.ok) {
          yield finalFailure(changeSet.reason, config, startedAt, attempts, retries);
          return;
        }
        yield {
          kind: "final",
          result: {
            outcome: "change-set",
            changeSet: changeSet.changeSet as unknown as RepoChangeSet,
            evidence: evidence(config, startedAt, attempts, retries)
          }
        };
        return;
      }

      if (parsed.reason === "parse-multiple-blocks") {
        yield finalFailure("parse-multiple-blocks", config, startedAt, attempts, retries);
        return;
      }

      if (attempt === 1 && attempt < maxAttempts) {
        messages = buildReformatNudgeMessages(messages, assistantContent);
        retries.push(retryEvidence(attempt, "parse-reformat", attemptStartedAt));
        continue;
      }

      yield finalFailure("parse-reformat-failed", config, startedAt, attempts, retries);
      return;
    } catch (error: unknown) {
      if (ctx.signal.aborted || abort.signal.aborted) {
        yield finalFailure(abortReason(ctx.signal), config, startedAt, attempts, retries);
        return;
      }

      if (isTransientFailure({ kind: "error", error }) && attempt < maxAttempts) {
        retries.push(retryEvidence(attempt, "transient", attemptStartedAt, errorClass(error)));
        await sleepImpl(nextBackoffMs(attempt, config.rng ?? Math.random), ctx.signal);
        continue;
      }

      yield finalFailure(
        attempt >= maxAttempts ? "retries-exhausted" : "lmstudio-unreachable",
        config,
        startedAt,
        attempts,
        retries
      );
      return;
    } finally {
      abort.cleanup();
    }
  }

  yield finalFailure("retries-exhausted", config, startedAt, attempts, retries);
}

async function readTargetPreImages(
  task: ExecutionAdapterTaskInput,
  ctx: AdapterContext,
  preImages: Map<string, PreImage>
): Promise<void> {
  for (const target of task.targetFiles) {
    if (isGlobTarget(target)) {
      const matches = await sourceFileMatches(ctx, target);
      if (matches.length === 0) {
        // Hash 1 of 2 — see Phase 4 Q-06. Do not collapse with apply-time hash in repo.applyChangeSet (Hash 2 of 2 — Phase 3 Q-10).
        const read = await ctx.repoReader.readFile(target);
        preImages.set(target, read);
        continue;
      }
      await readPreImagesForPaths(matches, ctx, preImages);
      continue;
    }

    try {
      // Hash 1 of 2 — see Phase 4 Q-06. Do not collapse with apply-time hash in repo.applyChangeSet (Hash 2 of 2 — Phase 3 Q-10).
      const read = await ctx.repoReader.readFile(target);
      preImages.set(target, read);
    } catch (error) {
      const matches = await sourceFileMatches(ctx, `${target.replace(/\/+$/u, "")}/**/*`);
      if (matches.length === 0) throw error;
      await readPreImagesForPaths(matches, ctx, preImages);
    }
  }
}

async function readPreImagesForPaths(
  paths: readonly string[],
  ctx: AdapterContext,
  preImages: Map<string, PreImage>
): Promise<void> {
  for (const path of paths) {
    if (preImages.has(path)) continue;
    // Hash 1 of 2 — see Phase 4 Q-06. Do not collapse with apply-time hash in repo.applyChangeSet (Hash 2 of 2 — Phase 3 Q-10).
    const read = await ctx.repoReader.readFile(path);
    preImages.set(path, read);
  }
}

async function sourceFileMatches(ctx: AdapterContext, pattern: string): Promise<readonly string[]> {
  const matches = await ctx.repoReader.glob(pattern);
  const sourceMatches = matches.filter(isPromptableSourceFile);
  return sourceMatches.length > 0 ? sourceMatches : matches;
}

function isGlobTarget(path: string): boolean {
  return /[*?[\]{}]/u.test(path);
}

function isPromptableSourceFile(path: string): boolean {
  return /\.(?:cjs|css|cts|html|js|json|jsx|mjs|mts|scss|ts|tsx)$/u.test(path);
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
      diff: createTwoFilesPatch(
        `a/${replacementEntry.path}`,
        `b/${replacementEntry.path}`,
        oldContent,
        replacementEntry.content,
        "",
        "",
        { context: 3 }
      ).trimEnd(),
      preImageSha256: preImage.sha256
    });
  }

  return { ok: true, changeSet: { entries } };
}

function buildChangeSet(
  diff: string,
  preImages: ReadonlyMap<string, PreImage>,
  auxReadBudget: number
):
  | { readonly ok: true; readonly changeSet: PlanChangeSet }
  | { readonly ok: false; readonly reason: "parse-no-block" | "aux-read-budget-exceeded" } {
  const headers = [...diff.matchAll(/^--- a\/(.+)$/gm)];
  if (headers.length === 0) {
    return { ok: false, reason: "parse-no-block" };
  }

  const entries: PlanChangeSetEntry[] = [];
  let outOfTarget = 0;
  for (const [index, match] of headers.entries()) {
    const path = match[1];
    const start = match.index;
    if (path === undefined || start === undefined) {
      return { ok: false, reason: "parse-no-block" };
    }

    const preImage = preImages.get(path);
    if (preImage === undefined) {
      outOfTarget += 1;
      if (outOfTarget > auxReadBudget) {
        return { ok: false, reason: "aux-read-budget-exceeded" };
      }
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

function finalFailure(
  reason: TerminalFailureReason,
  config: LmstudioAdapterConfig,
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
  config: LmstudioAdapterConfig,
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
  retryReason: "transient" | "parse-reformat" | "repair",
  startedAt: number,
  errorClass?: string
): AdapterEvidence["retries"][number] {
  const evidence = {
    attempt,
    retryReason,
    durationMs: Date.now() - startedAt
  };
  return errorClass === undefined ? evidence : { ...evidence, errorClass };
}

function chainAbortSignal(parent: AbortSignal): {
  readonly signal: AbortSignal;
  cleanup(): void;
} {
  const controller = new AbortController();
  if (parent.aborted) {
    controller.abort(parent.reason);
    return { signal: controller.signal, cleanup: () => undefined };
  }

  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup: () => parent.removeEventListener("abort", onAbort)
  };
}

function abortReason(signal: AbortSignal): "timeout" | "aborted" {
  return signal.reason === "timeout" ? "timeout" : "aborted";
}

function errorClass(error: unknown): string {
  if (error instanceof Error && error.name.length > 0) {
    return error.name;
  }
  return typeof error;
}

function httpStatusFromErrorClass(errorClass: string): number | undefined {
  if (!errorClass.startsWith("HTTP_")) {
    return undefined;
  }
  const status = Number(errorClass.slice("HTTP_".length));
  return Number.isInteger(status) ? status : undefined;
}

function classifierErrorFromEvent(errorClass: string, message: string): Error {
  const error = new Error(message);
  error.name = errorClass;
  const code = ["ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT", "EAI_AGAIN", "EPIPE"].find((candidate) =>
    message.includes(candidate)
  );
  if (code !== undefined) {
    Object.assign(error, { code });
  }
  return error;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal.aborted) return Promise.reject(new DOMException("aborted", "AbortError"));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
