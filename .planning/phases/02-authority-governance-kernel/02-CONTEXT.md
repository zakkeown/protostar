# Phase 2: Authority + Governance Kernel — Context

**Gathered:** 2026-04-27
**Source:** `02-QUESTIONS.json` (18/18 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

Settle precedence and enforce it before any real mutation. Capability envelope becomes a runtime check (not just an admission-time validation). `WorkspaceRef.trust` is consumed, not just declared. Every gate (intent, planning, capability, repo-scope, workspace-trust) emits a schema-versioned admission-decision artifact. `ConfirmedIntent` carries a real signature (hash of intent + resolved envelope + policy snapshot) that downstream stages verify before acting.

**Blast radius:** Contracts only. No real I/O lands in this phase. Phase 3 wires the actual workspace clone/branch/write that consumes these guards.

**Requirements:** GOV-01, GOV-02, GOV-03, GOV-04, GOV-05, GOV-06.

</domain>

<decisions>

## Precedence + Conflict Resolution (GOV-01)

### Q-01 — Home for the precedence kernel
**Decision:** New `packages/authority` workspace package.
**Rationale:** Aligns with the AGENTS.md "authority boundary" vocabulary. Keeps `@protostar/policy` from becoming a god-package (it already owns ambiguity, capability, repo-scope, archetype). Authority is a clean steward boundary; policy/intent become consumers.
**Status:** Decided.

### Q-02 — Conflict resolution algorithm
**Decision:** Intersection / strictest-wins. Every tier (confirmed intent, policy, repo instructions, operator settings) is a constraint set; final envelope = intersection. No tier can widen what a higher tier allowed.
**Rationale:** Matches the capability-envelope mental model already established in `packages/intent/src/capability-admission.ts`. Cannot widen by definition. Conservative posture matches dark-factory autonomy.
**Note for planner:** Conflict reporting must enumerate every tier that contributed a denial — "who denied" may not be unique under intersection, so evidence captures the full set.
**Status:** Decided.

### Q-03 — Repo-instruction source file
**Decision:** New `.protostar/repo-policy.json` — schema-versioned, machine-readable, separate from `AGENTS.md` (which stays prose-for-humans).
**Rationale:** Avoids the parsing-policy-out-of-prose ambiguity. Adds one well-defined file convention that can carry a `schemaVersion` and evolve independently of AGENTS.md.
**Status:** Decided.

### Q-04 — Where conflict evidence is persisted
**Decision:** Both — nested summary + separate detail.
- Nested in `admission-decision.json`: `precedenceResolution: { status: "no-conflict" | "resolved" | "blocked-by-tier" }` summary.
- Separate `precedence-decision.json` artifact emitted when status ≠ "no-conflict" with full tier-by-tier evidence.
**Rationale:** Keeps the common-case admission artifact small; full evidence lives in its own file when actually relevant.
**Status:** Decided.

## Capability Envelope Runtime Enforcement (GOV-02)

### Q-05 — Per-boundary enforcement shape
**Decision:** Branded operation types. Each boundary accepts only branded inputs (`AuthorizedWorkspaceOp`, `AuthorizedSubprocessOp`, `AuthorizedNetworkOp`, `AuthorizedBudgetOp`); the only way to get the brand is through the authority kernel's check.
**Rationale:** Mirrors Phase 1's `ConfirmedIntent` / `AdmittedPlan` pattern (Q-13b/c/d locks). Compile-time guarantee — boundaries cannot forget to check. Highest ceremony, strongest assurance.
**Note for planner:** Each authorized-op brand needs a module-private mint, a single producer (the kernel), and a contract test in `packages/admission-e2e` pinning the public surface to one mint per boundary.
**Status:** Decided.

### Q-06 — Subprocess + network — Phase 2 scope
**Decision:** Contracts + helpers only. Phase 3 wires real I/O through them.
**Rationale:** ROADMAP frames Phase 2 as "Contracts only". The only "real boundary" enforcement test in Phase 2 is the workspace-trust block (GOV-04 success criterion). Subprocess + network guards exist as typed contracts; Phase 3's repo runtime invokes them when implementing real clone/branch/write.
**Status:** Decided.

### Q-07 — Budget enforcement model
**Decision:** Per-boundary trackers reporting to a central aggregator.
**Rationale:** Each boundary (network, subprocess, judge-panel) has its own counter; the aggregator polls/sums to evaluate the envelope-level budget. Boundaries stay decoupled. More moving parts than a single ledger but matches the per-boundary brand pattern from Q-05.
**Status:** Decided.

## Steward / Owner Boundaries (GOV-03)

### Q-08 — Single-owner enforcement mechanism
**Decision:** Both — strict `package.json` exports + admission-e2e contract tests. Belt-and-suspenders.
**Rationale:** Mirrors Phase 1 Q-03 strategy. Exports field locks the runtime surface; contract test asserts the export shape and forbids constructor leak. Each new artifact type (admission-decision, precedence-decision, signed-intent envelope) gets the same pattern.
**Status:** Decided.

### Q-09 — Cross-stage read API shape
**Decision:** Stage-scoped client objects. e.g., `createPlanningStageReader(runDir)` returns a client with `.admittedPlan()`, `.refusal()`, etc. methods.
**Rationale:** Familiar OO grouping. Each method validates schemaVersion + brand at the read site. Slightly more ceremony to construct than free functions, but better discoverability and a single point to thread the run-directory path.
**Status:** Decided.

## Workspace Trust Enforcement (GOV-04)

### Q-10 — Where the trust check lives
**Decision:** Both — envelope-time admission + execution-time runtime check.
**Rationale:** Defense in depth. Admission catches misconfigured envelopes (the static case). Execution-time catches mid-run mutation/tampering. The Phase 2 success criterion ("denied capability produces evidence-bearing block at the authority boundary, not the execution stage") is satisfied by the admission-time check; the execution-time check is the runtime spine that GOV-02 already requires.
**Status:** Decided.

### Q-11 — CLI trust posture
**Decision:** Default `untrusted`. `--trust trusted` requires a confirmed-intent flag too — two-key launch.
**Rationale:** Highest friction; right for dark-factory posture. Operators must explicitly opt into trust AND have a confirmed intent on file. Replaces the current hardcoded `trust: "trusted"` in `apps/factory-cli/src/main.ts:307` (CONCERNS.md flagged this as the highest-impact security gap).
**Note for planner:** This forces operator-settings UX into Phase 2 to the extent of "what does `--trust trusted` look like and where is the confirmed-intent flag?" Keep the surface minimal — just the CLI flag and a refusal pathway when it's missing.
**Status:** Decided.

### Q-12 — Trust failure outcome shape
**Decision:** New `escalate` verdict (distinct from `block`) — pauses the run; operator can confirm + resume.
**Rationale:** Phase 9 (operator surface + resumability) will want resumable approvals. Adding the `escalate` outcome to the admission-decision union now is cheaper than retrofitting later. Adds state-machine complexity in Phase 2 (new admission outcome literal + persistence layer awareness).
**Note for planner:** `escalate` does NOT mean "ask the human now" in Phase 2 — it means "write an `escalate`-typed admission-decision and exit non-zero with a marker artifact". The actual resume flow lands in Phase 9.
**Status:** Decided.

## Per-Gate Admission Decision Artifacts (GOV-05)

### Q-13 — Schema unification across gates
**Decision:** Per-gate filenames (`{gate}-admission-decision.json`), shared base schema + gate-specific extension.
**Rationale:** Hybrid. Common header fields (runId, timestamp, outcome, schemaVersion, precedenceResolution) shared via a base interface; each gate's evidence is its own typed extension. Matches the per-gate-reader pattern from Q-09.
**Note for planner:** Gates to wire in Phase 2: intent (already present, extend with new fields), planning, capability, repo-scope, workspace-trust. Each gets its own schema file under `packages/{owning-package}/schema/`.
**Status:** Decided.

### Q-14 — Run-directory layout for gate decisions
**Decision:** Append-only `runs/{id}/admission-decisions.jsonl` index + per-gate detail files.
**Rationale:** Mirrors the `.protostar/refusals.jsonl` pattern from Phase 1 Q-08. JSONL gives Phase 9 operator-inspect cheap cross-gate scans; per-gate files hold the full payload for deep inspection. Symmetry argument is strong.
**Note for planner:** Existing intent-gate `admission-decision.json` (`runs/{id}/admission-decision.json`) gets renamed to `runs/{id}/intent-admission-decision.json` and the index entry is appended. Migration must preserve readability of historical run dirs (208 already accumulated per CONCERNS.md) — handle missing index gracefully in any reader code.
**Status:** Decided.

## Signed ConfirmedIntent (GOV-06)

### Q-15 — Hash primitive
**Decision:** SHA-256 via `node:crypto`. Zero new deps.
**Rationale:** Built-in. Collision-resistant. Sufficient for tamper detection. Matches the dependency-light posture (PROJECT.md "zero external runtime deps" constraint).
**Status:** Decided.

### Q-16 — Signed payload scope
**Decision:** Hash covers intent + resolved envelope + a `policySnapshotHash` reference. Two-level hash chain: signature carries the top hash; the policy snapshot is a separate artifact (`policy-snapshot.json`) referenced by hash.
**Rationale:** Detects intent tamper, envelope drift, and policy drift between admission and execution. Separating the policy snapshot keeps the signed payload small; the snapshot file itself is hash-addressable so verification is "hash this, compare". Matches GOV-06's literal "hash of intent + policy snapshot at admission time" requirement.
**Note for planner:** The "resolved envelope" is the post-precedence-intersection envelope from Q-02 — the actual capability set in force, not the intent's requested envelope.
**Status:** Decided.

### Q-17 — Where verification fires
**Decision:** Single central verifier helper — `verifyConfirmedIntentSignature(intent, policySnapshot)`. Every stage calls it; canonicalization happens once in this helper.
**Rationale:** Matches the GOV-03 admission-helper pattern (Q-09 stage-scoped readers call this verifier). One canonicalization site means one place to fix bugs, one place to upgrade canonicalForm versions.
**Note for planner:** Verifier returns a `Result<VerifiedIntent, SignatureMismatchError>` with structured evidence on mismatch (which field's hash diverged). Failure halts the run with an `escalate`-or-`block` admission-decision (Q-12).
**Status:** Decided.

### Q-18 — `SignatureEnvelope` shape
**Decision:** Add `canonicalForm: "json-c14n@1.0"` field (or equivalent versioned tag) to the existing `{ algorithm, value }` envelope reserved by Phase 1.
**Rationale:** Forward-compat headroom. If the canonicalization scheme changes (e.g., move from sorted-keys JSON to RFC 8785 JCS), the field tag changes, and verification can either fail-closed on unknown tags or look up the right canonicalizer. One more field is cheap.
**Note for planner:** Phase 1 reserved the slot at `packages/intent/src/confirmed-intent.ts:19-25` and `packages/intent/schema/confirmed-intent.schema.json`. Both must be extended with the `canonicalForm` field; the schemaVersion bumps to `1.1.0` (additive change).
**Status:** Decided.

</decisions>

<specifics>

## Specific Ideas Surfaced

- **Two-key launch posture (Q-11):** explicit `--trust trusted` AND a confirmed-intent flag is a deliberate friction surface — matches the dark-factory "humans confirm intent + review evidence; everything between runs autonomously" frame.
- **`escalate` ≠ "ask now" in Phase 2 (Q-12):** the verdict literal lands now; the resumable pause UX lands in Phase 9. Don't confuse the two.
- **Authority package naming (Q-01):** `@protostar/authority`, not `@protostar/governance`. Matches AGENTS.md vocabulary already used in CLAUDE.md and STATE.md ("authority boundary").
- **Shared admission-decision base interface (Q-13):** new common header type lives in `@protostar/authority` (likely); per-gate extensions live in their owning packages (intent, planning, repo, etc.).

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope + requirements
- `.planning/REQUIREMENTS.md` §"Phase 2 — Authority + Governance Kernel" — GOV-01..06 requirement statements
- `.planning/ROADMAP.md` §"Phase 2" — Goal, success criteria, blast-radius framing ("Contracts only")
- `.planning/PROJECT.md` §"Constraints" — dependency-light posture, authority boundary, ESM/Node 22 stack constraints

### Phase 1 locks that constrain Phase 2 implementation
- `.planning/phases/01-intent-planning-admission/01-CONTEXT.md` — Q-13b/c/d (sole-mint pattern, internal subpath helper, brand contract pattern Phase 2 mirrors for AuthorizedOp brands)
- `.planning/phases/01-intent-planning-admission/01-04-schema-version-infra-PLAN.md` — schemaVersion 1.0.0 pattern + reserved `signature: SignatureEnvelope | null` slot Phase 2 fills
- `.planning/phases/01-intent-planning-admission/01-08-refusal-artifact-layout-PLAN.md` — `runs/{id}/` + JSONL index pattern Phase 2 reuses for admission-decisions.jsonl
- `.planning/phases/01-intent-planning-admission/VERIFICATION.md` — current state of the front-door seal Phase 2 builds on

### Existing code Phase 2 extends
- `packages/intent/src/admission-decision.ts` — current `AdmissionDecisionArtifactPayload` (intent gate only); Phase 2 generalizes to base + gate-extension shape
- `packages/intent/src/confirmed-intent.ts:19-25` — reserved `SignatureEnvelope` slot Phase 2 fills (and extends with `canonicalForm` per Q-18)
- `packages/intent/schema/confirmed-intent.schema.json` — schema for the brand; Phase 2 bumps to 1.1.0 with `canonicalForm`
- `packages/intent/src/capability-admission.ts`, `capability-grant-admission.ts`, `capability-normalization.ts` — admission-time capability validators that Phase 2 extends with runtime AuthorizedOp brands
- `packages/intent/src/repo-scope-admission.ts` — repo-scope admission Phase 2 hooks into the new precedence kernel
- `packages/repo/src/index.ts:1-19` — `WorkspaceRef.trust` field Phase 2 makes load-bearing (Q-10/Q-11)
- `apps/factory-cli/src/main.ts:307` — current hardcoded `trust: "trusted"` Phase 2 removes (Q-11)
- `packages/admission-e2e/` — Phase 2 adds new contract tests for AuthorizedOp brands and precedence kernel public surface

### Architectural references
- `AGENTS.md` (repo root) — authority boundary rule + domain-first packaging (no `utils`/`agents`/`factory` catch-alls); informs `@protostar/authority` naming
- `.planning/codebase/CONCERNS.md` — flagged `WorkspaceRef.trust` as the highest-impact security gap (Q-11 closes); flagged `apps/factory-cli/src/main.ts:307` hardcoded trust
- `.planning/MEMORY.md` (`memory/` index) — dark-factory locks, ambiguity gate ≤0.2 invariant, authority boundary lock

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets
- **Brand pattern infrastructure** — Phase 1 Plan 06b shipped `mintConfirmedIntent` + `internal/test-builders` subpath + admission-e2e contract test pinning the surface. Phase 2's AuthorizedOp brands (Q-05) reuse the exact pattern: module-private mint via `unique symbol`, internal test-builder subpath, three-layer contract guard (positive keyof + negative keyof + runtime barrel leak grep).
- **Refusal triple writer** — `apps/factory-cli/src/main.ts` `writeRefusalArtifacts` (lines 605-632) writes `terminal-status.json` + per-stage artifact + appends to `refusals.jsonl`. Phase 2's per-gate admission-decision writer (Q-14) is the symmetric "admissions" version: write `{gate}-admission-decision.json` + append to `admission-decisions.jsonl`.
- **schemaVersion + JSON Schema infrastructure** — Phase 1 Plan 04 shipped `packages/{intent,planning}/schema/*.schema.json` with subpath exports + tests validating emitted artifacts. Phase 2's per-gate schemas plug into this infrastructure unchanged.
- **`internal/brand-witness.ts` subpath pattern** — Phase 1 used this for the admission-e2e contract test. Phase 2's AuthorizedOp brands ship a similar witness for each boundary brand.

### Established Patterns
- **Module-private mint, sole public producer** — locked by Q-13b for `ConfirmedIntent`. Phase 2 extends to `AuthorizedWorkspaceOp`, `AuthorizedSubprocessOp`, `AuthorizedNetworkOp`, `AuthorizedBudgetOp`, `PrecedenceDecision`, `SignedAdmissionDecision`.
- **Stage-scoped reader pattern** (new — established by Q-09) — every stage that consumes prior artifacts gets a typed reader factory. Phase 2 ships the first instance (`createAuthorityStageReader`); Phase 3+ follow the same shape.
- **Admission helper as the only public producer** — every brand has a single public mint function and a contract test pins it. Phase 2 instantiates this for each new brand.
- **Authority boundary lock** — only `apps/factory-cli` + `packages/repo` may touch the filesystem. `@protostar/authority` is pure logic + types; the artifact writer (admission-decisions.jsonl, precedence-decision.json) lives in factory-cli.

### Integration Points
- **`packages/policy/src/admission.ts`** — currently re-exports promotion-side from `@protostar/intent`; Phase 2 adds `authorizeFactoryStart` consumption of the new precedence kernel.
- **`apps/factory-cli/src/main.ts`** — `runFactory` adds: precedence-kernel call before each gate, signed-intent verifier call at execution boundary (Q-17), per-gate admission-decision writes, `--trust` CLI flag + escalate-vs-block branching.
- **`packages/repo/src/index.ts`** — `WorkspaceRef.trust` becomes a real signal consumed by `assertTrustedWorkspaceForGrant` (Q-10); does NOT add I/O (Phase 3's job).
- **`packages/admission-e2e/`** — new contract tests pinning every AuthorizedOp brand's public surface, the precedence kernel's public surface, and the signed-intent verifier's single-helper boundary.

</code_context>

<deferred>

## Deferred Ideas

- **Real subprocess allowlist + network egress filter (Q-06 option c):** rejected for Phase 2; lands in Phase 3 (subprocess) and Phase 6/7 (network).
- **Asymmetric signature (private key + public verify) instead of HMAC:** out of scope. SHA-256 hash is sufficient for tamper detection; full asymmetric signing is a v1.0 problem if it ever becomes needed (no v1 requirement asks for it).
- **`AGENTS.md` parsing for repo policy (Q-03 option a):** rejected; `.protostar/repo-policy.json` is the structured source of truth. AGENTS.md remains prose-for-humans.
- **Adaptive precedence (per-rule precedence — Q-02 option c):** rejected. Intersection / strictest-wins is sufficient for v1.
- **Operator-settings UX beyond `--trust trusted` flag:** Phase 9 (Operator Surface + Resumability) owns the broader operator-config story.
- **Resumable approval flow for `escalate` verdict (Q-12):** Phase 9 wires the actual resume; Phase 2 just emits the verdict + marker artifact.
- **`--trust trusted` confirmed-intent flag UX:** Phase 2 ships the requirement; the precise flag name and operator workflow can be refined in Phase 9.

</deferred>

---

*Phase: 02-authority-governance-kernel*
*Context gathered: 2026-04-27 via /gsd-discuss-phase --power*
*All 18 questions answered; next step `/gsd-plan-phase 2`*
