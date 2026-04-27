import { stat, unlink } from "node:fs/promises";
import { join } from "node:path";

export interface CancelWiring {
  readonly rootController: AbortController;
  readonly checkSentinelBetweenTasks: () => Promise<void>;
  readonly unlinkSentinelOnResume: () => Promise<void>;
  dispose(): void;
}

export function installCancelWiring(opts: { readonly runDir: string }): CancelWiring {
  const rootController = new AbortController();
  const sentinelPath = join(opts.runDir, "CANCEL");
  const handler = () => rootController.abort("sigint");
  process.on("SIGINT", handler);
  let disposed = false;

  return {
    rootController,
    async checkSentinelBetweenTasks() {
      try {
        await stat(sentinelPath);
        rootController.abort("sentinel");
      } catch (error: unknown) {
        if (!isNodeErrno(error) || error.code !== "ENOENT") {
          throw error;
        }
      }
    },
    async unlinkSentinelOnResume() {
      try {
        await unlink(sentinelPath);
      } catch (error: unknown) {
        if (!isNodeErrno(error) || error.code !== "ENOENT") {
          throw error;
        }
      }
    },
    dispose() {
      if (!disposed) {
        disposed = true;
        process.off("SIGINT", handler);
      }
    }
  };
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
