/**
 * Closed allowlist of mechanical command names + per-name argv bindings.
 *
 * Phase 12 D-03 / D-04: operators cannot declare new mechanical commands at
 * runtime. Each new name requires a confirmed-intent schema bump (currently
 * 1.6.0 — see `packages/intent/schema/confirmed-intent.schema.json`).
 *
 * Used by:
 *   - apps/factory-cli/src/wiring/command-execution.ts (runtime)
 *   - packages/lmstudio-adapter/src/factory-config.schema.json (operator config)
 *   - packages/intent/schema/confirmed-intent.schema.json (capability envelope)
 */

export const CLOSED_MECHANICAL_COMMAND_NAMES = Object.freeze([
  "install",
  "build",
  "verify",
  "typecheck",
  "lint",
  "test"
] as const);

export type MechanicalCommandName = (typeof CLOSED_MECHANICAL_COMMAND_NAMES)[number];

export interface MechanicalCommandBinding {
  readonly command: string;
  readonly args: readonly string[];
}

export const MECHANICAL_COMMAND_BINDINGS: Readonly<
  Record<MechanicalCommandName, MechanicalCommandBinding>
> = Object.freeze({
  install: Object.freeze({
    command: "pnpm",
    args: Object.freeze(["install", "--ignore-workspace", "--frozen-lockfile"] as const)
  }),
  build: Object.freeze({ command: "pnpm", args: Object.freeze(["build"] as const) }),
  verify: Object.freeze({ command: "pnpm", args: Object.freeze(["run", "verify"] as const) }),
  typecheck: Object.freeze({ command: "pnpm", args: Object.freeze(["run", "typecheck"] as const) }),
  lint: Object.freeze({ command: "pnpm", args: Object.freeze(["run", "lint"] as const) }),
  test: Object.freeze({ command: "pnpm", args: Object.freeze(["test"] as const) })
}) as Readonly<Record<MechanicalCommandName, MechanicalCommandBinding>>;

export type MechanicalCommandRefusalReason =
  | "not-in-capability-envelope"
  | "unknown-name";

export class MechanicalCommandRefusedError extends Error {
  public readonly reason: MechanicalCommandRefusalReason;
  public readonly commandName: string;
  constructor(reason: MechanicalCommandRefusalReason, commandName: string) {
    super(`mechanical command refused: ${reason} (${commandName})`);
    this.name = "MechanicalCommandRefusedError";
    this.reason = reason;
    this.commandName = commandName;
  }
}

export function isMechanicalCommandName(value: string): value is MechanicalCommandName {
  return (CLOSED_MECHANICAL_COMMAND_NAMES as readonly string[]).includes(value);
}

/**
 * Backward-compat helper for callers that still pass argv arrays. Returns
 * `null` if the argv doesn't match any known binding.
 *
 * Pitfall 4: prefer migrating callers to pass `name: MechanicalCommandName`
 * directly. This helper exists for short-term bridging only.
 */
export function inferMechanicalName(argv: readonly string[]): MechanicalCommandName | null {
  for (const name of CLOSED_MECHANICAL_COMMAND_NAMES) {
    const binding = MECHANICAL_COMMAND_BINDINGS[name];
    // Long form: ["pnpm","run","verify"] — exact match against bindings.
    if (argv.length === binding.args.length + 1 && argv[0] === binding.command) {
      let matches = true;
      for (let i = 0; i < binding.args.length; i++) {
        if (argv[i + 1] !== binding.args[i]) {
          matches = false;
          break;
        }
      }
      if (matches) return name;
    }
    // Legacy short form: ["pnpm","verify"] — used by review-loop.ts pre-12-06.
    if (argv.length === 2 && argv[0] === binding.command && argv[1] === name) {
      return name;
    }
  }
  return null;
}
