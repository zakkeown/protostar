export type TrustLevel = "untrusted" | "trusted";

export const TRUST_LEVELS: readonly TrustLevel[] = Object.freeze(["untrusted", "trusted"]);

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
}

const FLAG_NAMES = new Set([
  "--confirmed-intent",
  "--confirmed-intent-output",
  "--draft",
  "--allowed-adapters",
  "--executor",
  "--fail-task-ids",
  "--intent",
  "--intent-draft",
  "--intent-mode",
  "--intent-output",
  "--out",
  "--planning-fixture",
  "--run-id",
  "--trust"
]);

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

type WritableParsedCliArgs = {
  -readonly [K in keyof ParsedCliArgs]?: ParsedCliArgs[K];
};

function setFlag(flags: WritableParsedCliArgs, name: keyof ParsedCliArgs, value: string): void {
  flags[name] = value as never;
}
