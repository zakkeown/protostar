import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".protostar", ".git"]);
const DASHBOARD_DIR = "apps/factory-cli/src/dashboard";
const PHASE_11_NO_DASHBOARD_MESSAGE =
  "Phase 11 uses .protostar/stress/<sessionId>/events.jsonl; no dashboard/server code is allowed";

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
  /from\s+["']http["']/,
  /from\s+["']https["']/,
  /from\s+["']ws["']/,
  /require\s*\(\s*["']ws["']\s*\)/,
  /\bWebSocketServer\b/,
  /\bcreateServer\s*\(/
];

interface DashboardServerOffender {
  readonly file: string;
  readonly line: number;
  readonly pattern: string;
}

describe("Phase 11 R2 observability: no dashboard/server surface", () => {
  it("keeps stress observability on events.jsonl instead of dashboard/server code", async () => {
    const offenders = await findDashboardServerOffenders(REPO_ROOT);
    const dashboardExists = await pathExists(resolve(REPO_ROOT, DASHBOARD_DIR));

    assert.deepEqual(
      { dashboardExists, offenders },
      { dashboardExists: false, offenders: [] },
      PHASE_11_NO_DASHBOARD_MESSAGE
    );
  });

  it("detects a synthetic production HTTP server surface", async () => {
    const fixtureDir = resolve(REPO_ROOT, "packages", "admission-e2e", "src", "__no_dashboard_tmp__");
    const fixtureFile = resolve(fixtureDir, "synthetic-production.ts");
    await mkdir(fixtureDir, { recursive: true });

    try {
      await writeFile(
        fixtureFile,
        "import { createServer } from \"node:http\";\nexport const server = createServer(() => undefined);\n",
        "utf8"
      );
      const offenders = await findDashboardServerOffenders(REPO_ROOT);

      assert.deepEqual(offenders, [
        {
          file: "packages/admission-e2e/src/__no_dashboard_tmp__/synthetic-production.ts",
          line: 1,
          pattern: "from\\s+[\"']node:http[\"']"
        },
        {
          file: "packages/admission-e2e/src/__no_dashboard_tmp__/synthetic-production.ts",
          line: 2,
          pattern: "\\bcreateServer\\s*\\("
        }
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });
});

async function findDashboardServerOffenders(repoRoot: string): Promise<readonly DashboardServerOffender[]> {
  const offenders: DashboardServerOffender[] = [];
  for (const scanRoot of await sourceRoots(repoRoot)) {
    for await (const file of walkTypeScriptFiles(scanRoot)) {
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

async function sourceRoots(repoRoot: string): Promise<readonly string[]> {
  const roots: string[] = [];
  for (const workspaceDir of ["apps", "packages"] as const) {
    const workspaceRoot = resolve(repoRoot, workspaceDir);
    const entries = await readdir(workspaceRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
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

function isExcluded(relativePath: string): boolean {
  return relativePath.endsWith(".test.ts") || relativePath.endsWith(".contract.test.ts");
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, "")).replace(/\/\/[^\n]*/g, "");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
