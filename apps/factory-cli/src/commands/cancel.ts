/* NOTE: distinct from apps/factory-cli/src/cancel.ts (which is the in-process installCancelWiring helper from Phase 6). This module is the OUT-OF-PROCESS cancel command per Phase 9 Q-16. */
import { mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { Command } from "@commander-js/extra-typings";
import { setFactoryRunStatus, type FactoryRunManifest, type FactoryRunStatus } from "@protostar/artifacts";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { assertRunIdConfined, parseRunId } from "../run-id.js";

const nonCancellableStatuses = new Set<FactoryRunStatus>(["completed", "blocked", "cancelled", "ready-to-release"]);
const cancellingStatus = 'cancelling';
const alreadyTerminalError = 'already-terminal';

export function buildCancelCommand(): Command {
  const command = new Command("cancel")
    .description("Request cooperative cancellation for a factory run")
    .argument("<runId>", "run id to cancel")
    .addHelpText(
      "after",
      "\nRace note: cancelling -> completed is allowed if the run loop finishes a stage before it observes the CANCEL sentinel."
    )
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (runId) => {
      process.exitCode = await executeCancel(runId);
    });
  return command as unknown as Command;
}

async function executeCancel(runIdInput: string): Promise<number> {
  const parsedRunId = parseRunId(runIdInput);
  if (!parsedRunId.ok) {
    writeStderr(parsedRunId.reason);
    return ExitCode.UsageOrArgError;
  }

  const workspaceRoot = resolveWorkspaceRoot();
  const runsRoot = join(workspaceRoot, ".protostar", "runs");
  try {
    assertRunIdConfined(runsRoot, parsedRunId.value);
  } catch (error: unknown) {
    writeStderr(error instanceof Error ? error.message : String(error));
    return ExitCode.UsageOrArgError;
  }

  const runDir = resolve(runsRoot, parsedRunId.value);
  const manifestPath = join(runDir, "manifest.json");
  const sentinelPath = join(runDir, "CANCEL");
  const manifest = await readManifest(manifestPath);
  if (!manifest.ok) {
    writeStderr(`no manifest at ${runDir}`);
    return ExitCode.NotFound;
  }

  if (nonCancellableStatuses.has(manifest.value.status)) {
    writeStdoutJson({
      runId: parsedRunId.value,
      error: alreadyTerminalError,
      terminalStatus: manifest.value.status
    });
    writeStderr(`run ${parsedRunId.value} is already ${manifest.value.status}`);
    return ExitCode.Conflict;
  }

  // Q-16/Pitfall 6: cancelling -> completed is allowed if the run loop writes
  // a terminal completed manifest between this atomic mark and its next
  // sentinel check. The cancel command only guarantees no torn manifest write.
  const nextManifest = setFactoryRunStatus(manifest.value, cancellingStatus);
  await writeManifestAtomic(manifestPath, nextManifest);
  await writeFile(sentinelPath, "", "utf8");
  writeStdoutJson({
    runId: parsedRunId.value,
    action: "cancelling-requested",
    sentinelPath,
    manifestStatus: cancellingStatus
  });
  return ExitCode.Success;
}

async function readManifest(
  manifestPath: string
): Promise<{ readonly ok: true; readonly value: FactoryRunManifest } | { readonly ok: false }> {
  try {
    return { ok: true, value: JSON.parse(await readFile(manifestPath, "utf8")) as FactoryRunManifest };
  } catch {
    return { ok: false };
  }
}

async function writeManifestAtomic(manifestPath: string, manifest: FactoryRunManifest): Promise<void> {
  const manifestDir = dirname(manifestPath);
  await mkdir(manifestDir, { recursive: true });
  const tmpPath = join(manifestDir, `manifest.json.${process.pid}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const fileHandle = await open(tmpPath, "r");
  try {
    await fileHandle.datasync();
  } finally {
    await fileHandle.close();
  }

  await rename(tmpPath, manifestPath);
}
