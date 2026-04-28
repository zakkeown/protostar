import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static authority-boundary contract for `@protostar/dogpile-adapter`.
 *
 * Per Phase 6 D-09 (Q-09) and PILE-06: dogpile-adapter src/ must contain ZERO
 * `node:fs` / `node:fs/promises` / `fs` / `node:path` imports. The adapter is a
 * coordination-only network surface; only `apps/factory-cli` and
 * `packages/repo` may touch the filesystem.
 *
 * This test file itself imports `node:fs/promises`, `node:path`, and `node:url`
 * (it has to walk the source tree). The walker EXCLUDES this file by basename
 * so the contract test does not flag itself.
 *
 * Defense-in-depth: a runtime fs-stub regression ships in `@protostar/admission-e2e`
 * at Phase 6 Plan 08 (Wave 4).
 */

const SELF_BASENAME = "no-fs.contract.test.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
// Walk the .ts sources next to this compiled file's source location; when
// tests run from dist/, resolve back to ../../src.
const srcRoot = resolve(__dirname, "../src");

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:fs["']/,
  /from\s+["']node:fs\/promises["']/,
  /from\s+["']fs["']/,
  /from\s+["']node:path["']/,
  /from\s+["']path["']/
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

describe("@protostar/dogpile-adapter - fs authority boundary", () => {
  it("no node:fs/node:path imports anywhere in src/ (excluding this contract file)", async () => {
    const offenders: string[] = [];
    for await (const file of walkTypeScriptFiles(srcRoot)) {
      if (basename(file) === SELF_BASENAME) {
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
      `node:fs / node:path imports forbidden in @protostar/dogpile-adapter src/. Offenders:\n${offenders.join("\n")}`
    );
  });
});
