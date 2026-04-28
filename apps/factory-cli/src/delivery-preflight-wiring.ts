import { basename, resolve } from "node:path";
import type * as FsPromises from "node:fs/promises";

import {
  buildOctokit,
  preflightDeliveryFast,
  preflightDeliveryFull,
  type DeliveryTarget,
  type FastPreflightResult,
  type FullPreflightResult,
  type ProtostarOctokit
} from "@protostar/delivery-runtime";

export interface FastPreflightOutcome {
  readonly proceed: boolean;
  readonly result: FastPreflightResult;
  readonly refusalPath?: string;
}

export interface FullPreflightOutcome {
  readonly proceed: boolean;
  readonly result: FullPreflightResult;
  readonly refusalPath?: string;
  readonly octokit?: ProtostarOctokit;
  readonly tokenLogin?: string;
  readonly baseSha?: string;
}

/**
 * Runs the env-only delivery preflight and, on refusal, writes
 * `{ phase: "fast", result, runId, at }` to
 * `{runDir}/delivery/preflight-refusal.json`.
 */
export async function runFastDeliveryPreflight(input: {
  readonly env: NodeJS.ProcessEnv;
  readonly runDir: string;
  readonly fs: typeof FsPromises;
}): Promise<FastPreflightOutcome> {
  const result = preflightDeliveryFast(input.env);
  if (result.outcome === "ok") {
    return { proceed: true, result };
  }

  const refusalPath = await writePreflightRefusal(input, "fast", result);
  return { proceed: false, result, refusalPath };
}

export async function runFullDeliveryPreflight(input: {
  readonly token: string;
  readonly target: DeliveryTarget;
  readonly runDir: string;
  readonly fs: typeof FsPromises;
  readonly signal: AbortSignal;
}): Promise<FullPreflightOutcome> {
  const octokit = buildOctokit(input.token, { userAgent: "protostar-factory-cli/0.0.0" });
  const result = await preflightDeliveryFull(
    { token: input.token, target: input.target, signal: input.signal },
    octokit
  );
  if (result.outcome === "ok") {
    return {
      proceed: true,
      result,
      octokit,
      tokenLogin: result.tokenLogin,
      baseSha: result.baseSha
    };
  }

  const refusalPath = await writePreflightRefusal(input, "full", result);
  return { proceed: false, result, refusalPath };
}

async function writePreflightRefusal(
  input: {
    readonly runDir: string;
    readonly fs: typeof FsPromises;
  },
  phase: "fast" | "full",
  result: FastPreflightResult | FullPreflightResult
): Promise<string> {
  const deliveryDir = resolve(input.runDir, "delivery");
  const refusalPath = resolve(deliveryDir, "preflight-refusal.json");
  await input.fs.mkdir(deliveryDir, { recursive: true });
  await writeJsonAtomic(input.fs, refusalPath, {
    phase,
    result,
    runId: basename(input.runDir),
    at: new Date().toISOString()
  });
  return refusalPath;
}

async function writeJsonAtomic(
  fs: typeof FsPromises,
  path: string,
  data: unknown
): Promise<void> {
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, path);
}
