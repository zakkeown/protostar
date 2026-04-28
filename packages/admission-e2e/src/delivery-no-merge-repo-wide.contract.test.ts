import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SCAN_ROOTS = ["packages", "apps"] as const;
const SKIP_DIRS = new Set(["node_modules", "dist", ".protostar", ".git"]);

// Only contract tests may spell forbidden merge surfaces as data; production source remains covered repo-wide.
const ALLOWLIST_RELATIVE = new Set([
  "packages/delivery-runtime/src/no-merge.contract.test.ts",
  "packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts"
]);

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /pulls\.merge\b/,
  /pullRequests\.merge\b/,
  /enableAutoMerge\b/,
  /merge_method\b/,
  /\bautomerge\b/i,
  /pulls\.updateBranch\b/,
  /["']gh\s+pr\s+merge["']/,
  /git\s+merge\s+--/
];

interface MergeSurfaceOffender {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
}

describe("DELIVER-07: repo-wide no-merge contract", () => {
  it("zero merge surfaces in any production source", async () => {
    const offenders = await findMergeSurfaceOffenders(REPO_ROOT);

    assert.deepEqual(
      offenders,
      [],
      `Merge surface(s) found in production source: ${JSON.stringify(offenders, null, 2)}`
    );
  });

  it("detects a synthetic production merge surface", async () => {
    const fixtureDir = resolve(REPO_ROOT, "packages", "admission-e2e", "src", "__no_merge_tmp__");
    const fixtureFile = resolve(fixtureDir, "synthetic-production.ts");
    await mkdir(fixtureDir, { recursive: true });

    try {
      await writeFile(fixtureFile, "export function unsafe(client: any) { return client.pulls.merge({}); }\n", "utf8");
      const offenders = await findMergeSurfaceOffenders(REPO_ROOT);

      assert.deepEqual(offenders, [
        {
          file: "packages/admission-e2e/src/__no_merge_tmp__/synthetic-production.ts",
          line: 1,
          pattern: "pulls\\.merge\\b"
        }
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not scan the explicit no-merge contract allowlist", () => {
    assert.equal(ALLOWLIST_RELATIVE.has("packages/delivery-runtime/src/no-merge.contract.test.ts"), true);
    assert.equal(ALLOWLIST_RELATIVE.has("packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts"), true);
  });
});

async function findMergeSurfaceOffenders(repoRoot: string): Promise<readonly MergeSurfaceOffender[]> {
  const offenders: MergeSurfaceOffender[] = [];
  for (const root of SCAN_ROOTS) {
    const scanRoot = resolve(repoRoot, root);
    for await (const file of walkTs(scanRoot)) {
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      if (isExcluded(rel)) {
        continue;
      }

      const raw = await readFile(file, "utf8");
      const stripped = stripComments(raw);
      const lines = stripped.split("\n");
      for (const pattern of FORBIDDEN_PATTERNS) {
        const lineIndex = lines.findIndex((line) => pattern.test(line));
        if (lineIndex >= 0) {
          offenders.push({ file: rel, line: lineIndex + 1, pattern: pattern.source });
        }
      }
    }
  }

  return offenders;
}

async function* walkTs(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkTs(full);
      }
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function isExcluded(relativePath: string): boolean {
  return (
    relativePath.endsWith(".test.ts") ||
    relativePath.endsWith(".contract.test.ts") ||
    ALLOWLIST_RELATIVE.has(relativePath)
  );
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
}
