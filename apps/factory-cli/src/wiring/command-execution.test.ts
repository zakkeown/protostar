import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { MechanicalCommandRefusedError } from "@protostar/repo";

import { createMechanicalSubprocessRunner } from "./command-execution.js";

describe("createMechanicalSubprocessRunner", () => {
  it("refuses commands not in the capability envelope's mechanical.allowed", async () => {
    const runner = createMechanicalSubprocessRunner({
      runDir: "/tmp/run-1",
      resolvedEnvelope: {},
      allowedMechanicalCommands: ["verify"],
      effectiveAllowlist: ["pnpm"],
      schemas: {}
    });
    await assert.rejects(
      runner.runCommand({
        name: "test",
        cwd: "/workspace",
        signal: new AbortController().signal,
        timeoutMs: 1000
      }),
      (err: unknown) => {
        if (!(err instanceof MechanicalCommandRefusedError)) return false;
        return err.reason === "not-in-capability-envelope" && err.commandName === "test";
      }
    );
  });
});
