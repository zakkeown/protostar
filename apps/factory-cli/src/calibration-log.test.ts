import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { appendCalibrationEntry } from "./calibration-log.js";

describe("appendCalibrationEntry", () => {
  it("writes one JSONL line and creates the parent directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "calibration-log-"));
    const filePath = join(root, ".protostar", "calibration", "ontology-similarity.jsonl");

    await appendCalibrationEntry(filePath, {
      runId: "run-1",
      lineageId: "lineage-1",
      generation: 1,
      similarity: 0.92,
      threshold: 0.95,
      evolutionAction: "continue",
      timestamp: "2026-04-28T00:00:00Z"
    });

    assert.equal((await stat(join(root, ".protostar", "calibration"))).isDirectory(), true);
    assert.deepEqual(JSON.parse((await readFile(filePath, "utf8")).trim()), {
      runId: "run-1",
      lineageId: "lineage-1",
      generation: 1,
      similarity: 0.92,
      threshold: 0.95,
      evolutionAction: "continue",
      timestamp: "2026-04-28T00:00:00Z"
    });
  });
});
