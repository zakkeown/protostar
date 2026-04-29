# Phase 18: Typed Factory Recipes (Paved-Road Templates) - Context

**Status:** Stub — to be filled in via `/gsd-discuss-phase 18`

## Phase Boundary

A small, source-backed library of typed factory **recipes** that emit known-safe artifacts (intent draft skeletons, factory config fragments, mechanical check profiles, review/eval policy defaults, operator docs) for the most common Protostar paths. Recipes are *materializers*, not a workflow authoring surface — every recipe still goes through normal admission (capability envelope, signed intent, repo policy, review authorization, delivery gates). Visual stage-graph authoring is an **explicit non-goal**. See ROADMAP.md → Phase 18 for the working goal, depends-on, and tentative success criteria.

## Open Questions (seeds for discuss-phase)

- Recipe addressing: semver vs. content-hash vs. both? (parity decision with Phase 15 prompt-partials)
- Registry location: standalone `@protostar/recipes` pure-tier package, extension of `@protostar/factory-cli`, or a `recipes/` subtree under an existing package?
- Materializer contract: pure function `(operatorInput) => ArtifactSet`, typed builder, or scaffolder-style file emitter?
- Artifact-set schema: single union type for "things a recipe can emit" (intent draft, config fragment, check profile, policy default, README) or per-artifact-type registries?
- Admission-pass-through proof: per-recipe e2e fixture, shared parametrized contract test, or static type-level guarantee that materialized artifacts route through the same admission helpers as hand-authored ones?
- Static "no-widening" check: how is "recipe attempting to widen capability envelope / skip review / auto-merge" enforced — type-level brand check, registration-time validator, or runtime admission rejection?
- Provenance shape in run bundles: inline recipe id+version+content-hash on every recipe-produced artifact, or a single `recipe.json` at the bundle root?
- v1 recipe set scope: confirm the five from the roadmap (`cosmetic-pr`, `review-repair-loop`, `human-delivery-gate`, `dogfood-batch`, `phase-lifecycle`) — any drop / add / split?
- `cosmetic-pr` vs. v0.1 fixture: does the recipe **replace** the v0.1 thin-slice fixture, or coexist with it as a separate code path during transition?
- `dogfood-batch` vs. existing dogfood harness (`scripts/dogfood.sh`, `__dogfood-step`): does the recipe wrap the existing harness, or is the harness rewritten as a recipe consumer?
- `phase-lifecycle` recipe scope: does it write into `.planning/` directly (real GSD scaffolding), or only emit a draft bundle the operator places by hand?
- Versioning + change policy: in-place mutation forbidden (parity with Phase 15) — what's the bump-rule for "doc-only" recipe changes vs. behaviour changes?
- Operator-doc emission: per-recipe README written into the target directory, vs. a single recipe-help command, vs. both?
- Authority boundary: recipe materializers run pure (no fs/no net) and `factory-cli` performs all writes, or are recipes allowed to call `repo`'s authority-boundary writers directly?
- Composition with Phase 14 (validation reports): does a recipe-emitted artifact set carry a pre-computed validation report, or does it re-validate at admission time only?
- Composition with Phase 13 (replay-with-edit): is a "replay this recipe with edited input" a recipe-level operation, or does it stay at the run-bundle level?
