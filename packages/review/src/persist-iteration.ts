import type { FsAdapter } from "@protostar/repo";

import type { ReviewPersistence } from "./run-review-repair-loop.js";

export interface CreateReviewPersistenceInput {
  readonly fs: FsAdapter;
  readonly runsRoot: string;
}

export function createReviewPersistence(input: CreateReviewPersistenceInput): ReviewPersistence {
  return {
    async writeIterationDir(iteration) {
      const dir = reviewIterationDir(input.runsRoot, iteration.runId, iteration.attempt);
      await writeJson(input.fs, `${dir}/mechanical-result.json`, iteration.mechanical);

      if (iteration.model !== undefined) {
        await writeJson(input.fs, `${dir}/model-result.json`, iteration.model);
      }

      if (iteration.repairPlan !== undefined) {
        await writeJson(input.fs, `${dir}/repair-plan.json`, iteration.repairPlan);
      }
    },

    async writeReviewDecision(decision) {
      const decisionPath = `${reviewDir(input.runsRoot, decision.runId)}/review-decision.json`;
      await writeJson(input.fs, decisionPath, decision.artifact);
      return { decisionPath };
    },

    async writeReviewBlock(block) {
      assertReviewBlockArtifact(block.artifact);
      const blockPath = `${reviewDir(input.runsRoot, block.runId)}/review-block.json`;
      await writeJson(input.fs, blockPath, block.artifact);
      return { blockPath };
    },

    async appendLifecycleEvent(event) {
      const path = `${reviewDir(input.runsRoot, event.runId)}/review.jsonl`;
      await input.fs.mkdir(parentDir(path), { recursive: true });
      await input.fs.appendFile(path, `${JSON.stringify(event.event)}\n`);
      await input.fs.fsync(path);
    }
  };
}

async function writeJson(fs: FsAdapter, path: string, value: unknown): Promise<void> {
  const tmpPath = `${path}.tmp`;
  await fs.mkdir(parentDir(path), { recursive: true });
  await fs.writeFile(tmpPath, `${JSON.stringify(value, null, 2)}\n`);
  await fs.fsync(tmpPath);
  await fs.rename(tmpPath, path);
  await fs.fsync(parentDir(path));
}

function reviewDir(runsRoot: string, runId: string): string {
  return `${trimTrailingSlash(runsRoot)}/${runId}/review`;
}

function reviewIterationDir(runsRoot: string, runId: string, attempt: number): string {
  return `${reviewDir(runsRoot, runId)}/iter-${attempt}`;
}

function parentDir(path: string): string {
  const index = path.lastIndexOf("/");
  return index <= 0 ? "/" : path.slice(0, index);
}

function trimTrailingSlash(path: string): string {
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function assertReviewBlockArtifact(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error("review-block artifact must be an object.");
  }

  const reason = value["reason"];
  if (
    reason !== "budget-exhausted" &&
    reason !== "critical-finding" &&
    reason !== "mechanical-block" &&
    reason !== "model-block"
  ) {
    throw new Error("review-block reason must be a known discriminator.");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
