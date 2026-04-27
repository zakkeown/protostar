import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { installCancelWiring } from "./cancel.js";

describe("installCancelWiring", () => {
  it("registers one SIGINT listener and dispose removes it", async () => {
    const baseline = process.listeners("SIGINT").length;
    const wiring = installCancelWiring({ runDir: await mkdtemp(join(tmpdir(), "cancel-")) });

    assert.equal(process.listeners("SIGINT").length, baseline + 1);
    wiring.dispose();
    assert.equal(process.listeners("SIGINT").length, baseline);
  });

  it("does nothing when the CANCEL sentinel is absent", async () => {
    const wiring = installCancelWiring({ runDir: await mkdtemp(join(tmpdir(), "cancel-")) });
    try {
      await wiring.checkSentinelBetweenTasks();
      assert.equal(wiring.rootController.signal.aborted, false);
    } finally {
      wiring.dispose();
    }
  });

  it("aborts with sentinel when the CANCEL file exists", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "cancel-"));
    await writeFile(join(runDir, "CANCEL"), "");
    const wiring = installCancelWiring({ runDir });
    try {
      await wiring.checkSentinelBetweenTasks();
      assert.equal(wiring.rootController.signal.aborted, true);
      assert.equal(wiring.rootController.signal.reason, "sentinel");
    } finally {
      wiring.dispose();
    }
  });

  it("unlinks a stale CANCEL file before resume checks", async () => {
    const runDir = await mkdtemp(join(tmpdir(), "cancel-"));
    await writeFile(join(runDir, "CANCEL"), "");
    const wiring = installCancelWiring({ runDir });
    try {
      await wiring.unlinkSentinelOnResume();
      await wiring.checkSentinelBetweenTasks();
      assert.equal(wiring.rootController.signal.aborted, false);
    } finally {
      wiring.dispose();
    }
  });
});
