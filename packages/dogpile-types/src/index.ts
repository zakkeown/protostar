/**
 * @protostar/dogpile-types
 *
 * Thin re-export shim over the pinned public `@dogpile/sdk` surface consumed by
 * `@protostar/dogpile-adapter`. This preserves Protostar's Dogpile indirection
 * while removing the old sibling-repo/link dependency.
 *
 * Authority boundary (locked): this module performs zero I/O.
 *
 * Per Phase 6 D-01 (Q-01): runtime re-exports here remain network-only at use-site;
 * this shim itself has zero I/O.
 * Per Phase 6 D-02 (Q-02): `stream` and `RunEvent`/`StreamHandle` are exposed because
 * Wave 1 uses `stream()` not `run()`; `run` is re-exported for symmetry / replay
 * scenarios but not used in this phase.
 */

export type { AgentSpec, DogpileOptions } from "@dogpile/sdk/types";
export type {
  ConfiguredModelProvider,
  NormalizedStopReason,
  RunAccounting,
  RunEvent,
  RunResult,
  StreamEvent,
  StreamHandle,
  Trace
} from "@dogpile/sdk/types";
export { budget, convergence, firstOf } from "@dogpile/sdk";
export { createOpenAICompatibleProvider, run, stream } from "@dogpile/sdk";
