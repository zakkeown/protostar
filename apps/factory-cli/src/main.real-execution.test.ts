import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { parseCliArgs } from "./cli-args.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const mainSourcePath = resolve(repoRoot, "apps/factory-cli/src/main.ts");
const runCommandSourcePath = resolve(repoRoot, "apps/factory-cli/src/commands/run.ts");

describe("factory-cli real executor integration", () => {
  it("parses --executor real and --allowed-adapters", () => {
    const parsed = parseCliArgs([
      "run",
      "--draft",
      "draft.json",
      "--out",
      "out",
      "--executor",
      "real",
      "--allowed-adapters",
      "lmstudio-coder,second-adapter"
    ]);

    assert.equal(parsed.executor, "real");
    assert.equal(parsed.allowedAdapters, "lmstudio-coder,second-adapter");
  });

  it("keeps dry-run as the documented default executor branch", async () => {
    const mainSource = await readFile(mainSourcePath, "utf8");
    const runCommandSource = await readFile(runCommandSourcePath, "utf8");

    assert.match(mainSource, /\(options\.executor \?\? "dry-run"\) === "real"/);
    assert.match(runCommandSource, /executor: executor\.value/);
  });

  it("wires the real executor through LM Studio admission, adapter, repo reader, and journal", async () => {
    const source = await readFile(mainSourcePath, "utf8");

    for (const needle of [
      "createLmstudioCoderAdapter",
      "coderAdapterReadyAdmission",
      "runRealExecution",
      "createFsRepoReader",
      "createJournalWriter",
      "installCancelWiring"
    ]) {
      assert.notEqual(source.indexOf(needle), -1, `missing ${needle}`);
    }
  });

  it("merges partial repair execution results instead of replacing untouched tasks", async () => {
    const source = await readFile(mainSourcePath, "utf8");

    assert.match(source, /mergeRepairExecutionResult/);
    assert.match(source, /mergeRepairDryRunResult/);
    assert.match(source, /repairedTaskIds\.has\(task\.planTaskId\) \? \(repairedByTask\.get\(task\.planTaskId\) \?\? task\) : task/);
  });

  it("records factoryConfigHash in the policy snapshot evidence", async () => {
    const source = await readFile(mainSourcePath, "utf8");

    assert.match(source, /factoryConfigHash: factoryConfig\.configHash/);
  });

  it("writes delivery authorization payloads before gated or auto delivery", async () => {
    const source = await readFile(mainSourcePath, "utf8");
    const runCommandSource = await readFile(runCommandSourcePath, "utf8");

    assert.match(source, /AuthorizationPayload/);
    assert.match(source, /authorization\.json/);
    assert.match(source, /gated: run `protostar-factory deliver \$\{runId\}` to push\./);
    assert.match(source, /resolveDeliveryMode/);
    assert.match(runCommandSource, /delivery-mode/);
  });
});
