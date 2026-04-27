import type { CommandSchema } from "./git.js";

export const TSC_SCHEMA: CommandSchema = Object.freeze({
  command: "tsc",
  allowedSubcommands: Object.freeze([]),
  allowedFlags: Object.freeze({
    "": Object.freeze(["-b", "--build", "--noEmit", "--pretty"])
  }),
  refValuePattern: /^[a-zA-Z0-9._/-]+$/
});
