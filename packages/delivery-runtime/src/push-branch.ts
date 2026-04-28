import git, { type AuthCallback } from "isomorphic-git";
import defaultHttp from "isomorphic-git/http/node";

import type { BranchName, DeliveryRefusal } from "@protostar/delivery";

/**
 * Phase 7 push boundary:
 * - Q-03 locks the GitHub PAT auth form to `{ username: "x-access-token", password: PAT }`.
 * - Pitfall 5 requires force-with-lease emulation before any force push.
 * - Pitfall 11 means cancellation is best-effort: pre-push plus auth-loop checks.
 *
 * This intentionally diverges from Phase 3 clone auth
 * `{ username: token, password: "x-oauth-basic" }`; RESEARCH Pattern 2 notes both
 * work for GitHub PATs, but CONTEXT.md Q-03 is the locked delivery decision.
 */

export type PushResult =
  | { readonly ok: true; readonly newSha: string }
  | { readonly ok: false; readonly refusal: DeliveryRefusal };

export interface PushBranchInput {
  readonly workspaceDir: string;
  readonly branchName: BranchName;
  readonly remoteUrl: string;
  readonly token: string;
  readonly expectedRemoteSha: string | null;
  readonly signal: AbortSignal;
  readonly fs: unknown;
  readonly http?: unknown;
}

type FetchOptions = Parameters<typeof git.fetch>[0];
type FetchResult = Awaited<ReturnType<typeof git.fetch>>;
type PushOptions = Parameters<typeof git.push>[0];
type IsomorphicPushResult = Awaited<ReturnType<typeof git.push>>;
type ResolveRefOptions = Parameters<typeof git.resolveRef>[0];

interface PushBranchDependencies {
  readonly fetch: (options: FetchOptions) => Promise<FetchResult>;
  readonly push: (options: PushOptions) => Promise<IsomorphicPushResult>;
  readonly resolveRef: (options: ResolveRefOptions) => Promise<string>;
}

let dependencies: PushBranchDependencies = {
  fetch: git.fetch,
  push: git.push,
  resolveRef: git.resolveRef
};

export function buildPushOnAuth(token: string, signal: AbortSignal): AuthCallback {
  let count = 0;

  return () => {
    count += 1;
    if (signal.aborted) {
      return { cancel: true };
    }
    if (count > 2) {
      return { cancel: true };
    }
    if (token.length === 0) {
      return { cancel: true };
    }

    return { username: "x-access-token", password: token };
  };
}

export async function pushBranch(input: PushBranchInput): Promise<PushResult> {
  if (input.signal.aborted) {
    return cancelled(input.signal);
  }

  const fs = input.fs as PushOptions["fs"];
  const http = (input.http ?? defaultHttp) as PushOptions["http"];
  const remoteShaResult = await readRemoteSha({ input, fs, http });
  if (!remoteShaResult.ok) {
    return remoteShaResult;
  }

  const remoteSha = remoteShaResult.remoteSha;
  if (remoteSha !== null && input.expectedRemoteSha === null) {
    return remoteDiverged(input.branchName, null, remoteSha);
  }
  if (remoteSha !== null && input.expectedRemoteSha !== null && remoteSha !== input.expectedRemoteSha) {
    return remoteDiverged(input.branchName, input.expectedRemoteSha, remoteSha);
  }

  const force = remoteSha !== null && remoteSha === input.expectedRemoteSha;
  try {
    const result = await dependencies.push({
      fs,
      http,
      dir: input.workspaceDir,
      url: input.remoteUrl,
      ref: input.branchName,
      force,
      onAuth: buildPushOnAuth(input.token, input.signal)
    });
    const ref = `refs/heads/${input.branchName}`;
    const refStatus = result.refs[ref];
    if (result.ok !== true || refStatus?.ok !== true) {
      return remoteDiverged(input.branchName, input.expectedRemoteSha, remoteSha ?? result.error ?? refStatus?.error ?? "");
    }

    const newSha = await dependencies.resolveRef({ fs, dir: input.workspaceDir, ref: input.branchName });
    return { ok: true, newSha };
  } catch {
    return cancelled(input.signal);
  }
}

export function __setPushBranchDependenciesForTests(nextDependencies: PushBranchDependencies): void {
  dependencies = nextDependencies;
}

export function __resetPushBranchDependenciesForTests(): void {
  dependencies = {
    fetch: git.fetch,
    push: git.push,
    resolveRef: git.resolveRef
  };
}

async function readRemoteSha(input: {
  readonly input: PushBranchInput;
  readonly fs: PushOptions["fs"];
  readonly http: PushOptions["http"];
}): Promise<{ readonly ok: true; readonly remoteSha: string | null } | { readonly ok: false; readonly refusal: DeliveryRefusal }> {
  try {
    const fetchResult = await dependencies.fetch({
      fs: input.fs,
      http: input.http,
      dir: input.input.workspaceDir,
      url: input.input.remoteUrl,
      ref: input.input.branchName,
      singleBranch: true,
      depth: 1,
      onAuth: buildPushOnAuth(input.input.token, input.input.signal)
    });

    const remoteSha = await dependencies
      .resolveRef({
        fs: input.fs,
        dir: input.input.workspaceDir,
        ref: `refs/remotes/origin/${input.input.branchName}`
      })
      .catch(() => fetchResult.fetchHead);

    return { ok: true, remoteSha };
  } catch (error: unknown) {
    if (isRefNotFound(error)) {
      return { ok: true, remoteSha: null };
    }
    return cancelled(input.input.signal);
  }
}

function remoteDiverged(
  branchName: BranchName,
  expectedSha: string | null,
  remoteSha: string
): { readonly ok: false; readonly refusal: DeliveryRefusal } {
  return {
    ok: false,
    refusal: { kind: "remote-diverged", evidence: { branch: branchName, expectedSha, remoteSha } }
  };
}

function cancelled(signal: AbortSignal): { readonly ok: false; readonly refusal: DeliveryRefusal } {
  return { ok: false, refusal: { kind: "cancelled", evidence: { reason: signalReason(signal), phase: "push" } } };
}

function signalReason(signal: AbortSignal): "sigint" | "timeout" | "sentinel" | "parent-abort" {
  if (signal.reason === "sigint" || signal.reason === "timeout" || signal.reason === "sentinel") {
    return signal.reason;
  }
  return "parent-abort";
}

function isRefNotFound(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  return error.code === "NotFoundError" || (typeof error.message === "string" && /not found/i.test(error.message));
}

function isRecord(value: unknown): value is { readonly code?: unknown; readonly message?: unknown } {
  return typeof value === "object" && value !== null;
}
