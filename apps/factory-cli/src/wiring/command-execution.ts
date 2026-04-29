import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

import type { MechanicalChecksSubprocessRunner } from "@protostar/mechanical-checks";
import {
  MECHANICAL_COMMAND_BINDINGS,
  MechanicalCommandRefusedError,
  runCommand,
  type AuthorizedSubprocessOp,
  type CommandSchema,
  type MechanicalCommandName
} from "@protostar/repo";

/**
 * Phase 12 D-03 / D-14: mechanical-command runtime extracted from
 * `apps/factory-cli/src/main.ts`. Every mechanical command goes through
 * `@protostar/repo`'s `runCommand` (closed allowlist + per-command schema +
 * refusal-evidence runner). Operator-supplied argv is impossible — the
 * runner binds argv from the closed name table at the wiring boundary.
 *
 * Structural assertion (D-07): this file MUST NOT contain the
 * delivery-token env-var name. The token site lives in
 * `wiring/delivery.ts` (read there, passed in-process to Octokit + onAuth).
 */
export interface CreateMechanicalSubprocessRunnerInput {
  readonly runDir: string;
  readonly resolvedEnvelope: unknown;
  /** Capability envelope's mechanical.allowed[] (D-04). */
  readonly allowedMechanicalCommands: readonly MechanicalCommandName[];
  /** Effective allowlist (baseline ∪ policy.commandAllowlist). */
  readonly effectiveAllowlist: readonly string[];
  /** Per-command schemas keyed by command name. */
  readonly schemas: Readonly<Record<string, CommandSchema>>;
}

export function createMechanicalSubprocessRunner(
  input: CreateMechanicalSubprocessRunnerInput
): MechanicalChecksSubprocessRunner {
  return {
    async runCommand(command) {
      const name = command.name;
      if (!input.allowedMechanicalCommands.includes(name)) {
        throw new MechanicalCommandRefusedError("not-in-capability-envelope", name);
      }
      const binding = MECHANICAL_COMMAND_BINDINGS[name];
      if (binding === undefined) {
        throw new MechanicalCommandRefusedError("unknown-name", name);
      }
      const dir = resolve(input.runDir, "review", "mechanical");
      await mkdir(dir, { recursive: true });
      const stdoutPath = resolve(dir, `${name}.stdout.log`);
      const stderrPath = resolve(dir, `${name}.stderr.log`);
      const op: AuthorizedSubprocessOp = {
        command: binding.command,
        args: binding.args,
        cwd: command.cwd,
        resolvedEnvelope: input.resolvedEnvelope
      };
      const result = await runCommand(op, {
        stdoutPath,
        stderrPath,
        effectiveAllowlist: input.effectiveAllowlist,
        schemas: input.schemas,
        timeoutMs: command.timeoutMs,
        // D-06/D-07: baseline-only env. The delivery token never crosses
        // the subprocess boundary (it stays at the Octokit/onAuth library
        // boundary in wiring/delivery.ts).
        inheritEnv: []
      });
      return {
        argv: [binding.command, ...binding.args],
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdoutPath: result.stdoutPath,
        stderrPath: result.stderrPath,
        stdoutBytes: result.stdoutBytes,
        stderrBytes: result.stderrBytes
      };
    }
  };
}
