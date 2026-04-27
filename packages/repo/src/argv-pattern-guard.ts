const SHELL_METACHARS = /[;&|`$<>\\\s]/;

export type ArgvViolationReason =
  | "flag-not-allowed"
  | "ref-pattern-violation"
  | "shell-metachar";

export class ArgvViolation extends Error {
  constructor(
    public readonly reason: ArgvViolationReason,
    message: string
  ) {
    super(message);
    this.name = "ArgvViolation";
  }
}

export interface OuterGuardSchema {
  readonly allowedFlagPrefixes: readonly string[];
  readonly refValuePattern: RegExp;
  readonly requireSeparatorBeforePositionals?: boolean;
}

export function applyOuterPatternGuard(argv: readonly string[], schema: OuterGuardSchema): void {
  let sawSeparator = false;
  for (const arg of argv) {
    if (SHELL_METACHARS.test(arg)) {
      throw new ArgvViolation("shell-metachar", `arg "${arg}" contains shell metacharacter or whitespace`);
    }

    if (arg === "--") {
      sawSeparator = true;
      continue;
    }

    if (!sawSeparator && arg.startsWith("-")) {
      const flagBody = arg.split("=")[0] ?? arg;
      if (!schema.allowedFlagPrefixes.includes(arg) && !schema.allowedFlagPrefixes.includes(flagBody)) {
        throw new ArgvViolation("flag-not-allowed", `flag "${flagBody}" not in allowedFlagPrefixes`);
      }
      continue;
    }

    if (schema.requireSeparatorBeforePositionals === true && !sawSeparator) {
      throw new ArgvViolation("flag-not-allowed", `arg "${arg}" must appear after -- separator`);
    }

    if (!schema.refValuePattern.test(arg)) {
      throw new ArgvViolation("ref-pattern-violation", `arg "${arg}" does not match refValuePattern`);
    }
  }
}
