import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export type CleanupReason = "success" | "failure";

export interface CleanupOptions {
  readonly reason: CleanupReason;
  readonly tombstoneRetentionHours?: number;
  readonly errorMessage?: string;
}

export interface TombstoneRecord {
  readonly runId: string;
  readonly failedAt: string;
  readonly retentionExpiresAt: string;
  readonly reason: "failure";
  readonly errorMessage?: string;
}

/**
 * Q-11 workspace lifecycle primitive.
 * Success removes the clone dir; failure retains it and writes retention metadata.
 */
export async function cleanupWorkspace(
  dir: string,
  runId: string,
  opts: CleanupOptions
): Promise<{ readonly removed: boolean; readonly tombstonePath?: string }> {
  if (opts.reason === "success") {
    await rm(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return { removed: true };
  }

  const retentionHours = opts.tombstoneRetentionHours ?? 24;
  const failedAt = new Date();
  const retentionExpiresAt = new Date(failedAt.getTime() + retentionHours * 3600 * 1000);
  const record: TombstoneRecord = {
    runId,
    failedAt: failedAt.toISOString(),
    retentionExpiresAt: retentionExpiresAt.toISOString(),
    reason: "failure",
    ...(opts.errorMessage !== undefined ? { errorMessage: opts.errorMessage } : {})
  };
  await mkdir(dir, { recursive: true });
  const tombstonePath = join(dir, "tombstone.json");
  await writeFile(tombstonePath, JSON.stringify(record, null, 2), "utf8");
  return { removed: false, tombstonePath };
}
