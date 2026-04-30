import type { CommandSchema } from "./git.js";
import { ArgvViolation } from "../argv-pattern-guard.js";
import { PNPM_ADD_ALLOWLIST, formatPnpmAddAllowlistSpec } from "../pnpm-add-allowlist.js";

const PNPM_ALLOWED_FLAGS: CommandSchema["allowedFlags"] = Object.freeze({
  "": Object.freeze(["-r"]),
  install: Object.freeze(["--frozen-lockfile", "--no-frozen-lockfile", "--force", "--ignore-workspace"]),
  run: Object.freeze([]),
  build: Object.freeze([]),
  test: Object.freeze([]),
  "--filter": Object.freeze([]),
  exec: Object.freeze(["--"]),
  add: Object.freeze(["-D"])
});

export const PNPM_SCHEMA: CommandSchema = Object.freeze({
  command: "pnpm",
  allowedSubcommands: Object.freeze([
    "-r",
    "install",
    "run",
    "build",
    "test",
    "--filter",
    "exec",
    "add"
  ]),
  allowedFlags: PNPM_ALLOWED_FLAGS,
  refValuePattern: /^[a-zA-Z0-9._/@^-]+$/,
  validateArgv: validatePnpmArgv
});

function validatePnpmArgv(argv: readonly string[]): void {
  const subcommand = argv[0];
  if (subcommand === undefined) {
    return;
  }

  if (subcommand === "-r") {
    validatePnpmRecursiveArgv(argv);
    return;
  }

  if (!PNPM_SCHEMA.allowedSubcommands.includes(subcommand)) {
    throw new ArgvViolation(
      "ref-pattern-violation",
      `subcommand "${subcommand}" is not allowed for command "pnpm"`
    );
  }

  if (subcommand === "add") {
    validatePnpmAddArgv(argv);
    return;
  }

  validatePnpmSubcommandFlags(argv, subcommand);
}

function validatePnpmRecursiveArgv(argv: readonly string[]): void {
  if (argv.length !== 2 || argv[1] !== "test") {
    throw new ArgvViolation("ref-pattern-violation", "pnpm -r accepts only the closed test binding");
  }
}

function validatePnpmSubcommandFlags(argv: readonly string[], subcommand: string): void {
  const allowedFlags = PNPM_ALLOWED_FLAGS[subcommand as keyof typeof PNPM_ALLOWED_FLAGS] ?? [];
  for (const arg of argv.slice(1)) {
    if (arg.startsWith("-") && arg !== "--" && !allowedFlags.includes(arg)) {
      throw new ArgvViolation("flag-not-allowed", `flag "${arg}" is not allowed for pnpm ${subcommand}`);
    }
  }
}

function validatePnpmAddArgv(argv: readonly string[]): void {
  const addSpec = argv[1];
  const devFlag = argv[2];

  if (addSpec === undefined) {
    throw new ArgvViolation("ref-pattern-violation", "pnpm add requires an allowlisted package spec");
  }
  if (argv.length > 3 || (devFlag !== undefined && devFlag !== "-D")) {
    throw new ArgvViolation("flag-not-allowed", "pnpm add accepts only an optional -D flag");
  }

  const parsed = parsePackageSpec(addSpec);
  if (parsed === undefined) {
    throw new ArgvViolation(
      "ref-pattern-violation",
      `pnpm add spec "${addSpec}" must include an exact allowlisted name and version range`
    );
  }

  const requestedDev = devFlag === "-D";
  const allowed = PNPM_ADD_ALLOWLIST.some(
    (entry) =>
      entry.name === parsed.name &&
      entry.spec === parsed.spec &&
      entry.dev === requestedDev &&
      formatPnpmAddAllowlistSpec(entry) === addSpec
  );
  if (!allowed) {
    throw new ArgvViolation(
      "ref-pattern-violation",
      `pnpm add spec "${addSpec}${requestedDev ? " -D" : ""}" is not in PNPM_ADD_ALLOWLIST`
    );
  }
}

function parsePackageSpec(value: string): { readonly name: string; readonly spec: string } | undefined {
  const separator = value.lastIndexOf("@");
  if (separator <= 0 || separator === value.length - 1) {
    return undefined;
  }

  return {
    name: value.slice(0, separator),
    spec: value.slice(separator + 1)
  };
}
