import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const KNOWN_CONTRACT_TESTS = new Set(["no-net.contract.test.ts", "no-fs.contract.test.ts"]);

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "../../src");

const FORBIDDEN_NET_PATTERNS: readonly RegExp[] = [
  /from\s+["']node:net["']/,
  /from\s+["']node:http["']/,
  /from\s+["']node:https["']/,
  /from\s+["']node:http2["']/,
  /from\s+["']node:dgram["']/,
  /from\s+["']node:tls["']/,
  /from\s+["']http["']/,
  /from\s+["']https["']/,
  /from\s+["']net["']/,
  /from\s+["']ws["']/,
  /from\s+["']websocket["']/,
  /\bfetch\s*\(/,
  /\bWebSocket\b/
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

describe("@protostar/mock-llm-adapter - network authority boundary", () => {
  it("has no network imports, fetch, or websocket usage in production src/", async () => {
    const offenders: string[] = [];
    const scanned: string[] = [];
    for await (const file of walkTypeScriptFiles(srcRoot)) {
      if (KNOWN_CONTRACT_TESTS.has(basename(file))) continue;
      scanned.push(file);
      const raw = await readFile(file, "utf8");
      const code = stripComments(raw);
      if (FORBIDDEN_NET_PATTERNS.some((pattern) => pattern.test(code))) {
        offenders.push(file);
      }
    }

    assert.ok(scanned.length > 0, "mock adapter package must expose production source behind its export");
    assert.deepEqual(
      offenders,
      [],
      `network authority is forbidden in @protostar/mock-llm-adapter src/. Offenders:\n${offenders.join("\n")}`
    );
  });
});
