import { strict as assert } from "node:assert";
import { after, before, describe, it } from "node:test";

import type { BranchName, PrBody, PrTitle } from "@protostar/delivery";
import { mintDeliveryAuthorization } from "@protostar/review";
import nock from "nock";

import { buildOctokit } from "./octokit-client.js";
import { executeDelivery, type DeliveryExecutionPlan, type DeliveryRunContext } from "./execute-delivery.js";
import {
  __resetPushBranchDependenciesForTests,
  __setPushBranchDependenciesForTests
} from "./push-branch.js";

const FAKE_TOKEN = "ghp_FAKETESTTOKENFOR0070008TEST123456ABCD";
const branch = "protostar/cosmetic-tweak/run-abc123" as BranchName;
const target = { owner: "octo", repo: "repo", baseBranch: "main" };
const authorization = mintDeliveryAuthorization({ runId: "run_123", decisionPath: "runs/run_123/review/decision.json" });

describe("executeDelivery secret-leak contract", () => {
  before(() => nock.disableNetConnect());
  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    __resetPushBranchDependenciesForTests();
  });

  it("does not leak a PAT-shaped token into returned outcome JSON or runDir artifacts", async (t) => {
    const { mkdtemp, rm, writeFile } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const runDir = await mkdtemp(join(tmpdir(), "protostar-delivery-secret-"));
    t.after(async () => {
      await rm(runDir, { recursive: true, force: true });
    });

    mockPushSuccess(t);
    nock("https://api.github.com", {
      reqheaders: { authorization: `Bearer ${FAKE_TOKEN}` }
    })
      .get("/repos/octo/repo/pulls")
      .query(true)
      .reply(500, { message: `backend echoed ${FAKE_TOKEN}` });

    const outcome = await executeDelivery(authorization, plan(), ctx());
    const serializedOutcome = JSON.stringify(outcome);

    assert.equal(serializedOutcome.includes(FAKE_TOKEN), false);

    await writeFile(join(runDir, "delivery-result.json"), serializedOutcome, "utf8");
    const matches = await walkAndGrep(runDir, FAKE_TOKEN);

    assert.deepEqual(matches, []);
  });
});

export async function walkAndGrep(dir: string, needle: string): Promise<readonly string[]> {
  const { readFile, readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const matches: string[] = [];
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    const parent = "parentPath" in entry && typeof entry.parentPath === "string" ? entry.parentPath : dir;
    const path = join(parent, entry.name);
    const content = await readFile(path, "utf8");
    if (content.includes(needle)) {
      matches.push(path);
    }
  }

  return matches;
}

function plan(): DeliveryExecutionPlan {
  return {
    branch,
    title: "Protostar delivery" as PrTitle,
    body: "Delivery body" as PrBody,
    target,
    artifacts: [],
    evidenceComments: []
  };
}

function ctx(): DeliveryRunContext {
  return {
    runId: "run_123",
    token: FAKE_TOKEN,
    signal: new AbortController().signal,
    fs: {},
    octokit: buildOctokit(FAKE_TOKEN),
    remoteUrl: "https://github.com/octo/repo.git",
    workspaceDir: "/workspace",
    expectedRemoteSha: null
  };
}

function mockPushSuccess(t: { after: (fn: () => void) => void }): void {
  __setPushBranchDependenciesForTests({
    fetch: async () => {
      const error = new Error("not found");
      Object.assign(error, { code: "NotFoundError" });
      throw error;
    },
    push: async () => ({ ok: true, error: null, refs: { [`refs/heads/${branch}`]: { ok: true, error: "" } } }),
    resolveRef: async () => "head-sha"
  });
  t.after(() => __resetPushBranchDependenciesForTests());
}
