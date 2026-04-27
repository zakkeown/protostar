import { mkdir, open, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  SNAPSHOT_FILE_NAME,
  serializeSnapshot,
  type ExecutionSnapshot
} from "@protostar/execution";

const writeChains = new Map<string, Promise<void>>();

export async function writeSnapshotAtomic(opts: {
  readonly runDir: string;
  readonly snapshot: ExecutionSnapshot;
}): Promise<void> {
  const dir = join(opts.runDir, "execution");
  const finalPath = join(dir, SNAPSHOT_FILE_NAME);

  const previous = writeChains.get(finalPath) ?? Promise.resolve();
  const next = previous.then(() => writeSnapshotAtomicUnchained(dir, finalPath, opts.snapshot));
  writeChains.set(
    finalPath,
    next.finally(() => {
      if (writeChains.get(finalPath) === next) {
        writeChains.delete(finalPath);
      }
    })
  );
  return next;
}

async function writeSnapshotAtomicUnchained(
  dir: string,
  finalPath: string,
  snapshot: ExecutionSnapshot
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const tmpPath = join(dir, `${SNAPSHOT_FILE_NAME}.tmp`);

  await writeFile(tmpPath, serializeSnapshot(snapshot), "utf8");

  const fileHandle = await open(tmpPath, "r");
  try {
    await fileHandle.datasync();
  } finally {
    await fileHandle.close();
  }

  await rename(tmpPath, finalPath);

  const dirHandle = await open(dir, "r");
  try {
    await dirHandle.datasync();
  } catch {
    // Directory fsync is best-effort across platforms; APFS/ext4 support it.
  } finally {
    await dirHandle.close();
  }
}
