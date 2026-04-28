import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { OntologySnapshot } from "@protostar/evaluation";

export interface WriteEvolutionSnapshotInput {
  readonly runDir: string;
  readonly snapshot: OntologySnapshot;
  readonly lineageId: string;
}

export interface WriteEvolutionSnapshotResult {
  readonly snapshotPath: string;
}

export async function writeEvolutionSnapshot(
  input: WriteEvolutionSnapshotInput
): Promise<WriteEvolutionSnapshotResult> {
  const dir = join(input.runDir, "evolution");
  const snapshotPath = join(dir, "snapshot.json");
  const tmpPath = join(dir, "snapshot.json.tmp");

  await mkdir(dir, { recursive: true });
  await writeFile(tmpPath, JSON.stringify({ ...input.snapshot, lineageId: input.lineageId }, null, 2), "utf8");

  const fileHandle = await open(tmpPath, "r");
  try {
    await fileHandle.datasync();
  } finally {
    await fileHandle.close();
  }

  await rename(tmpPath, snapshotPath);

  const dirHandle = await open(dir, "r");
  try {
    await dirHandle.datasync();
  } catch {
    // Directory fsync is best-effort across platforms; APFS/ext4 support it.
  } finally {
    await dirHandle.close();
  }

  return { snapshotPath };
}
