import assert from "node:assert/strict";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  runCommand,
  SubprocessRefusedError,
  type AuthorizedSubprocessOp,
  type RunCommandOptions
} from "./subprocess-runner.js";
import { NODE_SCHEMA, PNPM_SCHEMA } from "./subprocess-schemas/index.js";

const DEFAULT_SCHEMAS = Object.freeze({ node: NODE_SCHEMA });
const DEFAULT_ALLOWLIST = Object.freeze(["node"]);

describe("runCommand", () => {
  it("refuses commands that are not in the effective allowlist before spawning", async (t) => {
    const context = await createRunContext(t);

    await assert.rejects(
      () => runCommand(mkOp({ command: "node", args: [], cwd: context.dir }), {
        ...context.options,
        effectiveAllowlist: []
      }),
      refusedWith("command-not-allowlisted")
    );
  });

  it("refuses allowlisted commands with no schema before spawning", async (t) => {
    const context = await createRunContext(t);

    await assert.rejects(
      () => runCommand(mkOp({ command: "node", args: [], cwd: context.dir }), {
        ...context.options,
        schemas: {}
      }),
      refusedWith("no-schema")
    );
  });

  it("refuses non-schema flags before spawning", async (t) => {
    const context = await createRunContext(t);

    await assert.rejects(
      () => runCommand(mkOp({ command: "node", args: ["--eval"], cwd: context.dir }), context.options),
      refusedWith("argv-violation")
    );
  });

  it("refuses positional refs outside the schema pattern before spawning", async (t) => {
    const context = await createRunContext(t);

    await assert.rejects(
      () => runCommand(mkOp({ command: "node", args: ["bad:ref"], cwd: context.dir }), context.options),
      refusedWith("argv-violation")
    );
  });

  it("refuses shell metacharacters before spawning", async (t) => {
    const context = await createRunContext(t);

    await assert.rejects(
      () => runCommand(mkOp({ command: "node", args: ["--test", "; rm -rf /"], cwd: context.dir }), context.options),
      refusedWith("argv-violation")
    );
  });

  it("refuses unallowlisted pnpm add argv before spawning", async (t) => {
    for (const args of [
      ["add", "left-pad"],
      ["add", "@playwright/test@latest"],
      ["add", "@playwright/test", "--ignore-scripts"],
      ["add", "fast-check;rm", "-rf", "."],
      ["add", "-g", "fast-check"],
      ["add", "nanoid@^5.0.0"]
    ]) {
      const context = await createRunContext(t, {
        effectiveAllowlist: ["pnpm"],
        schemas: { pnpm: PNPM_SCHEMA }
      });

      await assert.rejects(
        () => runCommand(mkOp({ command: "pnpm", args, cwd: context.dir }), context.options),
        refusedWith("argv-violation"),
        `pnpm ${args.join(" ")} should be refused before spawn.`
      );
      assert.equal(await exists(context.stdoutPath), false, "stdout log should not be created before spawn.");
      assert.equal(await exists(context.stderrPath), false, "stderr log should not be created before spawn.");
    }
  });

  it("streams stdout and stderr to files while returning tails and byte counts", async (t) => {
    const context = await createRunContext(t);
    const script = await writeScript(context.dir, "happy.mjs", [
      "process.stdout.write('hi\\n');",
      "process.stderr.write('warn\\n');"
    ]);

    const result = await runCommand(mkOp({ command: "node", args: [script], cwd: context.dir }), context.options);

    assert.equal(result.command, "node");
    assert.deepEqual(result.argv, [script]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.killed, false);
    assert.equal(await readFile(context.stdoutPath, "utf8"), "hi\n");
    assert.equal(await readFile(context.stderrPath, "utf8"), "warn\n");
    assert.equal(result.stdoutTail, "hi\n");
    assert.equal(result.stderrTail, "warn\n");
    assert.equal(result.stdoutBytes, 3);
    assert.equal(result.stderrBytes, 5);
    assert.ok(result.durationMs >= 0);
  });

  it("keeps full stdout on disk while capping the returned tail", async (t) => {
    const context = await createRunContext(t, { stdoutTailBytes: 1024 });
    const script = await writeScript(context.dir, "large.mjs", [
      "process.stdout.write(Buffer.alloc(100 * 1024, 'x'));"
    ]);

    const result = await runCommand(mkOp({ command: "node", args: [script], cwd: context.dir }), context.options);
    const fullStdout = await readFile(context.stdoutPath);

    assert.equal(result.exitCode, 0);
    assert.equal(fullStdout.byteLength, 100 * 1024);
    assert.equal(result.stdoutBytes, 100 * 1024);
    assert.equal(Buffer.byteLength(result.stdoutTail), 1024);
    assert.equal(result.stdoutTail, fullStdout.subarray(-1024).toString("utf8"));
  });

  it("returns nonzero exit codes without throwing", async (t) => {
    const context = await createRunContext(t);
    const script = await writeScript(context.dir, "nonzero.mjs", [
      "process.stderr.write('failed\\n');",
      "process.exit(1);"
    ]);

    const result = await runCommand(mkOp({ command: "node", args: [script], cwd: context.dir }), context.options);

    assert.equal(result.exitCode, 1);
    assert.equal(result.killed, false);
    assert.equal(result.stderrTail, "failed\n");
  });

  it("kills children that exceed timeoutMs and surfaces killed=true", async (t) => {
    const context = await createRunContext(t, { timeoutMs: 100 });
    const script = await writeScript(context.dir, "forever.mjs", [
      "setInterval(() => {}, 10_000);"
    ]);

    const result = await runCommand(mkOp({ command: "node", args: [script], cwd: context.dir }), context.options);

    assert.equal(result.killed, true);
    assert.equal(result.exitCode, -1);
  });

  it("flushes process output before resolving for small outputs", async (t) => {
    const context = await createRunContext(t);
    const script = await writeScript(context.dir, "flush.mjs", [
      "process.stdout.write('flush-me\\n');"
    ]);

    const result = await runCommand(mkOp({ command: "node", args: [script], cwd: context.dir }), context.options);

    assert.equal(result.stdoutTail, "flush-me\n");
    assert.equal(await readFile(context.stdoutPath, "utf8"), result.stdoutTail);
  });
});

async function createRunContext(
  t: { after(fn: () => void | Promise<void>): void },
  overrides: Partial<RunCommandOptions> = {}
): Promise<{
  readonly dir: string;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly options: RunCommandOptions;
}> {
  const dir = await mkTempDir(t);
  const stdoutPath = join(dir, "logs", "stdout.log");
  const stderrPath = join(dir, "logs", "stderr.log");
  return {
    dir,
    stdoutPath,
    stderrPath,
    options: {
      stdoutPath,
      stderrPath,
      effectiveAllowlist: DEFAULT_ALLOWLIST,
      schemas: DEFAULT_SCHEMAS,
      ...overrides
    }
  };
}

async function mkTempDir(t: { after(fn: () => void | Promise<void>): void }): Promise<string> {
  const dir = await import("node:fs/promises").then(({ mkdtemp }) =>
    mkdtemp(join(tmpdir(), "protostar-subprocess-"))
  );
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

async function writeScript(dir: string, name: string, lines: readonly string[]): Promise<string> {
  const path = join(dir, name);
  await writeFile(path, `${lines.join("\n")}\n`);
  return path;
}

function mkOp(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
}): AuthorizedSubprocessOp {
  return Object.freeze({
    command: input.command,
    args: Object.freeze([...input.args]),
    cwd: input.cwd,
    resolvedEnvelope: Object.freeze({})
  });
}

function refusedWith(reason: SubprocessRefusedError["reason"]): (error: unknown) => boolean {
  return (error: unknown) => error instanceof SubprocessRefusedError && error.reason === reason;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
