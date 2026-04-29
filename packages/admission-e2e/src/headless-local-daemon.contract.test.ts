import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("headless-local-daemon setup contract", () => {
  it("pins local-daemon docs and sample-only launchd artifact", async () => {
    const docs = await readFile(resolve(REPO_ROOT, "docs", "headless", "local-daemon.md"), "utf8");
    const plist = await readFile(resolve(REPO_ROOT, "scripts", "protostar-local-daemon.launchd.plist"), "utf8");

    assert.match(docs, /scripts\/protostar-local-daemon\.launchd\.plist/);
    assert.match(docs, /--headless-mode local-daemon --non-interactive/);
    assert.match(docs, /sample configuration only|sample plist/i);
    assert.match(plist, /sample-only configuration/i);
    assert.match(plist, /--headless-mode/);
    assert.match(plist, /local-daemon/);
    assert.match(plist, /--non-interactive/);
  });
});
