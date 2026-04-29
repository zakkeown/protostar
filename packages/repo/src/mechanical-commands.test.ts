import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  CLOSED_MECHANICAL_COMMAND_NAMES,
  MECHANICAL_COMMAND_BINDINGS,
  MechanicalCommandRefusedError,
  inferMechanicalName,
  isMechanicalCommandName
} from "./mechanical-commands.js";

describe("mechanical-commands closed allowlist", () => {
  it("CLOSED_MECHANICAL_COMMAND_NAMES is the frozen 4-name tuple", () => {
    assert.deepEqual([...CLOSED_MECHANICAL_COMMAND_NAMES], [
      "verify",
      "typecheck",
      "lint",
      "test"
    ]);
    assert.equal(Object.isFrozen(CLOSED_MECHANICAL_COMMAND_NAMES), true);
  });

  it("MECHANICAL_COMMAND_BINDINGS.verify resolves to pnpm run verify (frozen)", () => {
    const verify = MECHANICAL_COMMAND_BINDINGS["verify"];
    assert.equal(verify.command, "pnpm");
    assert.deepEqual([...verify.args], ["run", "verify"]);
    assert.equal(Object.isFrozen(verify), true);
    assert.equal(Object.isFrozen(verify.args), true);
  });

  it("MECHANICAL_COMMAND_BINDINGS.test resolves to pnpm -r test", () => {
    const t = MECHANICAL_COMMAND_BINDINGS["test"];
    assert.equal(t.command, "pnpm");
    assert.deepEqual([...t.args], ["-r", "test"]);
  });

  it("MECHANICAL_COMMAND_BINDINGS contains exactly the closed allowlist names", () => {
    const keys = Object.keys(MECHANICAL_COMMAND_BINDINGS).sort();
    const names = [...CLOSED_MECHANICAL_COMMAND_NAMES].sort();
    assert.deepEqual(keys, names);
  });

  it("isMechanicalCommandName narrows known names and rejects unknown", () => {
    assert.equal(isMechanicalCommandName("verify"), true);
    assert.equal(isMechanicalCommandName("test"), true);
    assert.equal(isMechanicalCommandName("danger"), false);
    assert.equal(isMechanicalCommandName(""), false);
  });
});

describe("inferMechanicalName", () => {
  it("recovers verify from long-form pnpm run verify", () => {
    assert.equal(inferMechanicalName(["pnpm", "run", "verify"]), "verify");
  });

  it("recovers verify from legacy short-form pnpm verify", () => {
    assert.equal(inferMechanicalName(["pnpm", "verify"]), "verify");
  });

  it("recovers test from pnpm -r test", () => {
    assert.equal(inferMechanicalName(["pnpm", "-r", "test"]), "test");
  });

  it("recovers lint from pnpm lint", () => {
    assert.equal(inferMechanicalName(["pnpm", "lint"]), "lint");
  });

  it("returns null for unknown argv shapes", () => {
    assert.equal(inferMechanicalName(["echo", "danger"]), null);
    assert.equal(inferMechanicalName(["pnpm", "run", "danger"]), null);
    assert.equal(inferMechanicalName([]), null);
  });
});

describe("MechanicalCommandRefusedError", () => {
  it("carries reason and commandName", () => {
    const err = new MechanicalCommandRefusedError("not-in-capability-envelope", "verify");
    assert.equal(err.reason, "not-in-capability-envelope");
    assert.equal(err.commandName, "verify");
    assert.equal(err.name, "MechanicalCommandRefusedError");
    assert.match(err.message, /not-in-capability-envelope/);
    assert.match(err.message, /verify/);
  });
});
