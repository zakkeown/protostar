import { mkdir, open, type FileHandle } from "node:fs/promises";
import { dirname, join } from "node:path";

import {
  JOURNAL_FILE_NAME,
  formatTaskJournalLine,
  type TaskJournalEvent
} from "@protostar/execution";

export interface JournalWriter {
  appendEvent(event: TaskJournalEvent): Promise<void>;
  close(): Promise<void>;
}

export async function createJournalWriter(opts: { readonly runDir: string }): Promise<JournalWriter> {
  const journalPath = join(opts.runDir, "execution", JOURNAL_FILE_NAME);
  await mkdir(dirname(journalPath), { recursive: true });
  const handle: FileHandle = await open(journalPath, "a");
  let chain: Promise<void> = Promise.resolve();
  let closed = false;

  return {
    appendEvent(event: TaskJournalEvent): Promise<void> {
      if (closed) {
        return Promise.reject(new Error("journal writer is closed"));
      }

      chain = chain.then(async () => {
        await handle.appendFile(formatTaskJournalLine(event), "utf8");
        await handle.datasync();
      });
      return chain;
    },

    async close(): Promise<void> {
      await chain;
      if (!closed) {
        closed = true;
        await handle.close();
      }
    }
  };
}
