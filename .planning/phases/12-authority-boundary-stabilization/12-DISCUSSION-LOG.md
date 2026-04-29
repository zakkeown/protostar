# Phase 12: Authority Boundary Stabilization — Discussion Log

**Mode:** `--power` (offline question/answer file pair)
**Date:** 2026-04-29
**Coverage:** 16/16 questions answered (100%)

This log records each question, the options presented, and the operator's selection. The canonical decisions live in `12-CONTEXT.md` — this file is a human-readable audit record of how those decisions were reached.

---

## Section 1 — Verify Gate Parity (Blocker)

### Q-01 — How should `verify` and `verify:full` relate?
- **Selected:** **(b) Collapse to one script.** Drop tiered verify entirely. Local devs run the same thing CI runs.
- Rejected: (a) subset+contract-test, (c) CI runs both with skip-list assertion.

### Q-02 — How to fix the no-net violation in `@protostar/mechanical-checks`?
- **Selected:** **(a) Move git inspection into `@protostar/repo`.** Mechanical-checks stays a pure transform consuming pre-computed diff names.
- Rejected: (b) inject diffNameOnly evidence (less clear separation), (c) flip mechanical-checks tier to subprocess (loosens authority).

---

## Section 2 — Mechanical Subprocess Authority (High)

### Q-03 — Where should configured mechanical commands run?
- **Selected:** **(a) Through `@protostar/repo` runner — closed allowlist.** Fixed set of repo-allowlisted CLIs (`pnpm`/`tsc`/`node`/`git`); operator picks by name; argv schema-validated per-command.
- Rejected: (b) operator-declared schema-validated (too permissive at runtime), (c) capability-bound only (later folded into Q-04).

### Q-04 — Does this require a `confirmedIntent` schema bump (1.5.0 → 1.6.0)?
- **Selected:** **(a) Yes — bump to 1.6.0 with `mechanical.allowed`.** Mechanical commands become first-class capability. Full fixture cascade required.
- Rejected: (b) reuse `subprocess.allow` (less explicit), (c) defer (operator chose to commit now).

### Q-05 — Where does the mechanical command run?
- **Selected:** **(a) Cloned target-repo workspace.** Same as today.
- Rejected: (b) read-only bind-mount (deferred — adds OS-level deps), (c) post-run dirty-tree assertion.

---

## Section 3 — Subprocess Env Default (High)

### Q-06 — Minimum env baseline for `subprocess-runner.ts`?
- **Selected:** **(c) Baseline + `inheritEnv: string[]` allowlist.** Tiny POSIX baseline (PATH, HOME, LANG, USER) plus per-call explicit allowlist. Allowlist logged into evidence.
- Rejected: (a) empty `{}` (too high-friction), (b) baseline only (no fine-grained per-call control).

### Q-07 — How does delivery opt in to `PROTOSTAR_GITHUB_TOKEN`?
- **Selected:** **(a) Token only at Octokit boundary, never to subprocess.** Octokit (HTTP) and `isomorphic-git onAuth` are library calls; subprocess never sees the token.
- Rejected: (b) `secretEnv` map (introduces a generic secret channel that Phase 12 doesn't need), (c) AuthorizedOp brand (deferred — overkill given D-07).

### Q-08 — Persisted-log secret redaction as defense-in-depth?
- **Selected:** **(c) Both — empty env + redaction filter.** Belt and suspenders.
- Rejected: (a) redaction only, (b) env scrubbing only.

---

## Section 4 — applyChangeSet Path/Op/Diff Invariant (Medium)

### Q-09 — Where is the path/op/diff invariant enforced?
- **Selected:** **(c) Both — admission constructs branded request + `applyChangeSet` re-asserts.** Defense-in-depth.
- Rejected: (a) library-only, (b) admission-only.

### Q-10 — How permissive is "agree"?
- **Selected:** **(a) Exact string equality after canonicalization.** Single canonicalize-relative-path helper, then strict `===`.
- Rejected: (b) path-equivalent (less predictable), (c) display advisory (loosens cosmetic gate).

---

## Section 5 — Boundary Truth Source (Medium)

### Q-11 — Source of truth for tier?
- **Selected:** **(a) `package.json` `protostar.tier`.** Manifest is canonical; lives next to the code.
- Rejected: (b) authority-boundary contract test, (c) AGENTS.md table.

### Q-12 — How is drift detected?
- **Selected:** **(a) Extend `tier-conformance.contract.test.ts`.** Parse AGENTS.md and authority-boundary contract entries; assert all three sources agree. One test, three sources.
- Rejected: (b) standalone tools script, (c) generate AGENTS.md from manifests (deferred — more invasive).

### Q-13 — `evaluation-runner` tier — pure or network?
- **Selected:** **(c) Re-derive from imports.** Don't pre-judge; planner inspects actual imports and picks the honest answer (likely network or a pure/network split).
- Rejected: (a) network-match-manifest, (b) pure-match-contract.

---

## Section 6 — Scope & Verification

### Q-14 — Decomposition of large files?
- **Selected:** **(c) Light decomposition allowed.** Pull all three wiring concerns (command-execution, review-loop, delivery) out of `main.ts` into `apps/factory-cli/src/wiring/`. `packages/planning/src/index.ts` (5701 LOC) decomposition deferred to Phase 13.
- Rejected: (a) defer entirely, (b) only-if-needed split.

### Q-15 — What proves Phase 12 is done?
- **Selected:** **(c) Above + secret-leak attack test.** Contract tests + unified `verify` green + Phase 10 dogfood re-run + offensive secret-leak test.
- Rejected: (a) tests + verify only, (b) tests + verify + dogfood (no offensive test).

### Q-16 — Does Phase 12 block Phase 11?
- **Selected:** **(a) Phase 12 runs after Phase 11 as roadmapped.** Phase 11 stress harness may surface additional authority issues to fold in.
- Rejected: (b) invert dependency, (c) parallel workstreams.

---

## Deferred Ideas

- `packages/planning/src/index.ts` (5701 LOC) decomposition → Phase 13 candidate.
- Generated AGENTS.md table from manifests (Q-12 option c) — revisit if D-12 contract test becomes flaky.
- Read-only bind-mount for mechanical command cwd (Q-05 option b) — defer until a documented attack motivates it.
- Token-bearing AuthorizedOp brand (Q-07 option c) — overkill given D-07 keeps the token at the library boundary entirely.

## Claude's Discretion (carried into research/planning)

- Specific names for the closed mechanical command allowlist (D-03).
- Exact set of redaction patterns for D-08.
- Whether `evaluation-runner` resolves to `network`, `pure`, or splits (D-13).
- Naming of new authority brands (`MechanicalCommandRequest`, canonicalized-path brand).

---

*Discussion completed: 2026-04-29. Mode: --power. CONTEXT.md is canonical.*
