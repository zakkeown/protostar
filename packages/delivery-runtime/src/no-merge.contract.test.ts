import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SELF_BASENAME = "no-merge.contract.test.ts";
const KNOWN_CONTRACT_TESTS = new Set(["no-fs.contract.test.ts", SELF_BASENAME]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../src");

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

async function* walkTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkTypeScriptFiles(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("@protostar/delivery-runtime - no merge authority boundary", () => {
  it("no pull request merge or branch-update surfaces anywhere in src/ (excluding contract tests)", async () => {
    const offenders: string[] = [];
    for await (const file of walkTypeScriptFiles(srcRoot)) {
      if (KNOWN_CONTRACT_TESTS.has(basename(file))) {
        continue;
      }
      const raw = await readFile(file, "utf8");
      const code = stripComments(raw);
      if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(code))) {
        offenders.push(file);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `Merge and branch-update surfaces forbidden in @protostar/delivery-runtime src/. Offenders:\n${offenders.join("\n")}`
    );
  });
});
