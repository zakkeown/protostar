import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ChainIndexLine {
  readonly generation: number;
  readonly runId: string;
  readonly lineageId: string;
  readonly snapshotPath: string;
  readonly timestamp: string;
  readonly priorVerdict?: "pass" | "fail";
  readonly priorEvaluationVerdict?: "pass" | "fail";
  readonly priorEvolutionAction?: "continue" | "converged" | "exhausted";
  readonly evolutionReason?: string;
}

export const CHAIN_INDEX_DIR = ".protostar/evolution" as const;

const LINEAGE_ID_PATTERN = /^[a-zA-Z0-9._-]+$/;

export function chainIndexPath(lineageId: string, root: string = process.cwd()): string {
  if (!LINEAGE_ID_PATTERN.test(lineageId) || lineageId === "." || lineageId === "..") {
    throw new Error(`invalid lineageId "${lineageId}"; expected /^[a-zA-Z0-9._-]+$/`);
  }
  return join(root, CHAIN_INDEX_DIR, `${lineageId}.jsonl`);
}

export async function appendChainLine(filePath: string, line: ChainIndexLine): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(line)}\n`, "utf8");
}

export async function readLatestChainLine(filePath: string): Promise<ChainIndexLine | undefined> {
  const lines = await readRawLines(filePath);
  if (lines.length === 0) return undefined;
  try {
    return JSON.parse(lines[lines.length - 1]!) as ChainIndexLine;
  } catch (error: unknown) {
    warnMalformedLine(filePath, lines.length, error);
    return undefined;
  }
}

export async function readChainLines(filePath: string): Promise<readonly ChainIndexLine[]> {
  const lines = await readRawLines(filePath);
  const parsed: ChainIndexLine[] = [];

  for (const [index, line] of lines.entries()) {
    try {
      parsed.push(JSON.parse(line) as ChainIndexLine);
    } catch (error: unknown) {
      warnMalformedLine(filePath, index + 1, error);
    }
  }

  return parsed;
}

async function readRawLines(filePath: string): Promise<readonly string[]> {
  let body: string;
  try {
    body = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") return [];
    throw error;
  }
  return body.split("\n").filter((line) => line.trim().length > 0);
}

function warnMalformedLine(filePath: string, lineNumber: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`Skipping malformed evolution chain line ${lineNumber} in ${filePath}: ${message}`);
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}
