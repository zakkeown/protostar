import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { describe, it } from "node:test";

import { buildAuthorizedSubprocessOpForTest } from "@protostar/authority/internal/test-builders";
import {
  intersectAllowlist,
  NODE_SCHEMA,
  runCommand,
  SubprocessRefusedError,
  type AuthorizedSubprocessOp,
  type RunCommandOptions
} from "@protostar/repo";
import { buildSacrificialRepo } from "@protostar/repo/internal/test-fixtures";

import {
  assertRepoRuntimeDecisionShape,
  buildRepoRuntimeAdmissionDecision
} from "./_helpers/repo-runtime-evidence.js";

describe("repo-runtime subprocess allowlist refusal contract", () => {
  it("pins command-not-allowlisted and argv-violation refusal evidence", async (t) => {
    const repo = await buildSacrificialRepo();
    t.after(() => rm(repo.dir, { recursive: true, force: true }));
    const options: RunCommandOptions = {
      stdoutPath: `${repo.dir}/logs/stdout.log`,
      stderrPath: `${repo.dir}/logs/stderr.log`,
      effectiveAllowlist: intersectAllowlist(),
      schemas: { node: NODE_SCHEMA },
      inheritEnv: []
    };

    const cargoRefusal = await expectSubprocessRefusal(
      buildAuthorizedSubprocessOpForTest({
        command: "cargo",
        args: ["build"],
        cwd: repo.dir
      }),
      options
    );
    const argvRefusal = await expectSubprocessRefusal(
      buildAuthorizedSubprocessOpForTest({
        command: "node",
        args: ["--upload-pack=evil"],
        cwd: repo.dir
      }),
      options
    );
    const subprocessRecords = [
      refusalRecord("cargo", ["build"], cargoRefusal),
      refusalRecord("node", ["--upload-pack=evil"], argvRefusal)
    ];
    const decision = buildRepoRuntimeAdmissionDecision({
      workspaceRoot: repo.dir,
      auth: { mode: "anonymous" },
      effectiveAllowlist: options.effectiveAllowlist,
      patchResults: [],
      subprocessRecords
    });

    assert.equal(cargoRefusal.reason, "command-not-allowlisted");
    assert.equal(argvRefusal.reason, "argv-violation");
    assert.deepEqual(decision.evidence.subprocessRecords, subprocessRecords);
    assertRepoRuntimeDecisionShape(decision);
  });
});

async function expectSubprocessRefusal(
  op: AuthorizedSubprocessOp,
  options: RunCommandOptions
): Promise<SubprocessRefusedError> {
  try {
    await runCommand(op, options);
  } catch (error) {
    assert.ok(error instanceof SubprocessRefusedError);
    return error;
  }

  assert.fail(`expected ${op.command} to be refused before spawn`);
}

function refusalRecord(command: string, argv: readonly string[], error: SubprocessRefusedError) {
  return Object.freeze({
    command,
    argv: Object.freeze([...argv]),
    refused: true,
    reason: error.reason,
    message: error.message
  });
}
