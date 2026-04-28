import type { SemanticEvalResult } from "./index.js";

const T_CONF = 0.85;

export function shouldRunConsensus(semantic: SemanticEvalResult, threshold: number = T_CONF): boolean {
  return semantic.confidence < threshold;
}
