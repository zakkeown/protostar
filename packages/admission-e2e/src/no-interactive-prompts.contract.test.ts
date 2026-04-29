import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".protostar", ".git"]);
const SECURITY_REVIEW = resolve(REPO_ROOT, ".planning", "SECURITY-REVIEW.md");

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:readline["']/,
  /from\s+["']readline["']/,
  /\bprompts\b/,
  /\binquirer\b/,
  /\benquirer\b/,
  /@inquirer\//,
  /process\.stdin\.on\b/,
  /\.question\s*\(/
];

interface PromptOffender {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
}

describe("Phase 11 no-interactive-prompts contract", () => {
  it("keeps production source free of stdin and prompt-library surfaces", async () => {
    const offenders = await findPromptOffenders(REPO_ROOT);

    assert.deepEqual(
      offenders,
      [],
      `Interactive prompt surface(s) found in production source: ${JSON.stringify(offenders, null, 2)}`
    );
  });

  it("detects synthetic prompt usage without a no-prompt-exception ledger entry", async () => {
    const fixtureDir = resolve(REPO_ROOT, "packages", "admission-e2e", "src", "__no_prompt_tmp__");
    const fixtureFile = resolve(fixtureDir, "synthetic-production.ts");
    await mkdir(fixtureDir, { recursive: true });

    try {
      await writeFile(fixtureFile, "process.stdin.on(\"data\", () => undefined);\n", "utf8");
      const offenders = await findPromptOffenders(REPO_ROOT);

      assert.deepEqual(offenders, [
        {
          file: "packages/admission-e2e/src/__no_prompt_tmp__/synthetic-production.ts",
          line: 1,
          pattern: "process\\.stdin\\.on\\b"
        }
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});

async function findPromptOffenders(repoRoot: string): Promise<readonly PromptOffender[]> {
  const offenders: PromptOffender[] = [];
  const securityReview = await readFile(SECURITY_REVIEW, "utf8");
  for (const scanRoot of await sourceRoots(repoRoot)) {
    for await (const file of walkTypeScriptFiles(scanRoot)) {
      const rel = relative(repoRoot, file).replace(/\\/g, "/");
      if (isExcluded(rel)) {
        continue;
      }

      const raw = await readFile(file, "utf8");
      const exception = topOfFilePromptException(raw);
      const stripped = stripComments(raw);
      const lines = stripped.split("\n");
      for (const pattern of FORBIDDEN_PATTERNS) {
        const lineIndex = lines.findIndex((line) => pattern.test(line));
        if (lineIndex < 0) continue;
        if (exception !== undefined && securityReview.includes(rel) && securityReview.includes(exception)) {
          continue;
        }
        offenders.push({ file: rel, line: lineIndex + 1, pattern: pattern.source });
      }
    }
  }

  return offenders;
}

async function sourceRoots(repoRoot: string): Promise<readonly string[]> {
  const roots: string[] = [];
  for (const workspaceDir of ["apps", "packages"] as const) {
    const workspaceRoot = resolve(repoRoot, workspaceDir);
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const srcRoot = resolve(workspaceRoot, entry.name, "src");
      if (await pathExists(srcRoot)) {
        roots.push(srcRoot);
      }
    }
  }
  return roots;
}

async function* walkTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        yield* walkTypeScriptFiles(full);
      }
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function topOfFilePromptException(source: string): string | undefined {
  const firstLines = source.split("\n").slice(0, 5).join("\n");
  return firstLines.match(/\/\/\s*no-prompt-exception:\s*(.+)/)?.[1]?.trim();
}

function isExcluded(relativePath: string): boolean {
  return relativePath.endsWith(".test.ts") || relativePath.endsWith(".contract.test.ts");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path, "utf8");
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "EISDIR") return true;
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
