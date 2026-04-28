import { computeCiVerdict, type CiCheckRun, type CiVerdict } from "./compute-ci-verdict.js";
import type { ProtostarOctokit } from "./octokit-client.js";
import type { DeliveryTarget } from "./preflight-full.js";

const DEFAULT_POLL_INTERVAL_MS = 10_000;

export interface CiSnapshot {
  readonly at: string;
  readonly checks: readonly CiCheckRun[];
  readonly verdict: CiVerdict;
  readonly terminal: boolean;
}

export interface PollCiStatusInput {
  readonly target: DeliveryTarget;
  readonly headSha: string;
  readonly requiredChecks: readonly string[];
  readonly octokit: ProtostarOctokit;
  readonly signal: AbortSignal;
  readonly intervalMs?: number;
}

/**
 * Phase 7 Q-14/Q-16/Q-19: poll GitHub checks every 10s by default, yielding
 * snapshots until a terminal verdict or hierarchical abort. The `at` timestamp
 * is the single clock read in this network adapter.
 */
export async function* pollCiStatus(input: PollCiStatusInput): AsyncGenerator<CiSnapshot, void, unknown> {
  const intervalMs = input.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  while (true) {
    throwIfAborted(input.signal);
    const response = await input.octokit.rest.checks.listForRef({
      owner: input.target.owner,
      repo: input.target.repo,
      ref: input.headSha,
      request: { signal: input.signal }
    });
    const checks = response.data.check_runs.map((check) => ({
      name: check.name,
      status: check.status,
      conclusion: check.conclusion
    }));
    const verdict = computeCiVerdict(checks, input.requiredChecks);
    const snapshot: CiSnapshot = {
      at: new Date().toISOString(),
      checks,
      verdict,
      terminal: verdict === "pass" || verdict === "fail" || verdict === "no-checks-configured"
    };

    yield snapshot;

    if (snapshot.terminal) {
      return;
    }

    await sleep(intervalMs, input.signal);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(abortError());
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

function abortError(): Error {
  const error = new Error("AbortError");
  error.name = "AbortError";
  return error;
}
