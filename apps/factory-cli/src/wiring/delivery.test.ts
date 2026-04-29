import { strict as assert } from "node:assert";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";

describe("wiring/delivery.ts source-shape", () => {
  it("contains PROTOSTAR_GITHUB_TOKEN (the structural assertion of D-07)", async () => {
    // Walk up from the compiled test location to the package root, then to src/.
    // distDir = apps/factory-cli/dist/wiring → up 2 to package root, then src/wiring.
    const distDir = import.meta.dirname ?? __dirname;
    const pkgRoot = resolve(distDir, "..", "..");
    const here = resolve(pkgRoot, "src", "wiring", "delivery.ts");
    const src = await readFile(here, "utf8");
    assert.match(src, /PROTOSTAR_GITHUB_TOKEN/);
  });

  it("buildAuthorizationPayload mints schemaVersion 1.0.0 and a mintedAt timestamp", async () => {
    const { buildAuthorizationPayload } = await import("./delivery.js");
    const before = Date.now();
    const payload = buildAuthorizationPayload({
      runId: "run-1",
      decisionPath: "/runs/run-1/review/decision.json",
      target: { owner: "o", repo: "r", baseBranch: "main" },
      branchName: "factory/run-1",
      title: "test",
      body: "test body",
      headSha: "abc",
      baseSha: "def"
    });
    const after = Date.now();
    assert.equal(payload.schemaVersion, "1.0.0");
    const minted = Date.parse(payload.mintedAt);
    assert.ok(minted >= before && minted <= after);
  });
});
