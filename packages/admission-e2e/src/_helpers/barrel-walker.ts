import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function* walkBarrels(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "internal") continue;
      yield* walkBarrels(full);
    } else if (entry.name === "index.ts" || entry.name === "index.js") {
      yield full;
    }
  }
}

export async function* walkAllTypeScriptFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkAllTypeScriptFiles(full);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
      yield full;
    }
  }
}

export async function readAll(filePath: string): Promise<string> {
  return await readFile(filePath, "utf8");
}
