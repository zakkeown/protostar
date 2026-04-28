import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import type { OntologySnapshot } from "@protostar/evaluation";

import { writeEvolutionSnapshot } from "./evolution-snapshot-writer.js";

describe("writeEvolutionSnapshot", () => {
  it("writes snapshot.json under the run evolution directory", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "evolution-snapshot-"));
    const snapshot: OntologySnapshot = {
      generation: 2,
      fields: [{ name: "ac_1", type: "test", description: "Build succeeds" }]
    };

    const result = await writeEvolutionSnapshot({ runDir, snapshot, lineageId: "lineage-1" });
    const body = JSON.parse(await readFile(result.snapshotPath, "utf8"));

    assert.equal(result.snapshotPath, join(runDir, "evolution", "snapshot.json"));
    assert.deepEqual(body, { ...snapshot, lineageId: "lineage-1" });
  });

  it("creates the parent directory and leaves no tmp file behind", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "evolution-snapshot-"));

    const result = await writeEvolutionSnapshot({
      runDir,
      lineageId: "lineage-1",
      snapshot: { generation: 0, fields: [] }
    });

    assert.equal((await stat(join(runDir, "evolution"))).isDirectory(), true);
    await assert.rejects(() => stat(`${result.snapshotPath}.tmp`), /ENOENT/);
  });
});
