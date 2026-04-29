# @protostar/stress-harness

Pure stress scenario contracts for Phase 11 concurrency and fault-injection runs.

## Public exports

- `export * from "./fault-scenarios.js"` - locked stress shapes, fault scenario literals, and deterministic injection descriptors.
- `export * from "./fault-application.js"` - scenario-to-mechanism dispatch contract and `FaultObservation` types.

## Runtime dependencies

- None.

## Authority constraints

pure tier: filesystem, network, subprocess, timers, and fetch authority are forbidden. Fault mechanisms are observed only through caller-injected hooks.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
