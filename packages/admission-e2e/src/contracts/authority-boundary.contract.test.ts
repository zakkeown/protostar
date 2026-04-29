import { strict as assert } from "node:assert";
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface BoundaryRule {
  readonly reason: string;
  readonly forbidden: readonly ForbiddenImport[];
}

type ForbiddenImport = string | RegExp | ((specifier: string, importClause: string) => boolean);

interface ImportRef {
  readonly specifier: string;
  readonly clause: string;
}

interface BoundaryViolation {
  readonly file: string;
  readonly packageName: string;
  readonly specifier: string;
  readonly reason: string;
}

interface ObservedException {
  readonly file: string;
  readonly reason: string;
}

const FS_IMPORTS: readonly ForbiddenImport[] = [
  "node:fs",
  "node:fs/promises",
  "fs",
  "fs/promises"
];

const PROCESS_IMPORTS: readonly ForbiddenImport[] = [
  "node:child_process",
  "child_process"
];

const NETWORK_IMPORTS: readonly ForbiddenImport[] = [
  /^@octokit\//,
  "node:http",
  "node:https",
  "http",
  "https",
  "node:net",
  "net"
];

const PATH_IMPORTS: readonly ForbiddenImport[] = ["node:path", "path"];

const PURE_PACKAGE_RULE: BoundaryRule = {
  reason: "pure package: no filesystem, subprocess, or network authority",
  forbidden: [...FS_IMPORTS, ...PROCESS_IMPORTS, ...NETWORK_IMPORTS]
};

const PACKAGE_RULES: Readonly<Record<string, BoundaryRule | "unrestricted">> = {
  "admission-e2e": "unrestricted",
  artifacts: PURE_PACKAGE_RULE,
  authority: PURE_PACKAGE_RULE,
  delivery: PURE_PACKAGE_RULE,
  "delivery-runtime": {
    reason: "network package: GitHub delivery allowed; filesystem and subprocess authority forbidden",
    forbidden: [...FS_IMPORTS, ...PROCESS_IMPORTS, "node:net", "net"]
  },
  "dogpile-adapter": {
    reason: "network package: local LM Studio coordination allowed; filesystem and subprocess authority forbidden",
    forbidden: [...FS_IMPORTS, ...PROCESS_IMPORTS, ...PATH_IMPORTS]
  },
  "dogpile-types": PURE_PACKAGE_RULE,
  evaluation: PURE_PACKAGE_RULE,
  // D-13 (Phase 12 AUTH-13): reclassified from PURE_PACKAGE_RULE — manifest tier is network; transitive net via @protostar/dogpile-adapter.
  "evaluation-runner": {
    reason: "network package: orchestrates dogpile-adapter network calls; filesystem and subprocess authority forbidden",
    forbidden: [...FS_IMPORTS, ...PROCESS_IMPORTS, ...PATH_IMPORTS]
  },
  execution: PURE_PACKAGE_RULE,
  fixtures: PURE_PACKAGE_RULE,
  intent: PURE_PACKAGE_RULE,
  "lmstudio-adapter": {
    reason: "network package: local LM Studio HTTP allowed; filesystem and subprocess authority forbidden",
    forbidden: [...FS_IMPORTS, ...PROCESS_IMPORTS]
  },
  "mechanical-checks": PURE_PACKAGE_RULE,
  paths: {
    reason: "@protostar/paths carve-out: only node:path plus existsSync/statSync sentinel checks are allowed",
    forbidden: [
      "fs",
      "fs/promises",
      "node:fs/promises",
      ...PROCESS_IMPORTS,
      ...NETWORK_IMPORTS,
      (specifier, importClause) =>
        specifier === "node:fs" && !/^\s*\{\s*(?:existsSync|statSync)(?:\s*,\s*(?:existsSync|statSync))*\s*\}\s*$/.test(importClause)
    ]
  },
  planning: PURE_PACKAGE_RULE,
  policy: PURE_PACKAGE_RULE,
  repair: PURE_PACKAGE_RULE,
  repo: {
    reason: "filesystem package: repo owns fs and subprocess authority; network authority forbidden",
    forbidden: [...NETWORK_IMPORTS]
  },
  review: PURE_PACKAGE_RULE
};

describe("authority-boundary contract", () => {
  it("enforces package import authority boundaries", async () => {
    const repoRoot = await findRepoRoot(__dirname);
    const packagesRoot = resolve(repoRoot, "packages");
    const reviewPath = resolve(repoRoot, ".planning/SECURITY-REVIEW.md");
    const review = await readFile(reviewPath, "utf8");
    const violations: BoundaryViolation[] = [];
    const observedExceptions: ObservedException[] = [];

    const packageEntries = Object.entries(PACKAGE_RULES).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    for (const [packageName, rule] of packageEntries) {
      if (rule === "unrestricted") continue;

      const srcRoot = resolve(packagesRoot, packageName, "src");
      if (!(await exists(srcRoot))) continue;

      for await (const file of walkTypeScriptFiles(srcRoot)) {
        if (isTestHarness(file)) continue;

        const source = await readFile(file, "utf8");
        const relativeFile = toPosix(relative(repoRoot, file));
        const exceptionReason = parseAuthorityException(source);
        if (exceptionReason !== null) {
          observedExceptions.push({ file: relativeFile, reason: exceptionReason });
          continue;
        }

        for (const importRef of extractImportRefs(source)) {
          const matched = rule.forbidden.some((forbidden) =>
            importMatches(forbidden, importRef.specifier, importRef.clause)
          );
          if (!matched) continue;

          violations.push({
            file: relativeFile,
            packageName,
            specifier: importRef.specifier,
            reason: rule.reason
          });
        }
      }
    }

    assert.deepEqual(
      violations,
      [],
      violations
        .map(
          (violation) =>
            `${violation.file}: ${violation.packageName} imports ${violation.specifier}; ${violation.reason}`
        )
        .join("\n")
    );

    for (const observed of observedExceptions) {
      assert.match(
        review,
        new RegExp(escapeRegExp(observed.file)),
        `${observed.file} has authority-exception: ${observed.reason}, but is missing from the Authority-exception ledger`
      );
    }
  });
});

async function findRepoRoot(start: string): Promise<string> {
  let current = start;
  while (current !== dirname(current)) {
    if (await exists(resolve(current, "pnpm-workspace.yaml"))) return current;
    current = dirname(current);
  }
  throw new Error(`could not locate repo root from ${start}`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function* walkTypeScriptFiles(root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = resolve(root, entry.name);
    if (entry.isDirectory()) {
      yield* walkTypeScriptFiles(fullPath);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield fullPath;
    }
  }
}

function isTestHarness(file: string): boolean {
  const normalized = toPosix(file);
  const name = basename(file);
  return (
    name.endsWith(".test.ts") ||
    name.endsWith(".contract.test.ts") ||
    name.endsWith(".test-support.ts") ||
    normalized.includes("/internal/test-fixtures/")
  );
}

function parseAuthorityException(source: string): string | null {
  const firstLines = source.split(/\r?\n/).slice(0, 5);
  for (const line of firstLines) {
    const match = line.match(/^\s*\/\/\s*authority-exception:\s*(.+)$/);
    if (match) return (match[1] ?? "").trim();
  }
  return null;
}

function extractImportRefs(source: string): readonly ImportRef[] {
  const refs: ImportRef[] = [];
  const importFromPattern = /^\s*import\s+(?:type\s+)?([\s\S]*?)\s+from\s+["']([^"']+)["'];?/gm;
  const sideEffectImportPattern = /^\s*import\s+["']([^"']+)["'];?/gm;
  const exportFromPattern = /^\s*export\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?/gm;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm;

  for (const match of source.matchAll(importFromPattern)) {
    refs.push({ clause: match[1] ?? "", specifier: match[2] ?? "" });
  }
  for (const match of source.matchAll(sideEffectImportPattern)) {
    refs.push({ clause: "", specifier: match[1] ?? "" });
  }
  for (const match of source.matchAll(exportFromPattern)) {
    refs.push({ clause: "", specifier: match[1] ?? "" });
  }
  for (const match of source.matchAll(dynamicImportPattern)) {
    refs.push({ clause: "", specifier: match[1] ?? "" });
  }

  return refs;
}

function importMatches(forbidden: ForbiddenImport, specifier: string, clause: string): boolean {
  if (typeof forbidden === "string") return specifier === forbidden;
  if (forbidden instanceof RegExp) return forbidden.test(specifier);
  return forbidden(specifier, clause);
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
