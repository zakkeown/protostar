import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { performance } from "node:perf_hooks";

import { applyOuterPatternGuard, ArgvViolation } from "./argv-pattern-guard.js";
import type { CommandSchema } from "./subprocess-schemas/index.js";

const DEFAULT_STDOUT_TAIL_BYTES = 8192;
const DEFAULT_STDERR_TAIL_BYTES = 4096;

// Kept structurally aligned with @protostar/authority's AuthorizedSubprocessOp
// to avoid a circular TS project reference: authority imports @protostar/repo.
export interface AuthorizedSubprocessOp {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly resolvedEnvelope: unknown;
}

export interface RunCommandOptions {
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutTailBytes?: number;
  readonly stderrTailBytes?: number;
  /** Effective allowlist (baseline union policy extension). */
  readonly effectiveAllowlist: readonly string[];
  /** Per-command schemas keyed by command name. */
  readonly schemas: Readonly<Record<string, CommandSchema>>;
  /** Optional explicit timeout in ms (kills child). Phase 4 plumbs this from envelope budget. */
  readonly timeoutMs?: number;
  /** Optional env override for child. Defaults to process.env. */
  readonly env?: NodeJS.ProcessEnv;
}

export interface SubprocessResult {
  readonly argv: readonly string[];
  readonly command: string;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly stdoutPath: string;
  readonly stderrPath: string;
  readonly stdoutTail: string;
  readonly stderrTail: string;
  readonly stdoutBytes: number;
  readonly stderrBytes: number;
  readonly killed: boolean;
}

export type SubprocessRefusedReason =
  | "command-not-allowlisted"
  | "no-schema"
  | "argv-violation";

export class SubprocessRefusedError extends Error {
  constructor(
    public readonly reason: SubprocessRefusedReason,
    message: string
  ) {
    super(message);
    this.name = "SubprocessRefusedError";
  }
}

export async function runCommand(
  op: AuthorizedSubprocessOp,
  options: RunCommandOptions
): Promise<SubprocessResult> {
  validateBeforeSpawn(op, options);

  await Promise.all([
    mkdir(dirname(options.stdoutPath), { recursive: true }),
    mkdir(dirname(options.stderrPath), { recursive: true })
  ]);

  const stdoutStream = createWriteStream(options.stdoutPath);
  const stderrStream = createWriteStream(options.stderrPath);
  const stdoutCapture = createTailCapture(options.stdoutTailBytes ?? DEFAULT_STDOUT_TAIL_BYTES);
  const stderrCapture = createTailCapture(options.stderrTailBytes ?? DEFAULT_STDERR_TAIL_BYTES);
  const start = performance.now();
  let killed = false;
  let timer: NodeJS.Timeout | undefined;

  const child = spawn(op.command, [...op.args], {
    shell: false,
    cwd: op.cwd,
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk: Buffer) => {
    stdoutCapture.push(chunk);
    stdoutStream.write(chunk);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderrCapture.push(chunk);
    stderrStream.write(chunk);
  });

  if (options.timeoutMs !== undefined) {
    timer = setTimeout(() => {
      killed = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);
  }

  try {
    const exitCodePromise = new Promise<number>((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code) => resolve(code ?? -1));
      stdoutStream.on("error", reject);
      stderrStream.on("error", reject);
    });
    const stdioClosedPromise = Promise.all([
      waitForReadableEnd(child.stdout),
      waitForReadableEnd(child.stderr)
    ]);
    const exitCode = await exitCodePromise;
    await stdioClosedPromise;

    await Promise.all([endStream(stdoutStream), endStream(stderrStream)]);
    return {
      argv: Object.freeze([...op.args]),
      command: op.command,
      exitCode,
      durationMs: performance.now() - start,
      stdoutPath: options.stdoutPath,
      stderrPath: options.stderrPath,
      stdoutTail: stdoutCapture.tail().toString("utf8"),
      stderrTail: stderrCapture.tail().toString("utf8"),
      stdoutBytes: stdoutCapture.bytes(),
      stderrBytes: stderrCapture.bytes(),
      killed
    };
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}

function validateBeforeSpawn(op: AuthorizedSubprocessOp, options: RunCommandOptions): void {
  if (!options.effectiveAllowlist.includes(op.command)) {
    throw new SubprocessRefusedError(
      "command-not-allowlisted",
      `command "${op.command}" is not in effectiveAllowlist`
    );
  }

  const schema = options.schemas[op.command];
  if (schema === undefined) {
    throw new SubprocessRefusedError("no-schema", `command "${op.command}" has no schema`);
  }

  try {
    // v1 flattens flags across subcommands. Subcommand-specific flag pinning can
    // refine this after Plan 12 contract tests if the broader union proves leaky.
    applyOuterPatternGuard(op.args, {
      allowedFlagPrefixes: flattenAllowedFlags(schema),
      refValuePattern: schema.refValuePattern
    });

    const subcommand = op.args[0];
    if (
      subcommand !== undefined &&
      subcommand.length > 0 &&
      schema.allowedSubcommands.length > 0 &&
      !schema.allowedSubcommands.includes(subcommand)
    ) {
      throw new ArgvViolation(
        "ref-pattern-violation",
        `subcommand "${subcommand}" is not allowed for command "${op.command}"`
      );
    }

    schema.validateArgv?.(op.args);
  } catch (error) {
    if (error instanceof ArgvViolation) {
      throw new SubprocessRefusedError("argv-violation", error.message);
    }
    throw error;
  }
}

function flattenAllowedFlags(schema: CommandSchema): readonly string[] {
  return Object.values(schema.allowedFlags).flat();
}

function createTailCapture(limit: number): {
  push(chunk: Buffer): void;
  tail(): Buffer;
  bytes(): number;
} {
  let tail = Buffer.alloc(0);
  let totalBytes = 0;

  return {
    push(chunk) {
      totalBytes += chunk.length;
      tail = Buffer.concat([tail, chunk]);
      if (tail.length > limit) {
        tail = tail.subarray(tail.length - limit);
      }
    },
    tail() {
      return tail;
    },
    bytes() {
      return totalBytes;
    }
  };
}

function waitForReadableEnd(stream: NodeJS.ReadableStream | null): Promise<void> {
  if (stream === null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.once("end", () => {
      stream.off("error", reject);
      resolve();
    });
  });
}

function endStream(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.once("error", reject);
    stream.end(() => {
      stream.off("error", reject);
      resolve();
    });
  });
}
