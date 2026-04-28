import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("DELIVER-07: repo-wide no-merge contract", () => {
  it("zero merge surfaces in any production source", async () => {
    const offenders = await findMergeSurfaceOffenders(REPO_ROOT);

    assert.deepEqual(
      offenders,
      [],
      `Merge surface(s) found in production source: ${JSON.stringify(offenders, null, 2)}`
    );
  });

  it("detects a synthetic production merge surface", async () => {
    const fixtureDir = resolve(REPO_ROOT, "packages", "admission-e2e", "src", "__no_merge_tmp__");
    const fixtureFile = resolve(fixtureDir, "synthetic-production.ts");
    await mkdir(fixtureDir, { recursive: true });

    try {
      await writeFile(fixtureFile, "export function unsafe(client: any) { return client.pulls.merge({}); }\n", "utf8");
      const offenders = await findMergeSurfaceOffenders(REPO_ROOT);

      assert.deepEqual(offenders, [
        {
          file: "packages/admission-e2e/src/__no_merge_tmp__/synthetic-production.ts",
          line: 1,
          pattern: "pulls\\.merge\\b"
        }
      ]);
    } finally {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  });

  it("does not scan the explicit no-merge contract allowlist", () => {
    assert.equal(ALLOWLIST_RELATIVE.has("packages/delivery-runtime/src/no-merge.contract.test.ts"), true);
    assert.equal(ALLOWLIST_RELATIVE.has("packages/admission-e2e/src/delivery-no-merge-repo-wide.contract.test.ts"), true);
  });
});
