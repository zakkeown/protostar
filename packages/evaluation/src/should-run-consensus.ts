import { T_CONF, type SemanticEvalResult } from "./index.js";

export function shouldRunConsensus(semantic: SemanticEvalResult, threshold: number = T_CONF): boolean {
  return semantic.confidence < threshold;
}
