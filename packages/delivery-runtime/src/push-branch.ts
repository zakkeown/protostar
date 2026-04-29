import git, { type AuthCallback } from "isomorphic-git";
import defaultHttp from "isomorphic-git/http/node";

import type { BranchName, DeliveryRefusal } from "@protostar/delivery";
import { sanitizeDeliveryErrorMessage } from "./map-octokit-error.js";

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
type BranchOptions = Parameters<typeof git.branch>[0];
type StatusMatrixOptions = Parameters<typeof git.statusMatrix>[0];
type AddOptions = Parameters<typeof git.add>[0];
type RemoveOptions = Parameters<typeof git.remove>[0];
type CommitOptions = Parameters<typeof git.commit>[0];

interface PushBranchDependencies {
  readonly add: (options: AddOptions) => Promise<void>;
  readonly branch: (options: BranchOptions) => Promise<void>;
  readonly commit: (options: CommitOptions) => Promise<string>;
  readonly fetch: (options: FetchOptions) => Promise<FetchResult>;
  readonly push: (options: PushOptions) => Promise<IsomorphicPushResult>;
  readonly remove: (options: RemoveOptions) => Promise<void>;
  readonly resolveRef: (options: ResolveRefOptions) => Promise<string>;
  readonly statusMatrix: (options: StatusMatrixOptions) => Promise<Awaited<ReturnType<typeof git.statusMatrix>>>;
}

let dependencies: PushBranchDependencies = {
  add: git.add,
  branch: git.branch,
  commit: git.commit,
  fetch: git.fetch,
  push: git.push,
  remove: git.remove,
  resolveRef: git.resolveRef,
  statusMatrix: git.statusMatrix
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
    await dependencies.branch({
      fs,
      dir: input.workspaceDir,
      ref: input.branchName,
      checkout: true
    });
    const commitResult = await commitTrackedWorkspaceChanges({
      fs,
      dir: input.workspaceDir,
      branchName: input.branchName
    });
    if (!commitResult.ok) {
      return commitResult;
    }
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
  } catch (error: unknown) {
    if (input.signal.aborted || isAbortLike(error)) {
      return cancelled(input.signal);
    }
    return pushFailed("push", error);
  }
}

export function __setPushBranchDependenciesForTests(nextDependencies: PushBranchDependencies): void {
  dependencies = nextDependencies;
}

export function __resetPushBranchDependenciesForTests(): void {
  dependencies = {
    add: git.add,
    branch: git.branch,
    commit: git.commit,
    fetch: git.fetch,
    push: git.push,
    remove: git.remove,
    resolveRef: git.resolveRef,
    statusMatrix: git.statusMatrix
  };
}

async function commitTrackedWorkspaceChanges(input: {
  readonly fs: PushOptions["fs"];
  readonly dir: string;
  readonly branchName: BranchName;
}): Promise<{ readonly ok: true } | { readonly ok: false; readonly refusal: DeliveryRefusal }> {
  const matrix = await dependencies.statusMatrix({ fs: input.fs, dir: input.dir });
  const trackedChanges = matrix.filter(([_filepath, head, workdir, stage]) => {
    if (head === 0) return false;
    return head !== workdir || head !== stage || workdir !== stage;
  });

  if (trackedChanges.length === 0) {
    return {
      ok: false,
      refusal: {
        kind: "push-failed",
        evidence: { phase: "push", message: "no tracked workspace changes to commit" }
      }
    };
  }

  for (const [filepath, _head, workdir] of trackedChanges) {
    if (workdir === 0) {
      await dependencies.remove({ fs: input.fs, dir: input.dir, filepath });
    } else {
      await dependencies.add({ fs: input.fs, dir: input.dir, filepath });
    }
  }

  await dependencies.commit({
    fs: input.fs,
    dir: input.dir,
    message: `protostar delivery ${input.branchName}`,
    author: {
      name: "Protostar Factory",
      email: "protostar-factory@users.noreply.github.com"
    }
  });

  return { ok: true };
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
    if (input.input.signal.aborted || isAbortLike(error)) {
      return cancelled(input.input.signal);
    }
    return pushFailed("fetch", error);
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

function pushFailed(phase: "fetch" | "push", error: unknown): { readonly ok: false; readonly refusal: DeliveryRefusal } {
  return {
    ok: false,
    refusal: {
      kind: "push-failed",
      evidence: { phase, message: sanitizeDeliveryErrorMessage(error) }
    }
  };
}

function isAbortLike(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  return error.name === "AbortError" || error.name === "TimeoutError";
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

function isRecord(value: unknown): value is { readonly code?: unknown; readonly message?: unknown; readonly name?: unknown } {
  return typeof value === "object" && value !== null;
}
