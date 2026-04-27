export interface CommandSchema {
  readonly command: string;
  readonly allowedSubcommands: readonly string[];
  readonly allowedFlags: Readonly<Record<string, readonly string[]>>;
  readonly refValuePattern: RegExp;
}

export const GIT_SCHEMA: CommandSchema = Object.freeze({
  command: "git",
  allowedSubcommands: Object.freeze([
    "clone",
    "checkout",
    "branch",
    "status",
    "rev-parse",
    "log"
  ]),
  allowedFlags: Object.freeze({
    clone: Object.freeze(["--depth", "--single-branch", "--branch", "--no-tags"]),
    checkout: Object.freeze(["-b", "--detach"]),
    branch: Object.freeze(["--list", "-D"]),
    status: Object.freeze(["--porcelain", "--untracked-files=no"]),
    "rev-parse": Object.freeze(["--show-toplevel", "--abbrev-ref"]),
    log: Object.freeze(["--oneline", "-n"])
  }),
  refValuePattern: /^[a-zA-Z0-9._/-]+$/
});
