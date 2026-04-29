import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

interface PackageInfo {
  readonly name: string;
  readonly dir: string;
  readonly exports: Set<string>;
}

const packageDirs = [
  ...(await childDirs(resolve(repoRoot, "packages"))),
  resolve(repoRoot, "apps/factory-cli")
];
const packages = new Map<string, PackageInfo>();

for (const dir of packageDirs) {
  const manifest = JSON.parse(await readFile(resolve(dir, "package.json"), "utf8"));
  const packageName = manifest.name;
  if (typeof packageName !== "string" || !packageName.startsWith("@protostar/")) continue;
  packages.set(packageName, {
    name: packageName,
    dir,
    exports: exportedSubpaths(manifest.exports)
  });
}

const violations: string[] = [];
for (const root of [resolve(repoRoot, "packages"), resolve(repoRoot, "apps")]) {
  for await (const file of walkTypeScriptFiles(root)) {
    if (file.includes(`${sep}dist${sep}`)) continue;
    const source = await readFile(file, "utf8");
    for (const specifier of importSpecifiers(source)) {
      if (!specifier.startsWith("@protostar/")) continue;
      const match = specifier.match(/^(@protostar\/[^/]+)(\/.*)?$/);
      if (!match) continue;
      const packageName = match[1] ?? "";
      const requestedSubpath = match[2] ? `.${match[2]}` : ".";
      const target = packages.get(packageName);
      if (!target) continue;
      if (!target.exports.has(requestedSubpath)) {
        violations.push(`${toPosix(relative(repoRoot, file))}: ${specifier} is not exported by ${packageName}`);
      }
    }
  }
}

assert.deepEqual(violations, [], violations.join("\n"));

async function childDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => resolve(dir, entry.name));
}

async function* walkTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      yield* walkTypeScriptFiles(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

function exportedSubpaths(exportsField: unknown): Set<string> {
  if (typeof exportsField === "string") return new Set(["."]);
  if (!exportsField || typeof exportsField !== "object") return new Set();
  return new Set(Object.keys(exportsField as Record<string, unknown>));
}

function importSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const patterns = [
    /^\s*import\s+(?:type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["'];?/gm,
    /^\s*import\s+["']([^"']+)["'];?/gm,
    /^\s*export\s+[\s\S]*?\s+from\s+["']([^"']+)["'];?/gm,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gm
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1] ?? "");
    }
  }
  return specifiers;
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}
