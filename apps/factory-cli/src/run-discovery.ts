import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export interface RunDirEntry {
  readonly runId: string;
  readonly path: string;
  readonly mtimeMs: number;
}

export interface ListRunsOptions {
  readonly runsRoot: string;
  readonly limit?: number;
  readonly sinceMs?: number;
  readonly all?: boolean;
  readonly runIdRegex: RegExp;
  readonly nowMs?: number;
}

export function listRuns(opts: ListRunsOptions): Promise<readonly RunDirEntry[]> {
  return listRunsInner(opts);
}

async function listRunsInner(opts: ListRunsOptions): Promise<readonly RunDirEntry[]> {
  let dirents: Awaited<ReturnType<typeof readRunDirents>>;
  try {
    dirents = await readRunDirents(opts.runsRoot);
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      return [];
    }
    return [];
  }

  const entries: RunDirEntry[] = [];
  for (const dirent of dirents) {
    if (!dirent.isDirectory()) {
      continue;
    }

    opts.runIdRegex.lastIndex = 0;
    if (!opts.runIdRegex.test(dirent.name)) {
      continue;
    }

    const runDir = resolve(opts.runsRoot, dirent.name);
    try {
      const info = await stat(runDir);
      entries.push({ runId: dirent.name, path: runDir, mtimeMs: info.mtimeMs });
    } catch {
      // Directory scan is best-effort: one damaged row must not hide every run.
    }
  }

  entries.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const nowMs = opts.nowMs ?? Date.now();
  const filtered =
    opts.sinceMs === undefined
      ? entries
      : entries.filter((entry) => entry.mtimeMs >= nowMs - opts.sinceMs!);

  if (opts.all === true) {
    return filtered;
  }

  return filtered.slice(0, opts.limit ?? 25);
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

async function readRunDirents(runsRoot: string) {
  return readdir(runsRoot, { withFileTypes: true });
}
