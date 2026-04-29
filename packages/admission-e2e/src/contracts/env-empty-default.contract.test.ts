import { strict as assert } from "node:assert";
import { readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { buildAuthorizedSubprocessOpForTest } from "@protostar/authority/internal/test-builders";
import {
  intersectAllowlist,
  NODE_SCHEMA,
  runCommand,
  type RunCommandOptions
} from "@protostar/repo";
import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function findRepoRoot(start: string): Promise<string> {
  let current = start;
  while (current !== dirname(current)) {
    try {
      await stat(resolve(current, "pnpm-workspace.yaml"));
      return current;
    } catch {
      current = dirname(current);
    }
  }
  throw new Error(`could not locate repo root from ${start}`);
}

async function walk(dir: string, files: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "dist" || entry.name === "node_modules") continue;
      await walk(full, files);
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

describe("subprocess-runner env-empty-default contract (AUTH-06, AUTH-07)", () => {
  it("static scan: no inheritEnv literal contains PROTOSTAR_GITHUB_TOKEN", async () => {
    const repoRoot = await findRepoRoot(__dirname);
    const scanRoots = [
      resolve(repoRoot, "apps/factory-cli/src"),
      resolve(repoRoot, "packages/repo/src")
    ];
    const offenders: string[] = [];
    // Match any `inheritEnv: [ ... PROTOSTAR_GITHUB_TOKEN ... ]` literal.
    const pattern = /inheritEnv\s*:\s*\[[^\]]*PROTOSTAR_GITHUB_TOKEN/;
    for (const root of scanRoots) {
      for (const file of await walk(root)) {
        const content = await readFile(file, "utf8");
        // Strip line-comments so commented-out occurrences don't false-positive.
        const stripped = content.replace(/^\s*\/\/.*$/gm, "");
        if (pattern.test(stripped)) offenders.push(file);
      }
    }
    assert.deepEqual(
      offenders,
      [],
      `inheritEnv literal contains PROTOSTAR_GITHUB_TOKEN in: ${offenders.join(", ")}`
    );
  });

  it("runtime: empty inheritEnv yields baseline-only child env (no PROTOSTAR_GITHUB_TOKEN)", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    // Plant a fake token in the parent env to prove it does NOT cross.
    const previous = process.env.PROTOSTAR_GITHUB_TOKEN;
    process.env.PROTOSTAR_GITHUB_TOKEN =
      "ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    t.after(() => {
      if (previous === undefined) delete process.env.PROTOSTAR_GITHUB_TOKEN;
      else process.env.PROTOSTAR_GITHUB_TOKEN = previous;
    });

    const scriptPath = join(repo.dir, "dump-env.mjs");
    await writeFile(
      scriptPath,
      "process.stdout.write(JSON.stringify(Object.keys(process.env).sort()));\n"
    );
    const options: RunCommandOptions = {
      stdoutPath: `${repo.dir}/logs/empty.stdout.log`,
      stderrPath: `${repo.dir}/logs/empty.stderr.log`,
      effectiveAllowlist: intersectAllowlist(["node"]),
      schemas: { node: NODE_SCHEMA },
      inheritEnv: []
    };
    const op = buildAuthorizedSubprocessOpForTest({
      command: "node",
      args: [scriptPath],
      cwd: repo.dir
    });

    const result = await runCommand(op, options);

    assert.equal(result.exitCode, 0);
    const childKeys = JSON.parse(result.stdoutTail) as string[];
    const factoryAllowed = new Set(["PATH", "HOME", "LANG", "USER"]);
    const osInjected = new Set(["__CF_USER_TEXT_ENCODING", "__CFBundleIdentifier"]);
    for (const key of childKeys) {
      const tolerated = factoryAllowed.has(key) || osInjected.has(key);
      assert.ok(tolerated, `unexpected key crossed factory boundary: ${key}`);
    }
    assert.ok(!childKeys.includes("PROTOSTAR_GITHUB_TOKEN"));
    for (const key of result.inheritedEnvKeys) {
      assert.ok(factoryAllowed.has(key));
    }
  });

  it("runtime: explicit inheritEnv extends baseline only with the listed keys", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    process.env.PROTOSTAR_TEST_FLAG = "yes";
    t.after(() => {
      delete process.env.PROTOSTAR_TEST_FLAG;
    });

    const scriptPath = join(repo.dir, "dump-env-extend.mjs");
    await writeFile(
      scriptPath,
      "process.stdout.write(JSON.stringify(Object.keys(process.env).sort()));\n"
    );
    const options: RunCommandOptions = {
      stdoutPath: `${repo.dir}/logs/extend.stdout.log`,
      stderrPath: `${repo.dir}/logs/extend.stderr.log`,
      effectiveAllowlist: intersectAllowlist(["node"]),
      schemas: { node: NODE_SCHEMA },
      inheritEnv: ["PROTOSTAR_TEST_FLAG"]
    };
    const op = buildAuthorizedSubprocessOpForTest({
      command: "node",
      args: [scriptPath],
      cwd: repo.dir
    });

    const result = await runCommand(op, options);

    assert.equal(result.exitCode, 0);
    const childKeys = JSON.parse(result.stdoutTail) as string[];
    const factoryAllowed = new Set(["PATH", "HOME", "LANG", "USER", "PROTOSTAR_TEST_FLAG"]);
    const osInjected = new Set(["__CF_USER_TEXT_ENCODING", "__CFBundleIdentifier"]);
    for (const key of childKeys) {
      const tolerated = factoryAllowed.has(key) || osInjected.has(key);
      assert.ok(tolerated, `unexpected key crossed factory boundary: ${key}`);
    }
    assert.ok(childKeys.includes("PROTOSTAR_TEST_FLAG"));
    assert.ok(result.inheritedEnvKeys.includes("PROTOSTAR_TEST_FLAG"));
  });

  it("inheritEnv is REQUIRED (not optional) in RunCommandOptions source declaration", async () => {
    const repoRoot = await findRepoRoot(__dirname);
    const src = await readFile(
      resolve(repoRoot, "packages/repo/src/subprocess-runner.ts"),
      "utf8"
    );
    // Required field: no `?` between `inheritEnv` and `:`.
    assert.match(
      src,
      /readonly inheritEnv:\s*readonly string\[\]\s*;/,
      "RunCommandOptions.inheritEnv must be required (no '?'), per D-07/Pitfall 2"
    );
    // Baseline constant pinned literally.
    assert.match(src, /POSIX_BASELINE_ENV_KEYS\s*=\s*Object\.freeze\(\["PATH",\s*"HOME",\s*"LANG",\s*"USER"\]/);
  });
});
