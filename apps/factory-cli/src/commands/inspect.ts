import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Command } from "@commander-js/extra-typings";
import type { FactoryRunManifest } from "@protostar/artifacts";
import { resolveWorkspaceRoot } from "@protostar/paths";

import { ExitCode } from "../exit-codes.js";
import { writeStderr, writeStdoutJson } from "../io.js";
import { assertRunIdConfined, parseRunId, type RunId } from "../run-id.js";

export type ArtifactStage =
  | "manifest"
  | "plan"
  | "execution"
  | "review"
  | "evaluation"
  | "evolution"
  | "ci"
  | "pile"
  | "delivery";

export type ArtifactKind =
  | "manifest"
  | "plan"
  | "journal"
  | "snapshot"
  | "review-gate"
  | "evaluation-report"
  | "evolution-snapshot"
  | "ci-events"
  | "pile-result"
  | "trace"
  | "pile-refusal"
  | "delivery-authorization"
  | "delivery-result";

export interface ArtifactRef {
  readonly stage: ArtifactStage;
  readonly kind: ArtifactKind;
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface InspectOutput {
  readonly manifest: FactoryRunManifest;
  readonly artifacts: readonly ArtifactRef[];
  readonly summary: string;
}

interface CommanderInspectOptions {
  readonly json?: boolean;
  readonly stage?: string;
}

interface StaticArtifactSpec {
  readonly stage: ArtifactStage;
  readonly kind: ArtifactKind;
  readonly path: string;
}

const staticArtifactSpecs: readonly StaticArtifactSpec[] = [
  { stage: "manifest", kind: "manifest", path: "manifest.json" },
  { stage: "plan", kind: "plan", path: "plan.json" },
  { stage: "execution", kind: "journal", path: "execution/journal.jsonl" },
  { stage: "execution", kind: "snapshot", path: "execution/snapshot.json" },
  { stage: "review", kind: "review-gate", path: "review-gate.json" },
  { stage: "evaluation", kind: "evaluation-report", path: "evaluation-report.json" },
  { stage: "evolution", kind: "evolution-snapshot", path: "evolution/snapshot.json" },
  { stage: "ci", kind: "ci-events", path: "ci-events.jsonl" }
];

const deliveryArtifactSpecs: readonly StaticArtifactSpec[] = [
  { stage: "delivery", kind: "delivery-authorization", path: "delivery/authorization.json" },
  { stage: "delivery", kind: "delivery-result", path: "delivery/result.json" }
];

const pileKinds = ["planning", "review", "execution-coordination"] as const;
const pileArtifactSpecs = [
  { fileName: "result.json", kind: "pile-result" },
  { fileName: "trace.json", kind: "trace" },
  { fileName: "refusal.json", kind: "pile-refusal" }
] as const satisfies readonly { readonly fileName: string; readonly kind: ArtifactKind }[];

const artifactStages = new Set<ArtifactStage>([
  "manifest",
  "plan",
  "execution",
  "review",
  "evaluation",
  "evolution",
  "ci",
  "pile",
  "delivery"
]);

export function buildInspectCommand(): Command {
  const command = new Command("inspect")
    .description("Inspect a factory run bundle as canonical JSON")
    .argument("<runId>", "run id to inspect")
    .option("--stage <name>", "filter artifact rows by stage")
    .option("--json", "emit JSON output (default)")
    .exitOverride()
    .configureOutput({
      writeOut: (str) => process.stderr.write(str),
      writeErr: (str) => process.stderr.write(str)
    })
    .action(async (runId, opts) => {
      process.exitCode = await executeInspect(runId, opts);
    });
  return command as unknown as Command;
}

async function executeInspect(runIdInput: string, opts: CommanderInspectOptions): Promise<number> {
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

  const stage = parseStage(opts.stage);
  if (!stage.ok) {
    writeStderr(stage.error);
    return ExitCode.UsageOrArgError;
  }

  const runDir = resolve(runsRoot, parsedRunId.value);
  const manifestPath = join(runDir, "manifest.json");
  const manifest = await readManifest(manifestPath);
  if (!manifest.ok) {
    writeStderr(`no manifest at ${manifestPath}`);
    return ExitCode.NotFound;
  }

  const artifacts = await collectArtifacts(runDir);
  const filteredArtifacts =
    stage.value === undefined ? artifacts : artifacts.filter((artifact) => artifact.stage === stage.value);

  writeStdoutJson({
    manifest: manifest.value,
    artifacts: filteredArtifacts,
    summary: await buildSummary({ runDir, runId: parsedRunId.value, manifest: manifest.value })
  } satisfies InspectOutput);
  return ExitCode.Success;
}

async function collectArtifacts(runDir: string): Promise<readonly ArtifactRef[]> {
  const artifacts: ArtifactRef[] = [];
  for (const spec of staticArtifactSpecs) {
    const artifact = await buildArtifactRef(runDir, spec);
    if (artifact !== null) {
      artifacts.push(artifact);
    }
  }

  for (const pileKind of pileKinds) {
    for (const iterDir of await listIterationDirs(join(runDir, "piles", pileKind))) {
      for (const spec of pileArtifactSpecs) {
        const artifact = await buildArtifactRef(runDir, {
          stage: "pile",
          kind: spec.kind,
          path: `piles/${pileKind}/${iterDir}/${spec.fileName}`
        });
        if (artifact !== null) {
          artifacts.push(artifact);
        }
      }
    }
  }

  for (const spec of deliveryArtifactSpecs) {
    const artifact = await buildArtifactRef(runDir, spec);
    if (artifact !== null) {
      artifacts.push(artifact);
    }
  }

  return artifacts;
}

async function buildArtifactRef(runDir: string, spec: StaticArtifactSpec): Promise<ArtifactRef | null> {
  const filePath = join(runDir, spec.path);
  if (!(await fileExists(filePath))) {
    return null;
  }

  const bytes = await readFile(filePath);
  return {
    stage: spec.stage,
    kind: spec.kind,
    path: spec.path,
    sha256: createHash('sha256').update(bytes).digest("hex"),
    bytes: bytes.byteLength
  };
}

async function listIterationDirs(pileDir: string): Promise<readonly string[]> {
  let entries: readonly string[];
  try {
    entries = await readdir(pileDir);
  } catch {
    return [];
  }

  const iterDirs: { readonly name: string; readonly index: number }[] = [];
  for (const entry of entries) {
    const match = /^iter-(\d+)$/.exec(entry);
    if (match === null) continue;
    const entryPath = join(pileDir, entry);
    try {
      if ((await stat(entryPath)).isDirectory()) {
        iterDirs.push({ name: entry, index: Number(match[1]) });
      }
    } catch {
      // Best-effort inspection: a concurrently removed iter dir is just absent.
    }
  }

  return iterDirs.sort((left, right) => left.index - right.index).map((entry) => entry.name);
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

async function buildSummary(input: {
  readonly runDir: string;
  readonly runId: RunId;
  readonly manifest: FactoryRunManifest;
}): Promise<string> {
  const review = await readOptionalJson(join(input.runDir, "review-gate.json"));
  const evaluation = await readOptionalJson(join(input.runDir, "evaluation-report.json"));
  const delivery = await readOptionalJson(join(input.runDir, "delivery", "result.json"));
  const reviewVerdict = readStringField(review, "verdict") ?? "n/a";
  const evaluationVerdict = readStringField(evaluation, "verdict") ?? "n/a";
  const pr = readStringField(delivery, "prUrl") ?? "none";

  return `run ${input.runId} - review:${reviewVerdict} - eval:${evaluationVerdict} - pr:${pr} - ${humanizeDuration(
    input.manifest
  )}`;
}

function humanizeDuration(manifest: FactoryRunManifest): string {
  const createdAt = Date.parse(manifest.createdAt);
  const completedAt = manifest.stages
    .map((stage) => stage.completedAt)
    .filter((value): value is string => value !== undefined)
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => right - left)[0];
  const elapsedMs = Math.max(0, (completedAt ?? Date.now()) - createdAt);
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  }
  return `${seconds}s`;
}

function parseStage(value: string | undefined):
  | { readonly ok: true; readonly value?: ArtifactStage }
  | { readonly ok: false; readonly error: string } {
  if (value === undefined) {
    return { ok: true };
  }
  if (artifactStages.has(value as ArtifactStage)) {
    return { ok: true, value: value as ArtifactStage };
  }
  return { ok: false, error: `--stage must be one of ${Array.from(artifactStages).join(", ")}.` };
}

async function readOptionalJson(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function readStringField(value: unknown, key: string): string | null {
  if (typeof value !== "object" || value === null || !(key in value)) return null;
  const field = (value as Record<string, unknown>)[key];
  return typeof field === "string" ? field : null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
