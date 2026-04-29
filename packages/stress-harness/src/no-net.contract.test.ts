import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../src");

const TEST_FILES = new Set(["no-net.contract.test.ts"]);

const FORBIDDEN_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:fs(?::[^"']+)?["']/,
  /from\s+["']node:path["']/,
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
  /from\s+["']node:http2["']/,
  /from\s+["']node:dgram["']/,
  /from\s+["']node:tls["']/,
  /from\s+["']node:child_process["']/,
  /from\s+["']node:timers\/promises["']/,
  /from\s+["']fs(?::[^"']+)?["']/,
  /from\s+["']path["']/,
  /from\s+["']net["']/,
  /from\s+["']http["']/,
  /from\s+["']https["']/,
  /from\s+["']child_process["']/,
  /from\s+["']timers\/promises["']/,
  /\bfetch\s*\(/
];

describe("@protostar/stress-harness - pure authority boundary", () => {
  it("has no fs, network, child_process, timer, or fetch authority in production src", async () => {
    const offenders: string[] = [];
    for await (const file of walkTypeScriptFiles(srcRoot)) {
      if (TEST_FILES.has(basename(file)) || file.endsWith(".test.ts")) continue;
      const code = stripComments(await readFile(file, "utf8"));
      if (FORBIDDEN_PATTERNS.some((pattern) => pattern.test(code))) {
        offenders.push(file);
      }
    }

    assert.deepEqual(
      offenders,
      [],
      `authority is forbidden in @protostar/stress-harness production src/. Offenders:\n${offenders.join("\n")}`
    );
  });
});

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
