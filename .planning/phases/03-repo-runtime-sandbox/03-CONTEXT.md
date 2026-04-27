# Phase 3: Repo Runtime + Sandbox — Context

**Gathered:** 2026-04-27
**Source:** `03-QUESTIONS.json` (18/18 answered, --power mode)
**Status:** Ready for research + planning

<domain>
## Phase Boundary

The repo boundary becomes real. `packages/repo` actually clones, branches, reads/writes within caps, applies patches atomically, and rolls back on failure. Phase 2's `AuthorizedWorkspaceOp` / `AuthorizedSubprocessOp` brands stop being contracts and start gating real I/O. The dark factory begins touching matter.

**Blast radius:** First real I/O — clone, branch, write, subprocess. Failures here can corrupt a target repo, leak credentials, or escape the workspace.

**Requirements:** REPO-01, REPO-02, REPO-03, REPO-04, REPO-05, REPO-06, REPO-07, REPO-08, REPO-09.

</domain>

<decisions>

## Git Mechanics (REPO-01, REPO-02)

### Q-01 — Git library choice
**Decision:** `isomorphic-git` (pure JS).
**Rationale:** Single npm dep, no native bindings, programmatic API for clone/branch/apply. Operator does not need a system `git` binary. Pure-JS argv discipline is moot since we go through the library API rather than spawning git.
**Note for planner:** **This breaks the PROJECT.md "zero external runtime deps" lock.** Add `isomorphic-git` as the *first* runtime dep on `@protostar/repo` and update PROJECT.md to acknowledge the carve-out (or rephrase the lock as "minimal external runtime deps"). Pin an exact version; vendor type defs as needed. Patch-apply edge cases historically lag git proper — Phase 3 tests must exercise rename-detection and binary-file paths explicitly.
**Status:** Decided.

### Q-02 — Workspace storage location
**Decision:** Configurable — `workspaceRoot` field in `.protostar/repo-policy.json` with `.protostar/workspaces/{runId}/` default.
**Rationale:** Default is discoverable and symmetric with `.protostar/runs/`. Operator can redirect to OS temp dir, an external SSD, etc. Configurable from day one avoids retrofitting later.
**Note for planner:** Validate at config-load that `workspaceRoot` is *outside* the source repo (no recursive clones). Add `.protostar/workspaces/` to `.gitignore`. Repo-policy schema gets a new `workspaceRoot?: string` field; document the default-resolution behavior.
**Status:** Decided.

### Q-03 — Workspace lifecycle
**Decision:** Fresh clone per run, no reuse.
**Rationale:** Bulletproof isolation. Phase 5/6 review loops cannot be poisoned by prior runs. For the v0.1 cosmetic-tweak loop on a small Tauri toy repo, clone cost is cheap. Pool optimization is a Phase 10+ concern if measured cost actually hurts.
**Note for planner:** This decision **collapses Q-11**: rollback is `rm -rf {workspaceRoot}/{runId}`. No git stash/reset gymnastics needed. A failed run leaves a tombstone workspace dir for inspection until cleanup.
**Status:** Decided.

### Q-04 — Clone authentication
**Decision:** Both — `RepoTarget.credentialRef` env-var token preferred; system git credential helper / SSH agent as fallback when ref is unset.
**Rationale:** Explicit-first matches REPO-01's literal "URL + credential ref" wording and gives admission-decision evidence ("credentialRef used: GITHUB_PAT"). System fallback keeps developer-machine ergonomics for unauthenticated public clones.
**Note for planner:** Admission decision must record *which path authenticated* — `auth.mode: "credentialRef" | "system" | "anonymous"` plus `auth.credentialRef?: string` (name only, never value). `.env.example` (Q-17) lists the env vars referenced by `credentialRef`. Two code paths but the decision boundary is clear: ref present → use ref; ref absent → defer.
**Status:** Decided.

## File & Subprocess Caps (REPO-03, REPO-04)

### Q-05 — File-path cap enforcement shape
**Decision:** Both — mint-time cap-check on `AuthorizedWorkspaceOp` *and* repo-owned FS adapter takes the brand and re-canonicalizes at entry.
**Rationale:** Belt-and-suspenders. Mint-time canonicalize+envelope-check produces the brand (Phase 2 pattern). Adapter re-canonicalizes at use to catch TOCTOU races on resolved paths and stale brands. Maximum assurance at the first-real-I/O boundary; cost is acceptable since fs ops aren't hot.
**Note for planner:** FS adapter lives in `@protostar/repo`, takes `(op: AuthorizedWorkspaceOp, ...args)` for every read/write call. The brand carries the canonicalized path; adapter re-resolves and asserts equality before touching disk. Symlink rule (Q-06) lives at the adapter layer.
**Status:** Decided.

### Q-06 — Symlink handling
**Decision:** Refuse all symlinks inside workspace.
**Rationale:** Strictest. `lstat` every path; any symlink → refusal artifact at the adapter. Targets repos shouldn't ship workspace-internal symlinks; if they do, operator can opt-in via repo-policy (deferred). For our v1 scope (cosmetic tweaks on a Tauri toy), symlinks aren't expected anywhere except `node_modules`, which lives outside the change-set.
**Note for planner:** Pre-clone target-repo audit step: walk the post-clone tree once, refuse-and-mark-untrusted if any symlink found. Refusal artifact carries the offending path. Reads of `node_modules/` are allowed because they don't intersect change-set paths — the rule is "no symlinks in any path the change-set touches"; a tree-wide refusal at clone time is the simplest enforcement and we accept the false positives for v1.
**Status:** Decided.

### Q-07 — Subprocess allowlist source
**Decision:** Hardcoded baseline in `@protostar/repo` (git, pnpm, node, tsc) + `.protostar/repo-policy.json` `commandAllowlist: [...]` can extend, never remove.
**Rationale:** Baseline is always safe (factory needs git/pnpm/node to function); operators can add `cargo`/`make`/etc. for target-specific build tools. "Cannot remove" is the right v1 default — removing baseline commands would brick the factory; if a target needs that, deferred to a future "lock-down" mode.
**Note for planner:** Baseline list lives as a const in `@protostar/repo/src/subprocess-allowlist.ts`. Repo-policy schema adds `commandAllowlist?: string[]`. Authority kernel intersects: effective = baseline ∪ policy-extension. Admission decision records the effective allowlist for the run.
**Status:** Decided.

### Q-08 — Subprocess argv validation
**Decision:** Both — outer pattern guard (refuse args starting with `-` unless flag is whitelisted; ref-like args match `[a-zA-Z0-9._/-]+`; force `--` separator before user-controlled values) + inner per-command schema (allowed subcommands, allowed flags per subcommand).
**Rationale:** Defense in depth at the highest-blast-radius boundary. Pattern guard catches generic flag-injection (`--upload-pack=...`); per-command schema catches subtle command-specific abuse. Most ceremony, but this is the boundary that ships the first real subprocess in factory history.
**Note for planner:** Schemas live in `@protostar/repo/src/subprocess-schemas/{git,pnpm,node,tsc}.ts`. Each schema exports `{ allowedSubcommands: string[], allowedFlags: Record<subcommand, string[]>, refValuePattern: RegExp }`. Pattern guard is shared across schemas. The runner mints `AuthorizedSubprocessOp` only after both layers pass.
**Status:** Decided.

### Q-09 — Subprocess stdout/stderr capture
**Decision:** Stream to file in run dir + tail last N KB into the admission-decision evidence.
**Rationale:** Best of both. Full log on disk at `runs/{id}/subprocess/{n}-stdout.log` for Phase 5/6 review; admission decision carries the tail (default last 8 KB stdout, 4 KB stderr) for inline inspection. Catches both "huge output" (no memory blowup) and "I want to see what failed" (no need to chase to disk).
**Note for planner:** Subprocess record schema: `{ argv, exitCode, durationMs, stdoutPath, stderrPath, stdoutTail, stderrTail, stdoutBytes, stderrBytes }`. Tail size lives in repo-policy as `subprocessTailBytes` (default 8192). Streaming write must flush on exit so post-mortem readers see the complete log.
**Status:** Decided.

## Patch Apply + Rollback (REPO-05)

### Q-10 — Patch format
**Decision:** Unified diff text + per-file pre-image SHA-256; apply via isomorphic-git's apply with hash check.
**Rationale:** Unified diff is what LLM coders emit naturally; pre-image hash catches concurrent mutation and base drift. If pre-image hash mismatches, refuse to apply that file (and roll back per Q-12 best-effort policy).
**Note for planner:** Phase 4's `ExecutionAdapter` produces `RepoChangeSet.patches: Array<{ path, op, diff, preImageSha256 }>`. The repo runner reads pre-image, hashes, compares, then applies. `isomorphic-git` apply API does not natively check hashes; we do the check ourselves before calling apply. Add a contract test that mutates pre-image between hash and apply and asserts refusal.
**Status:** Decided.

### Q-11 — Atomicity / rollback mechanism
**Decision:** Trust Q-03 fresh-clone-per-run as the rollback; on failure, the workspace dir is the tombstone — clean it up on success or after operator inspection.
**Rationale:** Q-03's fresh-clone-per-run makes "rollback" definitionally `rm -rf {workspaceRoot}/{runId}`. Atomic by definition. No git stash, no snapshot tags, no copy-on-write. Simplest possible mechanism enabled by an upstream choice.
**Note for planner:** Cleanup policy: successful run → workspace deleted at end (or after delivery in Phase 7). Failed run → workspace retained for N hours / until operator-resume / explicit cleanup; default 24h, configurable in repo-policy. Document the tombstone semantics in CONCERNS.md so disk-fill on a stuck-run streak is understood.
**Status:** Decided.

### Q-12 — Rollback granularity
**Decision:** Best-effort — apply what works, report failures as evidence.
**Rationale:** Combined with Q-10 (per-file pre-image hashes) and Q-11 (workspace-as-tombstone), best-effort is safe: each file's success/failure is hashed and evidenced; the review pile (Phase 5) sees a partial diff and can decide to repair or escalate. Pure all-or-nothing would throw away a 4-of-5 successful change that the repair loop could finish.
**Note for planner:** `applyChangeSet` returns `Array<{ path, status: "applied" | "skipped-hash-mismatch" | "skipped-error", error? }>`. Caller (Phase 5 review loop) interprets the result. The "is the worktree consistent" question lives in the change-set result, not in a binary throw. Contract test: a 3-of-5 patch where patch 3 fails — assert patches 1, 2, 4, 5 applied and 3 evidenced.
**Status:** Decided.

## Workspace Hygiene (REPO-06, REPO-07)

### Q-13 — Dirty-worktree detection
**Decision:** `git status --porcelain --untracked-files=no` non-empty = dirty.
**Rationale:** Tracked-file modifications block; untracked files don't. Combined with Q-03 fresh-clone-per-run, untracked stragglers from a prior run cannot exist anyway — but the `--untracked-files=no` posture is defensive against operator-mode workflows where the workspace might pre-exist.
**Note for planner:** Detection runs at *start* of a run (post-clone, pre-patch) and after patch-apply (to confirm Phase 5/6 reviewed exactly the changes the executor produced). Through `isomorphic-git`'s `statusMatrix` API rather than shelling out.
**Status:** Decided.

### Q-14 — Dirty-worktree override flag
**Decision:** New field `capabilityEnvelope.workspace.allowDirty: boolean` (default `false`).
**Rationale:** Matches REPO-06's literal "capability envelope explicitly allows it" wording. Default false for safe v1 posture; operator must explicitly grant it via the confirmed-intent capability envelope.
**Note for planner:** This is an additive bump to the confirmed-intent schema (currently 1.1.0 from Phase 2 Q-18) → 1.2.0. `capabilityEnvelope.workspace` is an existing object; add the new field and default it to `false` in the unmarshal path. Update the schema, the brand mint, the policy/admission validators, and the test fixtures that exercise the workspace cap.
**Status:** Decided.

### Q-15 — workspaceRoot resolution helper home
**Decision:** New tiny `@protostar/paths` package.
**Rationale:** User-locked despite AGENTS.md "avoid generic utils packages" guidance. Operator-chosen carve-out: path-resolution is a primitive that doesn't fit cleanly under any existing domain (intent, planning, execution, review, repo) and pulling factory-cli into a `@protostar/repo` dep just for `resolveWorkspaceRoot` was rejected.
**Note for planner:** **AGENTS.md tension:** flag in CONCERNS.md and add a short note to AGENTS.md carving out `@protostar/paths` as the lone exception with a clear scope ceiling: "deterministic path resolution only — no I/O, no business logic; if it grows beyond `pnpm-workspace.yaml`-walking, split it." Package exposes `resolveWorkspaceRoot(): string` and replaces the broken `INIT_CWD ?? cwd()` at `apps/factory-cli/src/main.ts:150`. Both `@protostar/repo` and `apps/factory-cli` import from `@protostar/paths`.
**Status:** Decided.

## Dependency Hygiene (REPO-08, REPO-09)

### Q-16 — @dogpile/sdk resolution
**Decision:** Publish `@dogpile/sdk` to npm and pin a version.
**Rationale:** User confirmed package already exists at https://www.npmjs.com/package/@dogpile/sdk — no cross-repo coordination needed; just remove the `link:` and pin the published version.
**Note for planner:** Verify the published version's surface matches what `packages/dogpile-types` shim currently encodes (AgentSpec, DogpileOptions, budget, convergence, firstOf). Replace `"@dogpile/sdk": "link:../../../dogpile"` in `packages/dogpile-adapter/package.json` with a pinned version. Decide fate of `packages/dogpile-types` — likely keep as the *contract* shim (re-export types from `@dogpile/sdk`) so the adapter pattern stays one layer of indirection from the upstream package.
**Status:** Decided.

### Q-17 — .env.example scope
**Decision:** Forward-look — enumerate Phase 4–7 vars now.
**Rationale:** Matches REPO-09 literal wording. Lock the env-var names early so Phase 4–7 just reads them; avoids `.env.example` churn across phases.
**Note for planner:** `.env.example` ships with: `GITHUB_PAT` (Phase 7 delivery + Phase 3 clone-auth via credentialRef), `LM_STUDIO_ENDPOINT` (Phase 4), `LM_STUDIO_CODER_MODEL` (Phase 4, default `Qwen3-Coder-Next-MLX-4bit`), `LM_STUDIO_JUDGE_MODEL` (Phase 6/8, default `Qwen3-80B-Judge-MLX`). Each var gets a one-line comment naming the phase that consumes it. Where a default value is reasonable, write it inline as `VAR=default-value`; otherwise leave empty with a comment. No commented-out "reserved" section — names that aren't used yet just get `# (Phase N)` annotations.
**Status:** Decided.

## Sandbox Target & Testing

### Q-18 — Sacrificial repo for tests
**Decision:** Test helper in `packages/repo/internal/test-fixtures` that builds the repo programmatically.
**Rationale:** Mirrors the Phase 1/2 `internal/brand-witness.ts` subpath pattern. `buildSacrificialRepo({ commits, branches, dirtyFiles, symlinks })` returns a path to a fresh per-test git repo. Most flexible for the per-criterion variations — clone, branch, write, patch, rollback, dirty-refusal, symlink-refusal each need different starting states.
**Note for planner:** Helper lives at `packages/repo/internal/test-fixtures/build-sacrificial-repo.ts`; subpath export `./internal/test-fixtures` in `packages/repo/package.json`. Cleanup via `t.after(() => rm -rf)`. Repo built via isomorphic-git's `init`/`commit`/`branch` APIs (consistent with Q-01). Output to `os.tmpdir()/protostar-test-{nanoid}/` for OS-cleanup safety. Phase 3 success-criterion tests live in `packages/repo/src/*.test.ts` and consume this helper.
**Status:** Decided.

</decisions>

<specifics>

## Specific Ideas Surfaced

- **Q-01 breaks the zero-deps lock — explicit user choice.** PROJECT.md "zero external runtime deps" must be updated. `isomorphic-git` is the first ever runtime dep on `@protostar/repo`. Plan must add a step to update PROJECT.md and CONCERNS.md.
- **Q-03 collapses Q-11.** Fresh-clone-per-run reduces "rollback" to `rm -rf`. No stash, no snapshot tags. Plan must document this dependency in case Q-03 is revisited.
- **Q-15 contradicts AGENTS.md.** New `@protostar/paths` package needs a carve-out clause in AGENTS.md and a scope ceiling: path resolution only, no I/O, no business logic.
- **Q-16 already exists on npm.** Verify surface match before pinning; `packages/dogpile-types` shim role to be re-evaluated (likely re-export from upstream rather than duplicate types).
- **Q-14 schema bump:** confirmed-intent schema 1.1.0 → 1.2.0 (additive `capabilityEnvelope.workspace.allowDirty`). Updates spread across schema file, brand mint, policy validators, and admission test fixtures.
- **Q-09 tail sizes are config knobs.** `subprocessTailBytes.stdout` (default 8192) and `subprocessTailBytes.stderr` (default 4096) live in `repo-policy.json`.
- **Q-04 admission-decision auth field shape:** `auth.mode: "credentialRef" | "system" | "anonymous"` + `auth.credentialRef?: string` (name only).
- **Q-08 schemas per command:** `git`, `pnpm`, `node`, `tsc` baseline schemas. Each schema is a typed object, not free-form regex.
- **Q-07 baseline allowlist enforcement is intersect-with-union:** baseline always allowed; repo-policy may add. Authority kernel intersection from Phase 2 still applies for downgrades from operator settings.

</specifics>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 3 source-of-truth
- `.planning/ROADMAP.md` — Phase 3 success criteria (lines 82–96)
- `.planning/REQUIREMENTS.md` — REPO-01 through REPO-09 (lines 38–46)
- `.planning/PROJECT.md` — "zero external runtime deps" lock (must update for Q-01)

### Existing code Phase 3 extends
- `packages/repo/src/index.ts:1-24` — current 24-line stub; Phase 3 expands into the actual runtime
- `packages/repo/src/workspace-trust-runtime.ts` (new from Phase 2) — `assertWorkspaceTrust` predicate Phase 3 calls before any FS op
- `packages/repo/package.json` — currently depends on `@protostar/authority` only; Phase 3 adds `isomorphic-git` and `@protostar/paths`
- `packages/dogpile-adapter/package.json:21` — `"@dogpile/sdk": "link:../../../dogpile"` Phase 3 replaces with a pinned npm version (Q-16)
- `apps/factory-cli/src/main.ts:150` — broken `INIT_CWD ?? cwd()` Phase 3 replaces via `@protostar/paths.resolveWorkspaceRoot()` (Q-15)
- `apps/factory-cli/src/main.test.ts:2` — existing `node:child_process` spawn usage; informs subprocess-runner contract tests
- `packages/intent/schema/confirmed-intent.schema.json` — schemaVersion 1.1.0 → 1.2.0 for `workspace.allowDirty` (Q-14)
- `packages/intent/src/confirmed-intent.ts` — `capabilityEnvelope.workspace` shape extended for `allowDirty` (Q-14)

### Phase 2 patterns Phase 3 reuses
- `AuthorizedWorkspaceOp` / `AuthorizedSubprocessOp` brands from Phase 2 Q-05 — Phase 3 wires the actual mint sites and FS adapter consumers
- Per-gate admission decision pattern (Phase 2 Q-13) — Phase 3 emits `repo-runtime-admission-decision.json` per run
- Stage-scoped reader pattern (Phase 2 Q-09) — Phase 3 may add `createRepoRuntimeStageReader` for downstream phases
- `internal/brand-witness.ts` subpath pattern (Phase 1/2) — Phase 3's `internal/test-fixtures` follows the same export discipline (Q-18)
- `.protostar/refusals.jsonl` triple-write pattern (Phase 1/2) — Phase 3's per-file patch-apply failures append here

### Architectural references
- `AGENTS.md` — authority boundary; "side effects belong behind repo, execution, or caller-owned tool adapters"; no generic-utils packages (Q-15 carve-out needed)
- `.planning/codebase/CONCERNS.md` — `packages/repo` is essentially empty; `INIT_CWD ?? cwd()` is broken; sibling `link:` for `@dogpile/sdk` blocks fresh clones; subprocess injection risk via PR title / branch name
- `.planning/MEMORY.md` — dark-factory locks (cosmetic-tweak loop, LM Studio Qwen, zero-deps posture)
- `.planning/phases/02-authority-governance-kernel/02-CONTEXT.md` — Phase 2 brand patterns Phase 3 consumes

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets
- **Phase 2 brand mint pattern** — `AuthorizedWorkspaceOp` and `AuthorizedSubprocessOp` already minted in `@protostar/authority`. Phase 3 wires the *consumers* (FS adapter, subprocess runner) and verifies via the existing brand-witness contract test.
- **Phase 1 schema-versioning infra** — `packages/{intent,planning}/schema/*.schema.json` + subpath exports + emitted-artifact validation. Phase 3 adds `packages/repo/schema/repo-runtime-admission-decision.schema.json` plugged into the same infra unchanged.
- **Phase 1 refusal triple-writer** — `apps/factory-cli/src/main.ts` `writeRefusalArtifacts` (lines 605-632). Phase 3's per-file patch-apply failures and per-op cap denials append to `refusals.jsonl` via the same path.
- **`internal/test-fixtures` subpath pattern** (new — established here, mirrors `internal/brand-witness`) — programmatic fixture builders in `packages/repo/internal/test-fixtures/`.

### Established Patterns
- **Authority boundary lock** — `@protostar/repo` is one of two FS authorities (the other is `apps/factory-cli`). Phase 3 expands `@protostar/repo`'s FS surface; nothing else may add FS calls.
- **Belt-and-suspenders mint + adapter check** (new — Q-05) — boundaries that issue brands AND boundaries that consume brands both validate. Phase 3 is the first instance.
- **Module-private mint, sole public producer** — Phase 1/2 lock continues; Phase 3's `AuthorizedWorkspaceOp`/`AuthorizedSubprocessOp` mints stay in `@protostar/authority` (Phase 2's home), Phase 3 only consumes.
- **Stage-scoped reader pattern** — Phase 2 Q-09. Phase 3 may add `createRepoRuntimeStageReader` if downstream stages need read access to repo-runtime artifacts.

### Integration Points
- **`packages/repo/src/index.ts`** — adds `cloneWorkspace`, `branchFromBaseSha`, `applyChangeSet`, `dirtyWorktreeStatus`, FS adapter (`readFile`, `writeFile`, `deleteFile` accepting `AuthorizedWorkspaceOp`), subprocess runner (`runCommand` accepting `AuthorizedSubprocessOp`).
- **`apps/factory-cli/src/main.ts`** — `runFactory` adds: `resolveWorkspaceRoot()` call (Q-15) replacing line 150; clone step before any execution; per-run subprocess-runner instantiation; cleanup-on-success / tombstone-on-failure (Q-11).
- **`packages/dogpile-adapter/package.json`** — `link:` removed; pinned `@dogpile/sdk` version added (Q-16).
- **`packages/intent/`** — confirmed-intent schema bump to 1.2.0 with `capabilityEnvelope.workspace.allowDirty` (Q-14); brand mint and validators updated.
- **`packages/admission-e2e/`** — new contract tests: dirty-worktree refusal evidence shape, symlink refusal evidence shape, subprocess-allowlist refusal evidence shape, patch-apply best-effort partial-result evidence shape, hash-mismatch refusal evidence shape.
- **New `@protostar/paths` package** — exposes `resolveWorkspaceRoot()`; consumed by `@protostar/repo` and `apps/factory-cli`.
- **Root `.gitignore`** — add `.protostar/workspaces/` (Q-02 default).
- **Root `.env.example`** — new file (Q-17).

</code_context>

<deferred>

## Deferred Ideas

- **Workspace pool for hot reuse (Q-03 option b/c):** rejected for v1; may revisit in Phase 10+ if clone cost on dogfood loop becomes measurable pain. The repo-policy schema does **not** reserve a `workspacePool` field — adding a field for a feature we may never ship is the wrong default.
- **Symlink resolve-and-reverify (Q-06 option b/c):** rejected. Strict refusal is v1; targets that legitimately need symlinks can lobby for opt-in via repo-policy in a later phase.
- **Anonymous / public-clone ergonomics tuning (Q-04):** the `system | anonymous` fallback path lands now but its UX (warnings, dry-run mode) is Phase 9's operator surface concern.
- **Subprocess streaming consumer API (Q-09):** Phase 3 ships file-stream + tail; live-stream-to-operator is Phase 9's `inspect` command concern.
- **Patch format alternatives (Q-10 option b — filewise full-content):** rejected as primary format; may resurface as a fallback for binary-file handling if isomorphic-git apply struggles, but plan starts with unified-diff-only.
- **All-or-nothing rollback (Q-12 option a):** rejected. Best-effort + per-file evidence is the primary contract. If the repair loop in Phase 5 can't handle partial diffs, revisit then — not now.
- **Repo-policy `lock-down mode` to remove baseline allowlist commands (Q-07):** out of scope. Operator can audit the effective allowlist via admission decision; removal is a hardening concern for Phase 10+.
- **`@protostar/paths` scope expansion beyond workspace-root resolution (Q-15):** explicitly scope-ceilinged. AGENTS.md gets a short carve-out; growth beyond `pnpm-workspace.yaml`-walking triggers a package split.
- **Re-evaluating `packages/dogpile-types` shim role (Q-16):** decision lands in Phase 3 plan: keep as type-shim re-exporting from upstream `@dogpile/sdk`, or delete if upstream surface is stable enough to import directly. Defer to plan-phase research.

</deferred>

---

*Phase: 03-repo-runtime-sandbox*
*Context gathered: 2026-04-27 via /gsd-discuss-phase --power*
*All 18 questions answered; next step `/gsd-plan-phase 3`*

---

## Errata (added 2026-04-27 by /gsd-plan-phase)

### E-01 (Q-10 mechanism revision)

Q-10 says "apply via isomorphic-git's apply with hash check". Verified against
isomorphic-git@1.37.6's 73-function alphabetic index: no `apply`/`applyPatch`/
`patch` API exists. The *intent* (unified-diff text + pre-image SHA-256 hash
gate + best-effort partial apply per Q-12) is preserved. The *mechanism*
revises to:

- **Patch parse:** `diff.parsePatch(uniDiff)` from kpdecker/jsdiff
- **Patch apply:** `diff.applyPatch(preImage, structured)` (returns `string | false`)
- **Hash gate:** `node:crypto.createHash("sha256")` (we do this ourselves;
  `applyPatch` has no native hash check)

`diff@9.0.0` lands as a SECOND runtime dep on `@protostar/repo` alongside
`isomorphic-git`. PROJECT.md "zero external runtime deps" lock rephrases to
acknowledge both carve-outs.

Source: `.planning/phases/03-repo-runtime-sandbox/03-RESEARCH.md` §Constraint
Conflicts CONFLICT-01.
