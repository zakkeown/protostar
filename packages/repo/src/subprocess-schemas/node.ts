import type { CommandSchema } from "./git.js";

export const NODE_SCHEMA: CommandSchema = Object.freeze({
  command: "node",
  allowedSubcommands: Object.freeze([]),
  allowedFlags: Object.freeze({
    "": Object.freeze(["--test", "--enable-source-maps"])
  }),
  refValuePattern: /^[a-zA-Z0-9._/-]+$/
});
