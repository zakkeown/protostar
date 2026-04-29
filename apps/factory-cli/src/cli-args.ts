import { MAX_EVOLUTION_GENERATIONS } from "@protostar/evaluation";
import type { HeadlessMode } from "@protostar/lmstudio-adapter";

export type TrustLevel = "untrusted" | "trusted";

export const TRUST_LEVELS: readonly TrustLevel[] = Object.freeze(["untrusted", "trusted"]);

export type PileMode = "fixture" | "live";

export const PILE_MODES: readonly PileMode[] = Object.freeze(["fixture", "live"]);

export const HEADLESS_MODES: readonly HeadlessMode[] = Object.freeze([
  "github-hosted",
  "self-hosted-runner",
  "local-daemon"
]);

export interface ParsedCliArgs {
  readonly trust: TrustLevel;
  readonly confirmedIntent?: string;
  readonly intent?: string;
  readonly intentDraft?: string;
  readonly draft?: string;
  readonly out?: string;
  readonly confirmedIntentOutput?: string;
  readonly intentOutput?: string;
  readonly planningFixture?: string;
  readonly failTaskIds?: string;
  readonly intentMode?: string;
  readonly runId?: string;
  readonly executor?: string;
  readonly allowedAdapters?: string;
  // Phase 6 Plan 06-07 Task 1 — pile-mode CLI overrides (Q-04).
  readonly planningMode?: PileMode;
  readonly reviewMode?: PileMode;
  readonly execCoordMode?: PileMode;
  readonly lineage?: string;
  readonly evolveCode?: boolean;
  readonly generation?: number;
  readonly semanticJudgeModel?: string;
  readonly consensusJudgeModel?: string;
  readonly headlessMode?: HeadlessMode;
  readonly nonInteractive?: boolean;
}

const FLAG_NAMES = new Set([
  "--consensus-judge-model",
  "--confirmed-intent",
  "--confirmed-intent-output",
  "--draft",
  "--evolve-code",
  "--allowed-adapters",
  "--exec-coord-mode",
  "--executor",
  "--fail-task-ids",
  "--generation",
  "--headless-mode",
  "--intent",
  "--intent-draft",
  "--intent-mode",
  "--intent-output",
  "--lineage",
  "--out",
  "--planning-fixture",
  "--planning-mode",
  "--review-mode",
  "--run-id",
  "--semantic-judge-model",
  "--non-interactive",
  "--trust"
]);

const PILE_MODE_FLAGS = new Set(["--planning-mode", "--review-mode", "--exec-coord-mode"]);
const BOOLEAN_FLAGS = new Set(["--evolve-code", "--non-interactive"]);

export class ArgvError extends Error {
  constructor(
    public readonly flag: string,
    public readonly reason: string
  ) {
    super(`argv error on "${flag}": ${reason}`);
  }
}

export function parseCliArgs(argv: readonly string[]): ParsedCliArgs {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  const flags: WritableParsedCliArgs = {};
  let trust: TrustLevel = "untrusted";
  let startIndex = 0;

  if (args[0] !== undefined && !args[0].startsWith("--")) {
    if (args[0] !== "run") {
      throw new ArgvError(args[0], "unexpected positional argument");
    }
    startIndex = 1;
  }

  for (let index = startIndex; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) {
      continue;
    }
    if (!arg.startsWith("--")) {
      throw new ArgvError(arg, "unexpected positional argument");
    }

    const { flag, value: inlineValue } = splitInlineFlag(arg);
    if (!FLAG_NAMES.has(flag)) {
      throw new ArgvError(flag, "unknown flag");
    }

    if (BOOLEAN_FLAGS.has(flag)) {
      if (inlineValue !== undefined) {
        throw new ArgvError(flag, "does not accept a value");
      }
      setFlag(flags, flagName(flag), true);
      continue;
    }

    const value = inlineValue ?? args[index + 1];
    if (value === undefined || value.startsWith("--") || value.length === 0) {
      throw new ArgvError(flag, "expected a value");
    }
    if (inlineValue === undefined) {
      index += 1;
    }

    if (flag === "--trust") {
      if (value !== "untrusted" && value !== "trusted") {
        throw new ArgvError("--trust", `expected one of ${TRUST_LEVELS.join("|")}, got "${value}"`);
      }
      trust = value;
      continue;
    }

    if (PILE_MODE_FLAGS.has(flag)) {
      if (value !== "fixture" && value !== "live") {
        throw new ArgvError(flag, `expected one of ${PILE_MODES.join("|")}, got "${value}"`);
      }
    }

    if (flag === "--headless-mode") {
      if (!isHeadlessMode(value)) {
        throw new ArgvError(flag, `expected one of ${HEADLESS_MODES.join("|")}, got "${value}"`);
      }
      setFlag(flags, "headlessMode", value);
      continue;
    }

    if (flag === "--generation") {
      setFlag(flags, "generation", parseGenerationArg(value));
      continue;
    }

    setFlag(flags, flagName(flag), value);
  }

  return {
    trust,
    ...flags
  };
}

function splitInlineFlag(arg: string): { readonly flag: string; readonly value?: string } {
  const equalsIndex = arg.indexOf("=");
  if (equalsIndex === -1) {
    return { flag: arg };
  }

  return {
    flag: arg.slice(0, equalsIndex),
    value: arg.slice(equalsIndex + 1)
  };
}

function flagName(flag: string): keyof ParsedCliArgs {
  return flag.slice(2).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()) as keyof ParsedCliArgs;
}

function isHeadlessMode(value: string): value is HeadlessMode {
  return (HEADLESS_MODES as readonly string[]).includes(value);
}

type WritableParsedCliArgs = {
  -readonly [K in keyof ParsedCliArgs]?: ParsedCliArgs[K];
};

export function parseGenerationArg(value: string): number {
  const generation = Number(value);
  if (!Number.isInteger(generation) || generation < 0) {
    throw new ArgvError("--generation", `expected an integer >= 0 and <= ${MAX_EVOLUTION_GENERATIONS}, got "${value}"`);
  }
  if (generation > MAX_EVOLUTION_GENERATIONS) {
    throw new ArgvError("--generation", `expected <= ${MAX_EVOLUTION_GENERATIONS}, got "${value}"`);
  }
  return generation;
}

function setFlag(
  flags: WritableParsedCliArgs,
  name: keyof ParsedCliArgs,
  value: string | number | boolean
): void {
  flags[name] = value as never;
}
