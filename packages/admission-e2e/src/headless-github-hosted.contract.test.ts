import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..", "..");

describe("headless-github-hosted setup contract", () => {
  it("pins the GitHub-hosted docs and workflow shape", async () => {
    const docs = await readFile(resolve(REPO_ROOT, "docs", "headless", "github-hosted.md"), "utf8");
    const workflow = await readFile(resolve(REPO_ROOT, ".github", "workflows", "headless-stress.yml"), "utf8");

    assert.match(docs, /\.github\/workflows\/headless-stress\.yml/);
    assert.match(docs, /--headless-mode github-hosted --non-interactive/);
    assert.match(docs, /PROTOSTAR_HOSTED_LLM_API_KEY/);
    assert.match(docs, /GitHub Actions secret/);
    assert.match(docs, /events\.jsonl/);
    assert.match(workflow, /workflow_dispatch/);
    assert.match(workflow, /github-hosted/);
    assert.match(workflow, /PROTOSTAR_HOSTED_LLM_API_KEY:\s*\$\{\{\s*secrets\.PROTOSTAR_HOSTED_LLM_API_KEY\s*\}\}/);
  });
});
