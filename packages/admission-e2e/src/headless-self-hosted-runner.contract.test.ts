import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("headless-self-hosted-runner setup contract", () => {
  it("pins trusted single-tenant runner setup and cleanup requirements", async () => {
    const docs = await readFile(resolve(REPO_ROOT, "docs", "headless", "self-hosted-runner.md"), "utf8");

    assert.match(docs, /--headless-mode self-hosted-runner --non-interactive/);
    assert.match(docs, /single-tenant/);
    assert.match(docs, /trusted/);
    assert.match(docs, /LM Studio|local backend/);
    assert.match(docs, /protostar-factory prune --older-than 14d/);
    assert.match(docs, /No API keys, model credentials, GitHub tokens, or runner secrets may be checked in/);
  });
});
