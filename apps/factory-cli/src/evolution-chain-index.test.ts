import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  appendChainLine,
  chainIndexPath,
  readChainLines,
  readLatestChainLine,
  type ChainIndexLine
} from "./evolution-chain-index.js";

function line(generation: number): ChainIndexLine {
  return {
    generation,
    runId: `run-${generation}`,
    lineageId: "lineage-1",
    snapshotPath: `/runs/run-${generation}/evolution/snapshot.json`,
    timestamp: `2026-04-28T00:00:0${generation}Z`
  };
}

describe("evolution chain index", () => {
  it("returns undefined for missing and empty files", async () => {
    const root = await mkdtemp(join(tmpdir(), "evolution-chain-"));
    const filePath = join(root, "missing.jsonl");

    assert.equal(await readLatestChainLine(filePath), undefined);

    await writeFile(filePath, "", "utf8");
    assert.equal(await readLatestChainLine(filePath), undefined);
  });

  it("reads the latest line from a one-line or three-line chain", async () => {
    const root = await mkdtemp(join(tmpdir(), "evolution-chain-"));
    const filePath = join(root, "chain.jsonl");

    await writeFile(filePath, `${JSON.stringify(line(0))}\n`, "utf8");
    assert.deepEqual(await readLatestChainLine(filePath), line(0));

    await writeFile(filePath, [line(0), line(1), line(2)].map((entry) => JSON.stringify(entry)).join("\n"), "utf8");
    assert.deepEqual(await readLatestChainLine(filePath), line(2));
  });

  it("appends JSONL chain lines in order", async () => {
    const root = await mkdtemp(join(tmpdir(), "evolution-chain-"));
    const filePath = join(root, ".protostar", "evolution", "lineage-1.jsonl");

    await appendChainLine(filePath, line(0));
    await appendChainLine(filePath, line(1));
    await appendChainLine(filePath, line(2));

    const lines = (await readFile(filePath, "utf8")).trim().split("\n").map((raw) => JSON.parse(raw));
    assert.deepEqual(lines, [line(0), line(1), line(2)]);
  });

  it("builds lineage paths and rejects traversal-shaped lineage ids", () => {
    const root = "/workspace";

    assert.equal(chainIndexPath("lineage_1.2-3", root), join(root, ".protostar", "evolution", "lineage_1.2-3.jsonl"));
    assert.throws(() => chainIndexPath("..", root), /lineageId/);
    assert.throws(() => chainIndexPath("../escape", root), /lineageId/);
    assert.throws(() => chainIndexPath("/etc/passwd", root), /lineageId/);
  });

  it("reads all valid chain lines and skips malformed entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "evolution-chain-"));
    const filePath = join(root, "chain.jsonl");
    await writeFile(filePath, `${JSON.stringify(line(0))}\nnot-json\n${JSON.stringify(line(2))}\n`, "utf8");

    assert.deepEqual(await readChainLines(filePath), [line(0), line(2)]);
  });
});
