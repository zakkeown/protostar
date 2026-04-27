/**
 * @protostar/dogpile-types
 *
 * Thin re-export shim over the pinned public `@dogpile/sdk` surface consumed by
 * `@protostar/dogpile-adapter`. This preserves Protostar's Dogpile indirection
 * while removing the old sibling-repo/link dependency.
 *
 * Authority boundary (locked): this module performs zero I/O.
 */

export type { AgentSpec, DogpileOptions } from "@dogpile/sdk/types";
export { budget, convergence, firstOf } from "@dogpile/sdk";
