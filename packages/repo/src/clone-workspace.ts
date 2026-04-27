import * as fs from "node:fs";

import git, { type AuthCallback, type GitAuth } from "isomorphic-git";
import httpNode from "isomorphic-git/http/node";

import { auditSymlinks, type SymlinkAuditResult } from "./symlink-audit.js";

export type CloneAuthMode = "credentialRef" | "system" | "anonymous";

export interface CloneRequest {
  readonly url: string;
  /** Workspace dir. Must not exist or must be empty; isomorphic-git enforces clone viability. */
  readonly dir: string;
  readonly ref?: string;
  readonly depth?: number;
  /** Env-var name, never the credential value. */
  readonly credentialRef?: string;
}

export interface CloneResult {
  readonly dir: string;
  readonly headSha: string;
  readonly auth: {
    readonly mode: CloneAuthMode;
    readonly credentialRef?: string;
  };
  readonly symlinkAudit: SymlinkAuditResult;
}

export class CredentialRefusedError extends Error {
  constructor(
    public readonly credentialRef: string,
    cause?: unknown
  ) {
    super(`credentialRef ${credentialRef} was refused while cloning`, { cause });
    this.name = "CredentialRefusedError";
  }
}

type CloneOptions = Parameters<typeof git.clone>[0];
type ResolveRefOptions = Parameters<typeof git.resolveRef>[0];

interface CloneWorkspaceDependencies {
  readonly clone: (options: CloneOptions) => Promise<void>;
  readonly resolveRef: (options: ResolveRefOptions) => Promise<string>;
  readonly auditSymlinks: (workspaceRoot: string) => Promise<SymlinkAuditResult>;
}

let dependencies: CloneWorkspaceDependencies = {
  clone: git.clone,
  resolveRef: git.resolveRef,
  auditSymlinks
};

export function buildOnAuth(credentialRef: string | undefined): AuthCallback {
  let invocationCount = 0;

  return () => {
    invocationCount += 1;
    if (credentialRef !== undefined && invocationCount > 2) {
      return { cancel: true };
    }
    if (credentialRef === undefined) {
      return {};
    }

    const token = process.env[credentialRef];
    if (token === undefined || token.length === 0) {
      return { cancel: true };
    }

    return { username: token, password: "x-oauth-basic" };
  };
}

export async function cloneWorkspace(req: CloneRequest): Promise<CloneResult> {
  const authState = { usedCredentialRef: false, cancelled: false };
  const onAuth = instrumentAuth(buildOnAuth(req.credentialRef), authState);

  try {
    await dependencies.clone({
      fs,
      http: httpNode,
      dir: req.dir,
      url: req.url,
      singleBranch: true,
      depth: req.depth ?? 1,
      ...(req.ref !== undefined ? { ref: req.ref } : {}),
      onAuth
    });
  } catch (error: unknown) {
    if (req.credentialRef !== undefined && authState.cancelled) {
      throw new CredentialRefusedError(req.credentialRef, error);
    }
    throw error;
  }

  const headSha = await dependencies.resolveRef({ fs, dir: req.dir, ref: "HEAD" });
  const symlinkAudit = await dependencies.auditSymlinks(req.dir);
  const auth = authResult(req.credentialRef, authState.usedCredentialRef);

  return {
    dir: req.dir,
    headSha,
    auth,
    symlinkAudit
  };
}

export function __setCloneWorkspaceDependenciesForTests(
  nextDependencies: CloneWorkspaceDependencies
): void {
  dependencies = nextDependencies;
}

export function __resetCloneWorkspaceDependenciesForTests(): void {
  dependencies = {
    clone: git.clone,
    resolveRef: git.resolveRef,
    auditSymlinks
  };
}

function instrumentAuth(
  onAuth: AuthCallback,
  authState: { usedCredentialRef: boolean; cancelled: boolean }
): AuthCallback {
  return async (url: string, auth: GitAuth) => {
    const result = await onAuth(url, auth);
    if (result?.cancel === true) {
      authState.cancelled = true;
    } else if (typeof result?.username === "string" && result.username.length > 0) {
      authState.usedCredentialRef = true;
    }
    return result;
  };
}

function authResult(
  credentialRef: string | undefined,
  usedCredentialRef: boolean
): CloneResult["auth"] {
  if (credentialRef !== undefined && usedCredentialRef) {
    return { mode: "credentialRef", credentialRef };
  }
  return { mode: "anonymous" };
}
