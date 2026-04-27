import type { CommandSchema } from "./git.js";

export const PNPM_SCHEMA: CommandSchema = Object.freeze({
  command: "pnpm",
  allowedSubcommands: Object.freeze([
    "install",
    "run",
    "build",
    "test",
    "--filter",
    "exec"
  ]),
  allowedFlags: Object.freeze({
    install: Object.freeze(["--frozen-lockfile", "--no-frozen-lockfile", "--force"]),
    run: Object.freeze([]),
    build: Object.freeze([]),
    test: Object.freeze([]),
    "--filter": Object.freeze([]),
    exec: Object.freeze(["--"])
  }),
  refValuePattern: /^[a-zA-Z0-9._/-@]+$/
});
