import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  computeLineageId,
  ONTOLOGY_CONVERGENCE_THRESHOLD
} from "@protostar/evaluation";
import type { ConfirmedIntent } from "@protostar/intent";
import { resolveFactoryConfig, type ResolvedFactoryConfig } from "@protostar/lmstudio-adapter";

export type CodeEvolutionMode = "opt-in" | "disabled";
export interface ChainGenerationSource {
  readonly generation: number;
}

export async function loadFactoryConfig(workspaceRoot: string): Promise<ResolvedFactoryConfig> {
  const filePath = join(workspaceRoot, ".protostar", "factory-config.json");
  let fileBytes: string | undefined;

  try {
    fileBytes = await readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (isNodeErrno(error) && error.code === "ENOENT") {
      fileBytes = undefined;
    } else {
      throw error;
    }
  }

  const resolved = resolveFactoryConfig({
    ...(fileBytes !== undefined ? { fileBytes } : {}),
    env: process.env
  });
  if (!resolved.ok) {
    throw new Error(`invalid ${filePath}: ${resolved.errors.join("; ")}`);
  }
  return resolved.resolved;
}

function isNodeErrno(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === "object" && error !== null && "code" in error;
}

export function resolveSemanticJudgeModel(
  cliValue: string | undefined,
  configValue: string | undefined,
  builtInDefault = "Qwen3-Next-80B-A3B-MLX-4bit"
): string {
  return cliValue ?? configValue ?? builtInDefault;
}

export function resolveConsensusJudgeModel(
  cliValue: string | undefined,
  configValue: string | undefined,
  builtInDefault = "DeepSeek-Coder-V2-Lite-Instruct"
): string {
  return cliValue ?? configValue ?? builtInDefault;
}

export function resolveCodeEvolutionMode(
  cliFlag: boolean | undefined,
  configValue: CodeEvolutionMode | undefined,
  builtInDefault: CodeEvolutionMode = "disabled"
): CodeEvolutionMode {
  if (cliFlag === true) return "opt-in";
  return configValue ?? builtInDefault;
}

export function resolveLineageId(
  cliValue: string | undefined,
  configValue: string | undefined,
  intent: ConfirmedIntent
): string {
  return cliValue ?? configValue ?? computeLineageId(intent);
}

export function resolveGeneration(
  cliValue: number | undefined,
  chainLatest: ChainGenerationSource | undefined
): number {
  return cliValue ?? (chainLatest !== undefined ? chainLatest.generation + 1 : 0);
}

export function resolveConvergenceThreshold(
  configValue: number | undefined,
  builtInDefault = ONTOLOGY_CONVERGENCE_THRESHOLD
): number {
  return configValue ?? builtInDefault;
}
