# Phase 15: Prompt Partials / Pinned Prompt Modules - Context

**Status:** Stub — to be filled in via `/gsd-discuss-phase 15`

## Phase Boundary

Versioned, reusable prompt fragments for reviewer / producer / evaluator roles so Protostar's model-facing contracts can be evolved safely. See ROADMAP.md → Phase 15 for the working goal, depends-on, and tentative success criteria.

## Open Questions (seeds for discuss-phase)

- Partial addressing: semver vs. content-hash vs. both?
- Registry location: standalone `@protostar/prompts` pure-tier package, or extension of an existing package?
- Composition contract: template engine, structural concat, or typed builder?
- Persistence shape in run bundles: inline copies vs. content-addressed pointers?
- Migration: how do existing inline prompts in reviewer/producer/evaluator paths get extracted without breaking determinism on in-flight runs?
- Eval integration depth: A/B prompt-delta scoring in Phase 8, or just provenance for now?
- Replay-with-edit (Phase 13) interaction: does swapping a partial version count as an "edit" the operator can perform on a recorded run?
