// ============================================================================
// PRIVATE SUBPATH — packages/repo tests + admission-e2e ONLY. NOT a public API.
//
// Programmatic builder for sacrificial git repos used in Phase 3 contract
// tests. Backed by isomorphic-git init/commit/branch over a tmpdir. Output
// path returned to caller; cleanup via `t.after(() => fs.rm(...))`.
//
// Phase N may relocate or remove this file without notice.
// ============================================================================

import * as fs from "node:fs";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import git from "isomorphic-git";

export interface BuildSacrificialRepoOptions {
  /** Number of linear commits to create on the default branch (default 1). */
  readonly commits?: number;
  /** Additional branch names to create from HEAD (default []). */
  readonly branches?: readonly string[];
  /** Files to write but NOT commit (creates dirty worktree). [{ path, content }] */
  readonly dirtyFiles?: readonly { readonly path: string; readonly content: string }[];
  /** Symlinks to create. [{ path, target }] — target is workspace-relative or absolute. */
  readonly symlinks?: readonly { readonly path: string; readonly target: string }[];
  /** Default branch name (default "main"). */
  readonly defaultBranch?: string;
}

export interface SacrificialRepo {
  readonly dir: string;
  readonly headSha: string;
  readonly defaultBranch: string;
  /** Each created file's path (workspace-relative) — for tests that need to assert. */
  readonly seededPaths: readonly string[];
}

const TEST_AUTHOR = {
  name: "protostar-test",
  email: "test@protostar.local",
  timestamp: 1_700_000_000,
  timezoneOffset: 0
} as const;

export async function buildSacrificialRepo(
  opts: BuildSacrificialRepoOptions = {}
): Promise<SacrificialRepo> {
  const {
    commits = 1,
    branches = [],
    dirtyFiles = [],
    symlinks = [],
    defaultBranch = "main"
  } = opts;

  const dir = await mkdtemp(join(tmpdir(), `protostar-test-${randomUUID()}-`));
  const seededPaths: string[] = [];

  await git.init({ fs, dir, defaultBranch });

  for (let i = 0; i < commits; i += 1) {
    const filepath = `seed-${i}.txt`;
    await writeRepoFile(dir, filepath, `commit-${i}\n`);
    await git.add({ fs, dir, filepath });
    await git.commit({
      fs,
      dir,
      message: `seed commit ${i}`,
      author: TEST_AUTHOR,
      committer: TEST_AUTHOR
    });
    seededPaths.push(filepath);
  }

  for (const branchName of branches) {
    await git.branch({ fs, dir, ref: branchName, object: "HEAD" });
  }

  for (const dirtyFile of dirtyFiles) {
    await writeRepoFile(dir, dirtyFile.path, dirtyFile.content);
    seededPaths.push(dirtyFile.path);
  }

  for (const link of symlinks) {
    const absoluteLinkPath = resolve(dir, link.path);
    await mkdir(dirname(absoluteLinkPath), { recursive: true });
    await symlink(link.target, absoluteLinkPath);
    seededPaths.push(link.path);
  }

  const headSha = await git.resolveRef({ fs, dir, ref: "HEAD" });

  return {
    dir,
    headSha,
    defaultBranch,
    seededPaths
  };
}

async function writeRepoFile(dir: string, filepath: string, content: string): Promise<void> {
  const absoluteFilePath = resolve(dir, filepath);
  await mkdir(dirname(absoluteFilePath), { recursive: true });
  await writeFile(absoluteFilePath, content);
}
