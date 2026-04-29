# Phase 14: Pluggable Validation Reports - Context

**Status:** Stub — to be filled in via `/gsd-discuss-phase 14`

## Phase Boundary

Protostar today admits-or-refuses at hard gates: the first blocker stops the pipeline and surfaces a single refusal artifact. This phase introduces a complementary **save-time validation** style — given an intent / plan / config / change-set, return a *report* that lists **all** findings (blockers and warnings) anchored to specific nodes (JSON pointers, file paths, plan IDs, capability fields) instead of failing on the first one.

Validators are pluggable: new ones can be registered against a target schema/artifact type without changing the gate runner. Reports are first-class artifacts with a stable schema, suitable for both CLI rendering and operator-surface UIs.

## Why now

- Admission gates give a yes/no with one reason — operators authoring intents/plans/configs hit "fix one thing, run, hit next blocker" loops.
- The dogfood and headless phases (10–11) confirm the cost: a single bad config field can take 3–5 round-trips to discover all issues.
- Authority boundary stabilization (Phase 12) made the validation surface itself more uniform — now there is a clean substrate to attach a report-style validator chain to.
- Replay-with-edit (Phase 13) becomes much more useful when the replayed artifact carries a full validation report rather than a single first-fail message.

## Open questions (to resolve in CONTEXT/SEED)

- What artifact types get reports first? (intent, plan, capability envelope, repo policy, config, change-set — pick the high-value subset.)
- Anchor format: JSON Pointer (RFC 6901), dotted path, or domain-specific (e.g. `plans[03].waves[2]`)? Multi-anchor per finding?
- Severity levels: just `blocker | warning`, or add `info | suggestion`? How do warnings interact with admission (advisory vs. opt-in strict mode)?
- Do report-style validators *replace* admission gates for those artifacts, *wrap* them (gate = report.blockers.length === 0), or *coexist* (report at author-time, gate at admission-time)?
- Plugin surface: in-process registration via `@protostar/validation`, separate workspace per validator, or capability-bounded subprocess? Discoverability and ordering rules?
- Determinism contract: same input → byte-identical report? How are validator versions pinned in the report?
- Where do reports live? Sibling artifact in `.protostar/runs/<id>/validation/` vs. inline in the admission decision vs. operator-surface only.
- CLI/operator UX: render grouped by severity, by anchor path, or by validator? Diff between two reports for an edited artifact?

## Requirements

*(to be derived; tentative theme: VALID-01..VALID-N covering validator plugin contract, report schema, anchor format, severity model, admission-gate composition, artifact persistence, CLI/operator rendering, determinism + version pinning)*

## Depends on

- Phase 1 (intent admission contracts)
- Phase 2 (authority/governance — capability + repo policy are validation targets)
- Phase 12 (authority boundary stabilization — single source of truth for validation surface)

## Notes

Save-time validation is intentionally *additive* to admission gates, not a replacement: the gate posture (default-DENY, fail-closed) stays. Reports are an author-experience improvement that exposes the same constraints earlier and in bulk.
