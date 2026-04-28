import { resolve } from "node:path";
import type * as FsPromises from "node:fs/promises";

import type {
  CiCancelledReason,
  CiEvent,
  CiSnapshot,
  DeliveryResult,
  DeliveryResultCiVerdict,
  DeliveryResultCiSnapshot
} from "@protostar/delivery-runtime";

/**
 * Drives Phase 7 Q-16/Q-17 CI capture: every poll yield is durably appended to
 * ci-events.jsonl and folded into delivery-result.json via tmp+rename.
 */
export async function drivePollCiStatus(input: {
  readonly initialResult: DeliveryResult;
  readonly poll: AsyncGenerator<CiSnapshot, void, unknown>;
  readonly runDir: string;
  readonly fs: typeof FsPromises;
  readonly signal: AbortSignal;
}): Promise<DeliveryResult> {
  let result = input.initialResult;
  const deliveryDir = resolve(input.runDir, "delivery");
  const eventsPath = resolve(deliveryDir, "ci-events.jsonl");
  const resultPath = resolve(deliveryDir, "delivery-result.json");
  await input.fs.mkdir(deliveryDir, { recursive: true });

  if (input.signal.aborted) {
    return await persistAbort(input, result, eventsPath, resultPath);
  }

  try {
    for await (const snap of input.poll) {
      await appendJsonl(input.fs, eventsPath, { kind: "ci-snapshot", at: snap.at, checks: snap.checks });
      result = mergeSnapshot(result, snap);
      await writeJsonAtomic(input.fs, resultPath, result);
      if (snap.terminal) {
        await appendJsonl(input.fs, eventsPath, {
          kind: "ci-terminal",
          at: new Date().toISOString(),
          verdict: terminalVerdict(snap.verdict)
        });
        return result;
      }
    }

    return result;
  } catch (error: unknown) {
    if (!isAbortLike(error) && !input.signal.aborted) {
      throw error;
    }

    return await persistAbort(input, result, eventsPath, resultPath);
  }
}

function mergeSnapshot(result: DeliveryResult, snap: CiSnapshot): DeliveryResult {
  const snapshot: DeliveryResultCiSnapshot = { at: snap.at, checks: snap.checks };
  const snapshots = rollSnapshots([...result.ciSnapshots, snapshot]);
  return {
    ...result,
    ciVerdict: snap.verdict as DeliveryResultCiVerdict,
    ciVerdictUpdatedAt: snap.at,
    ciSnapshots: snapshots
  };
}

function rollSnapshots(snapshots: readonly DeliveryResultCiSnapshot[]): readonly DeliveryResultCiSnapshot[] {
  if (snapshots.length <= 11) {
    return snapshots;
  }

  const first = snapshots[0];
  if (first === undefined) {
    return snapshots;
  }

  return [first, ...snapshots.slice(-10)];
}

async function persistAbort(
  input: {
    readonly fs: typeof FsPromises;
    readonly signal: AbortSignal;
  },
  result: DeliveryResult,
  eventsPath: string,
  resultPath: string
): Promise<DeliveryResult> {
  const at = new Date().toISOString();
  if (input.signal.reason === "timeout") {
    const timeoutResult = {
      ...result,
      ciVerdict: "timeout-pending" as const,
      ciVerdictUpdatedAt: at,
      exhaustedAt: at
    };
    await appendJsonl(input.fs, eventsPath, { kind: "ci-timeout", at });
    await writeJsonAtomic(input.fs, resultPath, timeoutResult);
    return timeoutResult;
  }

  const cancelResult = {
    ...result,
    ciVerdict: "cancelled" as const,
    ciVerdictUpdatedAt: at
  };
  await appendJsonl(input.fs, eventsPath, { kind: "ci-cancelled", at, reason: cancelReason(input.signal.reason) });
  await writeJsonAtomic(input.fs, resultPath, cancelResult);
  return cancelResult;
}

async function appendJsonl(fs: typeof FsPromises, path: string, event: CiEvent): Promise<void> {
  const handle = await fs.open(path, "a");
  try {
    await handle.appendFile(`${JSON.stringify(event)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function writeJsonAtomic(fs: typeof FsPromises, path: string, data: unknown): Promise<void> {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, path);
}

function terminalVerdict(verdict: CiSnapshot["verdict"]): "pass" | "fail" | "no-checks-configured" {
  if (verdict === "pass" || verdict === "fail" || verdict === "no-checks-configured") {
    return verdict;
  }

  return "fail";
}

function cancelReason(reason: unknown): CiCancelledReason {
  return reason === "sigint" || reason === "timeout" || reason === "sentinel" ? reason : "parent-abort";
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.message === "AbortError");
}
