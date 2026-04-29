# Phase 12: Authority Boundary Stabilization - Context

**Gathered:** 2026-04-29
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Re-seal the authority boundary after the v1 dogfood pass. Five concrete fixes:

1. **Verify gate parity** — local `verify` and CI `verify:full` are unified into a single script so divergence cannot hide failures again.
2. **Mechanical-checks no-net violation** — `diff-name-only` git workspace inspection moves out of `@protostar/mechanical-checks` (declared `pure`) into `@protostar/repo`.
3. **Mechanical command authority** — operator-configured mechanical commands run through `@protostar/repo`'s allowlist + per-command schema + refusal-evidence runner; raw `spawn` in `apps/factory-cli/src/main.ts` is removed. The set of allowed mechanical command names is **closed** (no operator-declared free-form argv at runtime); each new mechanical command is bound at admission time via a `confirmedIntent.capabilityEnvelope.mechanical.allowed[]` field, requiring a schema bump (1.5.0 → 1.6.0).
4. **Subprocess env scrubbing** — `packages/repo/src/subprocess-runner.ts` defaults child env to a tiny POSIX baseline (`PATH`, `HOME`, `LANG`, `USER`) plus an explicit per-call `inheritEnv: string[]` allowlist. Delivery's `PROTOSTAR_GITHUB_TOKEN` never crosses the subprocess boundary at all — it stays at the Octokit/`isomorphic-git onAuth` library boundary. A redaction filter on persisted logs is added as defense-in-depth.
5. **applyChangeSet path/op/diff invariant** — the path/op/diff agreement is enforced at admission (branded `PatchRequest` constructor refuses on mismatch) AND re-asserted inside `applyChangeSet` as defense-in-depth. Equality is exact-string after canonicalization through a single helper.
6. **Boundary truth source** — `package.json` `protostar.tier` becomes canonical. `tier-conformance.contract.test.ts` is extended to parse AGENTS.md and the authority-boundary contract entries and assert all three agree. `evaluation-runner` and `mechanical-checks` tier classifications are re-derived from actual imports.

Phase 12 also pulls command-execution wiring, review-loop wiring, and delivery wiring out of `apps/factory-cli/src/main.ts` (currently 3429 LOC) as part of routing mechanical commands through the repo runner — light decomposition allowed.

**Blast radius:** authority surface (`@protostar/repo` + `@protostar/authority`), every package's `package.json` tier declaration, `confirmedIntent.schemaVersion` cascade (1.5.0 → 1.6.0 with full fixture re-sign), and `apps/factory-cli/src/main.ts` decomposition into `apps/factory-cli/src/wiring/{command-execution,review-loop,delivery}.ts`.

**Phase ordering:** runs **after** Phase 11 as roadmapped. Phase 11 stress harness may surface additional authority-boundary issues to fold into Phase 12 scope.

</domain>

<decisions>
## Implementation Decisions

### Verify Gate Parity
- **D-01 (Q-01):** Collapse `verify` and `verify:full` into a single script. Local devs run exactly what CI runs. Slower local feedback is acceptable; zero divergence risk is the priority. Drop the tiered-verify pattern entirely; remove the per-package skip lists.
- **D-02 (Q-02):** Move git workspace inspection (`diff-name-only`) out of `@protostar/mechanical-checks` into `@protostar/repo`. Mechanical-checks stays a pure transform that consumes pre-computed diff names as input. Tier in `package.json:36` and `AGENTS.md:26` remains `pure`; the no-net contract test stays as written.

### Mechanical Subprocess Authority
- **D-03 (Q-03):** Mechanical commands run through `@protostar/repo`'s allowlist with a **closed allowlist** of mechanical command names (e.g., `typecheck`, `lint`, `test`, `verify`). Each name maps to a known package's CLI; argv shape is schema-validated per-command. Operator cannot declare new free-form mechanical commands at runtime.
- **D-04 (Q-04):** Bump `confirmedIntent` schema 1.5.0 → 1.6.0. Add `capabilityEnvelope.mechanical.allowed: string[]` (subset of the closed mechanical command name allowlist). Mechanical commands become first-class capability — operator must list them at intent time. Full fixture cascade required (every signed-intent fixture re-signs).
- **D-05 (Q-05):** Mechanical commands run inside the **cloned target-repo workspace cwd** (same as today). The cloned workspace is the inspection target; that posture stays. Defense against target-repo write-back lives in env scrubbing (D-08) and the existing `dirtyWorktreeStatus` checks, not in cwd sandboxing.

### Subprocess Env Default
- **D-06 (Q-06):** `packages/repo/src/subprocess-runner.ts` default env is a tiny POSIX baseline — `PATH`, `HOME`, `LANG`, `USER` — plus an explicit per-call `inheritEnv: string[]` allowlist. Both call sites (`:33`, `:85`) flip to this default. The allowlist is logged into evidence so refusal artifacts show exactly which vars crossed the boundary.
- **D-07 (Q-07):** `PROTOSTAR_GITHUB_TOKEN` never reaches a subprocess. Delivery uses Octokit (HTTP) for PR ops and `isomorphic-git` `onAuth` shim for `pushBranch` — both library calls. The subprocess runner's `inheritEnv` allowlist explicitly cannot include `PROTOSTAR_GITHUB_TOKEN`; add a contract test pinning that.
- **D-08 (Q-08):** Both env scrubbing AND log redaction. Apply known token-shape patterns (GH PAT, bearer headers, JWT shapes) to rolling-tail and evidence writes. Belt-and-suspenders — env scrubbing prevents the leak, redaction catches it if a future code path regresses.

### applyChangeSet Path/Op/Diff Invariant
- **D-09 (Q-09):** Both admission and `applyChangeSet`. `PatchRequest` becomes a brand whose constructor refuses if `path`, `op.path`, and parsed-diff filename disagree. `applyChangeSet` re-asserts the invariant at function entry as defense-in-depth (catches handcrafted `PatchRequest` instances in tests). Add a mismatch refusal contract test in `@protostar/admission-e2e`.
- **D-10 (Q-10):** Equality is exact string equality after canonicalization. All three sources (`PatchRequest.path`, `op.path`, parsed-diff filename) flow through a single canonicalize-relative-path helper, then strict `===`. Predictable; rejects ambiguous patches.

### Boundary Truth Source
- **D-11 (Q-11):** `package.json` `protostar.tier` is canonical. The manifest lives next to the code; the package owns its claim. AGENTS.md table and `authority-boundary.contract.test.ts` derive from / assert against the manifests.
- **D-12 (Q-12):** Extend `packages/admission-e2e/src/tier-conformance.contract.test.ts` (introduced in Phase 10.1.7) to parse the AGENTS.md tier table and the entries in `authority-boundary.contract.test.ts`, then assert manifest-tier == AGENTS.md-tier == authority-boundary-entry for every package. One test, three sources, drift becomes a node:test failure.
- **D-13 (Q-13):** For both `evaluation-runner` and `mechanical-checks`, re-derive tier from actual imports during planning. Code is truth — don't pre-judge whether the manifest or the contract is "right." After D-02 lands, mechanical-checks should be cleanly `pure`. Evaluation-runner's classification is open; the planner inspects imports and picks the honest answer (likely `network` or splits into a pure orchestrator + network adapter).

### Scope & Verification
- **D-14 (Q-14):** Light decomposition allowed. Pull all three wiring concerns — command-execution (`main.ts:1892` mechanical spawn region), review-loop, delivery — out of `main.ts` into `apps/factory-cli/src/wiring/{command-execution,review-loop,delivery}.ts`. Pays off architectural debt as part of routing mechanical commands through the repo runner. **Out of scope for Phase 12:** `packages/planning/src/index.ts` (5701 LOC) decomposition.
- **D-15 (Q-15):** Done = (a) all new contract tests green, (b) `verify` (now unified) green locally and in CI, (c) Phase 10 dogfood loop re-run end-to-end on `protostar-toy-ttt` (confirms env scrubbing didn't break delivery and mechanical routing didn't break review), AND (d) a **secret-leak attack test** — target repo's mechanical command echoes `$PROTOSTAR_GITHUB_TOKEN`; assert evidence logs do not contain the token shape.
- **D-16 (Q-16):** Phase 12 runs **after** Phase 11 as roadmapped (`Depends on: 10, 11`). Phase 11 stress harness may surface additional authority issues that fold into Phase 12 scope before planning.

### Claude's Discretion
- Specific names for the closed mechanical command allowlist (D-03) — researcher inspects `apps/factory-cli/src/wiring/review-loop.ts:214` and the existing `factory-config.schema.json` mechanical defaults to enumerate.
- Exact set of redaction patterns for D-08 — researcher pulls from existing token shapes in fixtures + GitHub PAT format docs.
- Whether `evaluation-runner` resolves to `network`, `pure`, or splits (D-13) — planner picks based on actual imports.
- Naming of new authority brands (e.g., `MechanicalCommandRequest`, canonicalized-path brand) — planner's call.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 12 Seed
- `.planning/phases/12-authority-boundary-stabilization/12-SEED.md` — operator-supplied review findings + architecture read; verbatim source for every decision above

### Authority Boundary
- `AGENTS.md` §"Authority Tiers" (≈line 26) — current tier table; needs reconciliation per D-11/D-12
- `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts:76` — current authority-boundary contract; needs reconciliation per D-11/D-12
- `packages/admission-e2e/src/tier-conformance.contract.test.ts` (Phase 10.1.7 output) — extension target for D-12

### Subprocess + Repo Runtime
- `packages/repo/src/subprocess-runner.ts:33` and `:85` — env-default sites flipping in D-06
- `apps/factory-cli/src/main.ts:1892` — raw `spawn` removed in D-03 / D-14
- `apps/factory-cli/src/main.ts:1198` — `PROTOSTAR_GITHUB_TOKEN` site preserved per D-07 (token stays at library boundary)
- `apps/factory-cli/src/wiring/review-loop.ts:214` — `configuredMechanicalCommands` rewrite per D-03
- `packages/lmstudio-adapter/src/factory-config.schema.json:187` — mechanical argv schema; rewrite per D-03/D-04
- `packages/repo/src/apply-change-set.ts:65` `:82` `:114` — invariant enforcement per D-09/D-10

### Mechanical-checks no-net violation
- `packages/mechanical-checks/src/no-net.contract.test.ts:43` — current contract; preserved unchanged per D-02
- `packages/mechanical-checks/src/diff-name-only.ts:1` — `isomorphic-git` import that moves to `@protostar/repo` per D-02
- `packages/mechanical-checks/package.json:36` — tier=`pure`; preserved unchanged per D-02

### Confirmed-intent schema cascade
- `packages/admission-e2e/src/signed-intent-1-5-0.test.ts` (and 1.5.0 fixtures across `packages/admission-e2e/src/`) — fixture cascade target for D-04 (1.5.0 → 1.6.0)
- Search pattern: `grep -rn '"1\.5\.0"' packages/ apps/` — full cascade scope

### Verify gate parity
- `package.json:11` — root `verify` script (collapsed into one per D-01)
- `.github/workflows/verify.yml:31` — CI `verify:full` invocation (becomes plain `verify` per D-01)

### Prior phase context
- `.planning/phases/10.1-boundary-hygiene-pass/10.1-CONTEXT.md` — tier classification approach Phase 12 builds on
- `.planning/phases/03-repo-runtime-sandbox/` — `@protostar/repo` allowlist + per-command schema patterns
- `.planning/phases/02-authority-governance-kernel/` — capability-envelope brands and confirmed-intent signing
- `.planning/phases/07-delivery/` — `PROTOSTAR_GITHUB_TOKEN` flow and Octokit/`onAuth` boundary

### Project-level
- `.planning/PROJECT.md` — authority boundary lock (only `apps/factory-cli` + `packages/repo` may touch fs)
- `.planning/STATE.md` §"Key Locks" — dark-factory invariants (no progress logs, refusals as evidence)
- `.planning/ROADMAP.md` §"Phase 12" — goal and dependency declaration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`@protostar/repo` subprocess runner pattern** — already does spawn array-form, pre-spawn validation, stream-to-file, rolling tail, flush-on-exit, timeout. Needs only env-default change (D-06) + secret redaction filter (D-08).
- **Per-command schemas in `@protostar/repo`** — established for `git` / `pnpm` / `node` / `tsc` (Phase 3 plan 03-08). New mechanical commands extend the same shape.
- **Branded admission decisions** — Phase 2 brand pattern (`AdmittedPlan`, `ConfirmedIntent`, `SignedAdmissionDecision`) is the template for `MechanicalCommandRequest` and the path-canonicalized `PatchRequest` brand (D-09).
- **Fixture cascade tooling** — Phase 4 plan 04-07 + Phase 7 plan 07-01 already did 1.x → 1.x+1 cascades. Same sequence applies to 1.5.0 → 1.6.0.
- **`tier-conformance.contract.test.ts`** — Phase 10.1.7 already reads every manifest's `protostar.tier`. Extension to AGENTS.md + authority-boundary contract is additive.
- **Phase 10 dogfood loop** — runs the factory end-to-end on `protostar-toy-ttt`. Re-running it satisfies D-15.

### Established Patterns
- **No `node:fs` in domain packages** — only `apps/factory-cli` + `packages/repo` touch the filesystem. D-02 honors this by moving `isomorphic-git` consumption to `@protostar/repo`.
- **Refusal evidence as artifacts** — every authority refusal writes a typed JSON artifact with full evidence shape. New mechanical-command refusals (D-03) follow the same pattern.
- **Schema bumps cascade fixtures** — bumping `confirmedIntent.schemaVersion` requires re-signing every signed-intent fixture in `packages/admission-e2e/src/`. This is mechanical but exhaustive (Phase 7 plan 07-01 did 19 files).
- **Two-key launch (`--trust` + `--confirmed-intent`)** — Phase 2 plan 02-08. Schema 1.6.0 (D-04) flows through the same launch path; no new flags needed.
- **Light wiring split in `apps/factory-cli/src/wiring/`** — `wiring/review-loop.ts` already exists. Adding `wiring/command-execution.ts` and `wiring/delivery.ts` matches the established convention.

### Integration Points
- `apps/factory-cli/src/main.ts` — three wiring concerns extracted (D-14); `runFactory` and the executor wiring keep their orchestration shape.
- `packages/repo/src/index.ts` — exports new `runMechanicalCommand` (or extension of existing subprocess API) consumed by `wiring/command-execution.ts`.
- `packages/authority/src/internal/` — schema 1.6.0 capability-envelope extension lands here, mirroring how 1.5.0's `delivery.target` was added in Phase 7 plan 07-01.
- `packages/admission-e2e/src/contracts/` — three new contract tests land: mechanical-via-repo, env-empty-default, applyChangeSet-path-op-diff-mismatch, plus the secret-leak attack test (D-15).

</code_context>

<specifics>
## Specific Ideas

- **The `b` collapse in D-01 is opinionated** — operator explicitly prefers slower local feedback over divergence risk. Researcher should not propose a tiered-verify variant during research.
- **D-04 schema bump is non-negotiable.** The closed-allowlist + capability-bound posture is the whole point — making the mechanical command a first-class capability is what makes the authority surface honest. Don't propose option (b) "reuse subprocess.allow" during planning.
- **D-07 is a structural assertion**, not an aspiration. The contract test pinning that `inheritEnv` cannot include `PROTOSTAR_GITHUB_TOKEN` is the strongest defense; planner must include it.
- **Secret-leak attack test (D-15)** is a deliberate offensive test, not a smoke test. Target repo's mechanical command actually echoes `$PROTOSTAR_GITHUB_TOKEN`; the assertion is on the absence of the token shape in evidence. Researcher should pin token-shape detection to the same patterns used in the redaction filter (D-08) so the test cannot pass via filter blindness.

</specifics>

<deferred>
## Deferred Ideas

- **`packages/planning/src/index.ts` (5701 LOC) decomposition** — flagged in the architecture read as the next pressure point but explicitly deferred (D-14). Candidate for Phase 13.
- **Generating AGENTS.md table from manifests (Q-12 option c)** — single-source-of-truth code-gen. Cleaner than the assertion-based reconciliation D-12, but more invasive. Revisit if D-12's contract test becomes flaky.
- **Read-only bind-mount for mechanical command cwd (Q-05 option b)** — stronger than D-05's status-quo workspace cwd. Adds OS-level sandbox dependencies; defer until a documented attack motivates it.
- **Token-bearing AuthorizedOp brand (Q-07 option c)** — type-system-enforced secret routing. Currently overkill since D-07 keeps the token at the library boundary entirely; revisit if a future capability needs to pass secrets to a subprocess.

</deferred>

---

*Phase: 12-authority-boundary-stabilization*
*Context gathered: 2026-04-29*
