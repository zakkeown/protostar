# Phase 12: Authority Boundary Stabilization — Research

**Researched:** 2026-04-29
**Domain:** Authority surface re-sealing; subprocess sandbox + apply-change-set invariants + tier truth-source reconciliation
**Confidence:** HIGH (every claim traces to a file path + line, or to a `[CITED]`/`[VERIFIED]` source enumerated below)

## Summary

Phase 12 is exclusively a **brownfield re-seal** of an already-built authority surface. Every fix has a precise call site identified in `12-SEED.md`; the reusable assets enumerated in `12-CONTEXT.md §code_context` are real, in-tree, and production-tested by Phases 3, 5, 7, and 10.1.

The shape of the work is: (a) collapse two verify scripts into one, (b) hoist `isomorphic-git` consumption into `@protostar/repo` and have mechanical-checks consume injected diff names, (c) replace the `apps/factory-cli/src/main.ts` raw-spawn mechanical runner with `runCommand` from `@protostar/repo`, gated by a closed mechanical-name allowlist that is admission-bound via a `confirmedIntent` schema bump 1.5.0 → 1.6.0, (d) flip `packages/repo/src/subprocess-runner.ts` env default from `process.env` to a tiny POSIX baseline + per-call `inheritEnv: string[]`, (e) brand `PatchRequest` with a path/op/diff equality constructor that runs through a single canonicalize-relative-path helper, and (f) extend `tier-conformance.contract.test.ts` to cross-check three sources (manifest tier, AGENTS.md table, `authority-boundary.contract.test.ts` PACKAGE_RULES key) for every package.

**Primary recommendation:** Plan the work in roughly this dependency order — (Wave 0) verify-script collapse + the schema 1.5.0 → 1.6.0 cascade as parallel foundations, (Wave 1) `subprocess-runner` env-default flip + token-redaction shared util + `applyChangeSet` invariant + diff-name-only relocation as four independent fixes, (Wave 2) `wiring/command-execution.ts` + `wiring/delivery.ts` extraction consuming everything from Wave 1, (Wave 3) `tier-conformance` extension + evaluation-runner reconciliation, (Wave 4) the secret-leak attack test + Phase 10 dogfood re-run. Schema cascade is the long pole — 25 source-file 1.5.0 references identified by an `rg`-confirmed scan.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Verify script unification | Orchestration (`apps/factory-cli` package.json + root `package.json`) | CI workflow (`.github/workflows/verify.yml`) | Pure tooling; lives at repo root |
| Diff-name-only computation | `fs` (`@protostar/repo`) | — | `isomorphic-git` is a network/fs concern that violates pure tier per `authority-boundary.contract.test.ts:46` |
| Mechanical command execution | `fs` (`@protostar/repo` runner) | Orchestration (`apps/factory-cli/src/wiring/command-execution.ts`) | Subprocess authority lives in repo; wiring is composition |
| Mechanical command **authorization** | Pure (`@protostar/intent` schema 1.6.0) + Pure (`@protostar/authority` capability brand) | Orchestration (CLI flag plumbing) | Authority brands always live in pure tier |
| Subprocess env scrubbing | `fs` (`@protostar/repo/subprocess-runner.ts`) | — | Single ingress for spawn; only repo touches the boundary |
| Token routing for delivery | `network` (`@protostar/delivery-runtime` Octokit + `onAuth`) | Orchestration (`apps/factory-cli/src/main.ts:1198` reads env, hands to `delivery-runtime`) | Token never crosses subprocess boundary; lives at library boundary |
| Log redaction | `fs` (`@protostar/repo` for subprocess log writes; `@protostar/delivery-runtime` already does HTTP-error sanitization) | Orchestration (evidence writers) | Lives at every persistence write site |
| `PatchRequest` path/op/diff invariant | Pure (`@protostar/repo` brand constructor at admission) + `fs` (`applyChangeSet` re-assertion) | — | Brand mint is pure; defense-in-depth re-check is at the I/O boundary |
| Canonicalize-relative-path helper | Pure (`@protostar/paths` if it fits the carve-out scope ceiling) OR `@protostar/repo/src/internal/canonicalize-path.ts` | — | Pure compute over `node:path`; fits paths carve-out per `AGENTS.md:53` |
| Tier conformance enforcement | Test-only (`@protostar/admission-e2e/src/tier-conformance.contract.test.ts`) | — | Cross-cuts every package; can't live in a domain package |

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verify Gate Parity**
- **D-01 (Q-01):** Collapse `verify` and `verify:full` into a single script. Local devs run exactly what CI runs. Slower local feedback is acceptable; zero divergence risk is the priority. Drop the tiered-verify pattern entirely; remove the per-package skip lists.
- **D-02 (Q-02):** Move git workspace inspection (`diff-name-only`) out of `@protostar/mechanical-checks` into `@protostar/repo`. Mechanical-checks stays a pure transform that consumes pre-computed diff names as input. Tier in `package.json:36` and `AGENTS.md:26` remains `pure`; the no-net contract test stays as written.

**Mechanical Subprocess Authority**
- **D-03 (Q-03):** Mechanical commands run through `@protostar/repo`'s allowlist with a **closed allowlist** of mechanical command names (e.g., `typecheck`, `lint`, `test`, `verify`). Each name maps to a known package's CLI; argv shape is schema-validated per-command. Operator cannot declare new free-form mechanical commands at runtime.
- **D-04 (Q-04):** Bump `confirmedIntent` schema 1.5.0 → 1.6.0. Add `capabilityEnvelope.mechanical.allowed: string[]` (subset of the closed mechanical command name allowlist). Mechanical commands become first-class capability — operator must list them at intent time. Full fixture cascade required (every signed-intent fixture re-signs).
- **D-05 (Q-05):** Mechanical commands run inside the **cloned target-repo workspace cwd** (same as today). Defense lives in env scrubbing (D-08) and existing `dirtyWorktreeStatus` checks, not cwd sandboxing.

**Subprocess Env Default**
- **D-06 (Q-06):** `packages/repo/src/subprocess-runner.ts` default env is a tiny POSIX baseline — `PATH`, `HOME`, `LANG`, `USER` — plus an explicit per-call `inheritEnv: string[]` allowlist. Both call sites (`:33`, `:85`) flip to this default. The allowlist is logged into evidence so refusal artifacts show exactly which vars crossed the boundary.
- **D-07 (Q-07):** `PROTOSTAR_GITHUB_TOKEN` never reaches a subprocess. Delivery uses Octokit (HTTP) for PR ops and `isomorphic-git` `onAuth` shim for `pushBranch` — both library calls. The subprocess runner's `inheritEnv` allowlist explicitly cannot include `PROTOSTAR_GITHUB_TOKEN`; add a contract test pinning that.
- **D-08 (Q-08):** Both env scrubbing AND log redaction. Apply known token-shape patterns (GH PAT, bearer headers, JWT shapes) to rolling-tail and evidence writes. Belt-and-suspenders.

**applyChangeSet Path/Op/Diff Invariant**
- **D-09 (Q-09):** Both admission and `applyChangeSet`. `PatchRequest` becomes a brand whose constructor refuses if `path`, `op.path`, and parsed-diff filename disagree. `applyChangeSet` re-asserts the invariant at function entry as defense-in-depth. Add a mismatch refusal contract test in `@protostar/admission-e2e`.
- **D-10 (Q-10):** Equality is exact string equality after canonicalization. All three sources flow through a single canonicalize-relative-path helper, then strict `===`.

**Boundary Truth Source**
- **D-11 (Q-11):** `package.json` `protostar.tier` is canonical. AGENTS.md table and `authority-boundary.contract.test.ts` derive from / assert against the manifests.
- **D-12 (Q-12):** Extend `tier-conformance.contract.test.ts` to parse the AGENTS.md tier table and `authority-boundary.contract.test.ts` entries, then assert all three agree.
- **D-13 (Q-13):** For both `evaluation-runner` and `mechanical-checks`, re-derive tier from actual imports during planning. Code is truth. After D-02 lands, mechanical-checks should be cleanly `pure`. Evaluation-runner's classification is open; planner picks the honest answer.

**Scope & Verification**
- **D-14 (Q-14):** Light decomposition allowed. Pull command-execution, review-loop, delivery wiring out of `main.ts` into `apps/factory-cli/src/wiring/{command-execution,review-loop,delivery}.ts`. **Out of scope:** `packages/planning/src/index.ts` (5701 LOC).
- **D-15 (Q-15):** Done = (a) all new contract tests green, (b) unified `verify` green locally and in CI, (c) Phase 10 dogfood loop re-run, AND (d) a secret-leak attack test asserting the absence of token shapes in evidence logs.
- **D-16 (Q-16):** Phase 12 runs **after** Phase 11 as roadmapped.

### Claude's Discretion
- Specific names for the closed mechanical command allowlist (D-03).
- Exact set of redaction patterns for D-08.
- Whether `evaluation-runner` resolves to `network`, `pure`, or splits (D-13).
- Naming of new authority brands (D-09).

### Deferred Ideas (OUT OF SCOPE)
- `packages/planning/src/index.ts` (5701 LOC) decomposition (Phase 13 candidate).
- Generating AGENTS.md table from manifests (Q-12 option c).
- Read-only bind-mount for mechanical command cwd.
- Token-bearing AuthorizedOp brand.

## Phase Requirements

Phase 12 was added without explicit AUTH-NN IDs in `REQUIREMENTS.md`. **Recommended prefix: `AUTH-NN`** (parallels `INTENT-`, `GOV-`, `REPO-`, `DELIVER-`, `BOUNDARY-`). Tentative mapping below; planner finalizes.

| ID | Description (locked decision) | Research Support |
|----|-------------------------------|------------------|
| AUTH-01 | Unified verify gate (D-01) | §"Verify script collapse" below — diff between `package.json:11` and `:12`, exact unified text. |
| AUTH-02 | Mechanical-checks no-net cleanup (D-02) | §"Mechanical-checks no-net violation" — diff-name-only relocation steps + injection point in `wiring/review-loop.ts:131-142`. |
| AUTH-03 | Mechanical commands via repo runner (D-03) | §"Mechanical command authority" — closed allowlist enumeration + per-command schema pattern from `subprocess-schemas/`. |
| AUTH-04 | Confirmed-intent 1.6.0 with `mechanical.allowed` (D-04) | §"Schema cascade 1.5.0 → 1.6.0" — 25 source files identified; Phase 7 cascade pattern. |
| AUTH-05 | Mechanical command cwd posture (D-05) | §"Mechanical command authority" — confirmed cwd stays as `config.workspaceRoot` per `create-mechanical-checks-adapter.ts:75`. |
| AUTH-06 | Subprocess env baseline + `inheritEnv` (D-06) | §"Subprocess env scrubbing" — exact signature change at `subprocess-runner.ts:22-35`. |
| AUTH-07 | Token never crosses subprocess boundary (D-07) | §"Token boundary" — confirmed token only at `main.ts:1198` Octokit/onAuth library boundary. |
| AUTH-08 | Log redaction defense-in-depth (D-08) | §"Token redaction" — lift `TOKEN_PATTERN` from `delivery-runtime/src/map-octokit-error.ts:6` + extend bearer/JWT. |
| AUTH-09 | `applyChangeSet` path/op/diff invariant (D-09) | §"applyChangeSet path/op/diff" — current code shape at `apply-change-set.ts:8-17, 65, 82, 114`. |
| AUTH-10 | Canonicalized exact-equality (D-10) | §"applyChangeSet path/op/diff" — `@protostar/paths` carve-out fit at `AGENTS.md:53`. |
| AUTH-11 | `package.json` `protostar.tier` as canonical (D-11) | §"Boundary truth source" — manifest field is already canonical per `tier-conformance.contract.test.ts:31-38`. |
| AUTH-12 | Three-way tier-conformance test (D-12) | §"Boundary truth source" — AGENTS.md regex + `PACKAGE_RULES` key parser pattern. |
| AUTH-13 | `evaluation-runner` tier reconciliation (D-13) | §"evaluation-runner tier reconciliation" — imports inspected; recommendation: stays `network` and `authority-boundary.contract.test.ts:77` flips. |
| AUTH-14 | factory-cli wiring decomposition (D-14) | §"Wiring decomposition" — exact extraction sites at `main.ts:1198, 1831, 1873, 1892`. |
| AUTH-15 | Done-criteria: dogfood + attack test (D-15) | §"Verification" — `scripts/dogfood.sh` re-run + secret-leak attack test design. |
| AUTH-16 | Phase ordering (D-16) | **No implementation artifact — pre-execution check enforced by orchestrator. Has no contract test. Planner: do not create a test for AUTH-16.** |

## Standard Stack

### Core (already in tree — no new deps proposed)
| Library | Version | Purpose | Why Standard | Source |
|---------|---------|---------|--------------|--------|
| `isomorphic-git` | `1.37.6` | Pure-JS git mechanics; relocates from mechanical-checks → repo | Phase 3 carve-out; Q-01 lock | [VERIFIED: `packages/repo/package.json` already declares dep; `packages/mechanical-checks/package.json:24`] |
| `diff` | `9.0.0` | Unified-diff parse/apply; consumed by `applyChangeSet` | Phase 3 CONFLICT-01 lock | [VERIFIED: `apply-change-set.ts:3`] |
| `node:test` | runtime | All contract tests | Stack lock per PROJECT.md | [CITED: `.planning/PROJECT.md:67`] |

### No new runtime deps required
The phase is entirely re-shaping existing code. Per `.planning/PROJECT.md:70`, any new runtime dep would require an explicit lock-revision note.

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Decision |
|------------|-----------|----------|----------|
| Lifting `TOKEN_PATTERN` into a shared util | Re-deriving regex inline at each redaction site | Re-derivation guarantees pattern drift between filter + attack test; defeats D-15. | Lift to one shared site. [CITED: `delivery-runtime/src/map-octokit-error.ts:6`] |
| `@protostar/paths` for canonicalize-relative-path helper | Inline helper in `@protostar/repo` | paths carve-out's scope ceiling permits "pure-compute path manipulation (`node:path` `resolve` / `relative` / `dirname`)" — exactly what canonicalization is. | Either is acceptable; paths is the cleaner reuse. [CITED: `AGENTS.md:53-70`] |

## Architecture Patterns

### System Architecture Diagram

```
                       ┌──────────────────────────────────────────────┐
                       │           apps/factory-cli (orchestration)   │
                       │                                              │
   user ─── --confirmed-intent ──┐                                    │
                       │         ▼                                    │
                       │   wiring/command-execution.ts (D-14)         │
                       │         │                                    │
                       │         │  MechanicalCommandRequest          │
                       │         │  (closed-allowlist name +          │
                       │         │   admission via 1.6.0              │
                       │         │   capabilityEnvelope.mechanical    │
                       │         │   .allowed[])                      │
                       │         ▼                                    │
                       │   wiring/review-loop.ts (existing)           │
                       │   wiring/delivery.ts (D-14, new)             │
                       └─┬───────────┬────────────┬───────────────────┘
                         │           │            │
                         ▼           ▼            ▼
              ┌─────────────────┐ ┌──────┐ ┌─────────────────────┐
              │ @protostar/repo │ │mech-  │ │ @protostar/         │
              │ runCommand      │ │ checks│ │   delivery-runtime   │
              │  (D-06: tiny    │ │ adapter│ │  Octokit + onAuth   │
              │   POSIX env +   │ │ (no   │ │  (D-07: token       │
              │   inheritEnv;   │ │ git)  │ │   stays here)       │
              │   D-08: redact) │ │       │ │                     │
              │                 │ │ ◀── computeDiffNameOnly      │
              │ applyChangeSet  │ │     (D-02: now in @repo)     │
              │  (D-09: brand   │ │                              │
              │   PatchRequest; │ └──────┘ └─────────────────────┘
              │   D-10: canon)  │                ▲
              └─────────────────┘                │
                                                 │
                                            isomorphic-git
                                            HTTP / git-over-https
                                            (NEVER subprocess)
```

### Project Structure (target after Phase 12)
```
apps/factory-cli/src/
├── main.ts                  # ↓ shrinks to dispatcher; runFactory orchestration only
└── wiring/
    ├── index.ts
    ├── preflight.ts         # existing
    ├── review-loop.ts       # existing; configuredMechanicalCommands rewrite (D-03)
    ├── command-execution.ts # NEW (D-14): owns mechanical runCommand wiring
    └── delivery.ts          # NEW (D-14): owns Octokit + token site (D-07)

packages/repo/src/
├── subprocess-runner.ts     # MODIFIED (D-06): env default flip + inheritEnv + redact
├── apply-change-set.ts      # MODIFIED (D-09, D-10): PatchRequest brand + re-assertion
├── canonicalize-path.ts     # NEW (D-10) — OR lift to @protostar/paths
└── diff-name-only.ts        # NEW (D-02): moved from mechanical-checks; isomorphic-git import lives here

packages/mechanical-checks/src/
└── create-mechanical-checks-adapter.ts  # MODIFIED (D-02): consumes injected diffNameOnly

packages/intent/schema/
└── confirmed-intent.schema.json  # 1.5.0 → 1.6.0 (D-04)

packages/admission-e2e/src/
├── tier-conformance.contract.test.ts          # EXTENDED (D-12)
└── contracts/
    ├── mechanical-via-repo.contract.test.ts        # NEW (D-03)
    ├── env-empty-default.contract.test.ts          # NEW (D-06/D-07)
    ├── apply-change-set-mismatch.contract.test.ts  # NEW (D-09)
    └── secret-leak-attack.contract.test.ts         # NEW (D-15)
```

### Pattern 1: Closed-Allowlist Mechanical Commands via Capability Envelope (D-03 + D-04)

**What:** Operator cannot declare free-form argv at runtime. Each mechanical command is a *name* (e.g., `verify`, `lint`); the binding from name → argv lives in `@protostar/repo` (closed); admission requires the operator to list the names they want enabled in `confirmedIntent.capabilityEnvelope.mechanical.allowed[]`.

**Why:** Today, `factory-config.schema.json:187-199` accepts `{ id, argv: string[] }` from operator config; `wiring/review-loop.ts:214-223` returns it unchecked; `main.ts:1892` raw-spawns it. Three layers of trust gap. The schema bump moves the trust to admission time, where it's signed.

**Example (proposed shape):**
```typescript
// packages/repo/src/mechanical-commands.ts (new)
export const CLOSED_MECHANICAL_COMMAND_NAMES = Object.freeze([
  "verify",     // pnpm run verify (the one we just unified per D-01)
  "typecheck",  // pnpm run typecheck
  "lint",       // pnpm run lint  (currently in defaultMechanicalCommandsForArchetype)
  "test"        // pnpm -r test
] as const);
export type MechanicalCommandName = (typeof CLOSED_MECHANICAL_COMMAND_NAMES)[number];

export const MECHANICAL_COMMAND_BINDINGS: Readonly<Record<MechanicalCommandName, {
  readonly command: string;
  readonly args: readonly string[];
}>> = Object.freeze({
  verify:    { command: "pnpm", args: ["run", "verify"] },
  typecheck: { command: "pnpm", args: ["run", "typecheck"] },
  lint:      { command: "pnpm", args: ["run", "lint"] },
  test:      { command: "pnpm", args: ["-r", "test"] }
});
```

**The 1.6.0 envelope addition:**
```jsonc
// packages/intent/schema/confirmed-intent.schema.json (additive)
"mechanical": {
  "type": "object",
  "additionalProperties": false,
  "properties": {
    "allowed": {
      "type": "array",
      "items": { "enum": ["verify", "typecheck", "lint", "test"] },
      "uniqueItems": true,
      "default": []
    }
  }
}
```
The closed `enum` is the load-bearing part — schema validation refuses unknown names at admission, before any signing.

### Pattern 2: Repo Runner Env Default (D-06)

**Current** (`packages/repo/src/subprocess-runner.ts:22-35, 88`):
```typescript
export interface RunCommandOptions {
  // ...
  /** Optional env override for child. Defaults to process.env. */
  readonly env?: NodeJS.ProcessEnv;
}
// :88
env: options.env ?? process.env,
```

**Proposed** (Wave 1, independent of all other fixes):
```typescript
const POSIX_BASELINE_ENV_KEYS = Object.freeze(["PATH", "HOME", "LANG", "USER"] as const);

export interface RunCommandOptions {
  // ...
  /**
   * Per-call allowlist of process.env keys to inherit IN ADDITION TO
   * the POSIX baseline (PATH, HOME, LANG, USER). Defaults to []
   * (baseline-only). MUST NOT contain "PROTOSTAR_GITHUB_TOKEN" — pinned
   * by env-empty-default.contract.test.ts (D-07).
   */
  readonly inheritEnv?: readonly string[];
}

function buildChildEnv(inheritEnv: readonly string[] = []): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [...POSIX_BASELINE_ENV_KEYS, ...inheritEnv]) {
    const value = process.env[key];
    if (value !== undefined) env[key] = value;
  }
  return env;
}

// in runCommand spawn options:
env: buildChildEnv(options.inheritEnv),
```

The `inheritEnv` array is logged into the SubprocessResult evidence so refusals show exactly which vars crossed the boundary (per D-06 second sentence). Add to `SubprocessResult`:
```typescript
readonly inheritedEnvKeys: readonly string[];  // baseline ∪ inheritEnv, sorted
```

### Pattern 3: PatchRequest Brand With Path/Op/Diff Invariant (D-09 + D-10)

**Current** `PatchRequest` (`apply-change-set.ts:8-17`) is a structural interface — no constructor, no enforcement:
```typescript
export interface PatchRequest {
  readonly path: string;
  readonly op: AuthorizedWorkspaceOp;
  readonly diff: string;
  readonly preImageSha256: string;
}
```

**Proposed** (Wave 1, independent):
```typescript
// packages/repo/src/apply-change-set.ts
declare const __patchRequestBrand: unique symbol;
export type PatchRequest = {
  readonly path: string;
  readonly op: AuthorizedWorkspaceOp;
  readonly diff: string;
  readonly preImageSha256: string;
} & { readonly [__patchRequestBrand]: void };

export type PatchRequestMintError =
  | "path-mismatch"        // path !== op.path after canonicalization
  | "diff-filename-mismatch" // parsed-diff filename !== path
  | "diff-parse-error";

export function mintPatchRequest(input: {
  readonly path: string;
  readonly op: AuthorizedWorkspaceOp;
  readonly diff: string;
  readonly preImageSha256: string;
}): { readonly ok: true; readonly request: PatchRequest } | { readonly ok: false; readonly error: PatchRequestMintError } {
  const canonPath = canonicalizeRelativePath(input.path);
  const canonOpPath = canonicalizeRelativePath(input.op.path);  // or wherever op stores its path
  if (canonPath !== canonOpPath) return { ok: false, error: "path-mismatch" };

  const parsed = parsePatch(input.diff);
  const filename = parsed[0]?.newFileName ?? parsed[0]?.oldFileName;
  if (filename === undefined) return { ok: false, error: "diff-parse-error" };
  // diff library prefixes filenames with "a/" / "b/" — strip per parsePatch convention
  const canonDiffPath = canonicalizeRelativePath(stripDiffPrefix(filename));
  if (canonPath !== canonDiffPath) return { ok: false, error: "diff-filename-mismatch" };

  return { ok: true, request: { ...input, [__patchRequestBrand]: undefined } as PatchRequest };
}
```

**Defense-in-depth re-assertion at `applyChangeSet` entry** (catches handcrafted brand instances in tests):
```typescript
export async function applyChangeSet(patches, input = {}) {
  for (const patch of patches) {
    // re-run the same canonicalization invariant; throw on disagreement
    if (!verifyPatchRequestInvariant(patch)) {
      return [{ path: patch.path, status: "skipped-error", error: "path-op-diff-mismatch" }];
    }
  }
  // ...rest of existing function
}
```

**Canonicalize helper** — exact-string equality after one pass through:
```typescript
// either packages/paths/src/canonicalize.ts (preferred — fits carve-out scope ceiling) OR
// packages/repo/src/internal/canonicalize-path.ts
import { posix } from "node:path";
export function canonicalizeRelativePath(input: string): string {
  // strip "./" prefix, normalize "../" segments via posix.normalize, refuse absolute & "..", lowercase nothing
  if (posix.isAbsolute(input)) throw new Error(`canonicalizeRelativePath: absolute path ${input} not allowed`);
  const normalized = posix.normalize(input).replace(/^\.\//, "");
  if (normalized.startsWith("..")) throw new Error(`canonicalizeRelativePath: path escapes workspace: ${input}`);
  return normalized;
}
```
Note `AGENTS.md:60-66` says paths carve-out forbids "JSON parsing" / "business logic" — pure node:path is in-scope.

### Anti-Patterns to Avoid

- **Re-deriving the token regex at the redaction site instead of lifting `TOKEN_PATTERN`.** The secret-leak attack test (D-15) and the redaction filter (D-08) MUST share one regex constant. Otherwise the attack test passes if the filter is pattern-blind. [CITED: `delivery-runtime/src/map-octokit-error.ts:6`]
- **Adding a tiered-verify variant during planning.** D-01 explicitly forbids; CONTEXT `<specifics>` line 141 calls this out.
- **Reusing `subprocess.allow` for mechanical command authority instead of bumping schema.** D-04 explicitly forbids option (b); CONTEXT `<specifics>` line 142.
- **Putting redaction inside the consumer of evidence rather than at the writer.** A future code path that reads-then-writes evidence regresses the protection. Redaction lives at every persistence write site.
- **Letting `inheritEnv` accept `PROTOSTAR_GITHUB_TOKEN`.** Pin via static contract test that fails on string-match in source.
- **Using `node:path` (OS-aware) for canonicalization instead of `node:path/posix`.** Cross-platform fixtures break on Windows-style backslashes. Use `posix.normalize`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token-shape detection | Fresh regex inline | Lift `TOKEN_PATTERN` from `delivery-runtime/src/map-octokit-error.ts:6` (extend with bearer + JWT) | Pattern drift between filter and attack test — see anti-pattern above |
| Subprocess argv allowlist + per-command schema | Custom validators | `applyOuterPatternGuard` + per-command schemas in `packages/repo/src/subprocess-schemas/{git,pnpm,node,tsc}.ts` | Phase 3 plan 03-08 already does exactly this for git/pnpm/node/tsc; mechanical names slot into the same shape |
| Branded admission brands | New brand machinery | Phase 2 brand pattern (`AdmittedPlan`, `ConfirmedIntent`, `SignedAdmissionDecision`) | Established symbol-keyed brand template; CONTEXT `<code_context>` "Branded admission decisions" |
| Schema 1.5.0 → 1.6.0 cascade tooling | Custom regen scripts | Phase 7 plan 07-01 cascade pattern + the 25-source-file inventory below | Already done for 1.4.0 → 1.5.0; Phase 4 pitfall 7 + Phase 7 plan 07-01 |
| Tier conformance checks (manifest tier) | New scanner | Extend `tier-conformance.contract.test.ts` `loadPackages()` (already reads `manifest.protostar.tier`) | Already there at `tier-conformance.contract.test.ts:187-201` |
| `isomorphic-git` `onAuth` shim | New auth callback | Reuse `buildPushOnAuth` pattern from `delivery-runtime/src/push-branch.ts:128, 219` and `clone-workspace.ts:80` | Already battle-tested; the token never enters subprocess env via this path |

**Key insight:** every fix has a specific in-tree precedent. The phase is wholly re-application of established patterns to fix specific gaps; no new architectural patterns required.

## Detailed Research Findings

### Verify Script Collapse (D-01) — exact diff

**Current `package.json:11-12`:**
```jsonc
"verify": "pnpm run typecheck && node --experimental-strip-types tools/check-subpath-exports.ts && pnpm --filter @protostar/repair test && pnpm --filter @protostar/evaluation-runner test && pnpm --filter @protostar/intent test && pnpm --filter @protostar/delivery-runtime test && pnpm --filter @protostar/factory-cli test && pnpm knip --no-config-hints",
"verify:full": "pnpm run typecheck && pnpm -r test",
```

**Diff analysis:**
- `verify` runs typecheck + subpath checker + 5 hand-picked package tests + knip.
- `verify:full` runs typecheck + recursive test on ALL packages.
- `verify` is **missing**: subpath checker is not in `verify:full`; knip is not in `verify:full`; `verify:full` is missing the full `pnpm -r test` that `verify` only does for 5 packages.
- The CI `verify.yml:11, 31` runs `verify:full`, so the subpath checker and knip never run in CI.

**Proposed unified script** (single source; CI and local match exactly):
```jsonc
"verify": "pnpm run typecheck && node --experimental-strip-types tools/check-subpath-exports.ts && pnpm -r test && pnpm knip --no-config-hints",
```
Drop `verify:full` entirely (D-01 sentence 4: "Drop the tiered-verify pattern entirely; remove the per-package skip lists.")

**`.github/workflows/verify.yml:11, 31` diff:**
```yaml
# :11
-    name: pnpm run verify:full
+    name: pnpm run verify
# :31
-      - name: Run verify:full
-        run: pnpm run verify:full
+      - name: Run verify
+        run: pnpm run verify
```

**No package-level skip lists exist** — the only "skip" mechanism is the per-package `--filter` enumeration in the `verify` script line itself (which we are removing). No package's own `package.json` `test` script has a skip flag. [VERIFIED: grep across `packages/*/package.json` for `"test":` shows uniform `node --test dist/**/*.test.js` across 19 packages.]

**Tests that ONLY make sense in `verify:full`:** None identified. Every package already runs `node --test dist/**/*.test.js` against its compiled output, all are <30s. The risk: the compiled-output dependency. `pnpm -r test` honors the workspace topology in dependency order, but `tsc -b` (project-references build) needs to have been run. Confirm `pnpm run typecheck` (which is `tsc -b`) is the `&&` predecessor — it is.

**Pitfall — Wave 0 ordering:** if Phase 12 also adds new contract tests (mechanical-via-repo, env-empty-default, apply-change-set-mismatch, secret-leak-attack), those need their compiled `dist/*.test.js` present before `pnpm -r test` runs them. The `pnpm run typecheck` predecessor handles this since `tsc -b` is incremental and writes to `dist/`. **However** — `node --test dist/**/*.test.js` patterns silently skip directories that don't exist. The new admission-e2e tests inherit the existing pattern; this is fine.

**Wave dependency hint:** AUTH-01 is independent of all other fixes. Land it first — it gives every subsequent task a single CI gate to pin against.

### Mechanical-checks no-net violation (D-02) — relocation steps

**Current `packages/mechanical-checks/src/diff-name-only.ts:1-2`:**
```typescript
import git from "isomorphic-git";
import type { FsClient } from "isomorphic-git";
```
This trips `no-net.contract.test.ts:24` (`/from\s+["']isomorphic-git["']/`) — but **only because `mechanical-checks/dist/` isn't yet checked by the contract since `verify` skips this package today**. After D-01 unifies verify, this WILL fail unless D-02 lands. AUTH-01 + AUTH-02 must land in the same wave or AUTH-02 first.

**Sole consumer of `computeDiffNameOnly` in source** (excluding tests):
```
packages/mechanical-checks/src/create-mechanical-checks-adapter.ts:16,115-119
```
Code excerpt (lines 115-119):
```typescript
const diffNameOnly = await computeDiffNameOnly({
  fs: config.gitFs,
  workspaceRoot: config.workspaceRoot,
  baseRef: config.baseRef
});
```

**Migration sequence:**

1. **Move file**: `packages/mechanical-checks/src/diff-name-only.ts` → `packages/repo/src/diff-name-only.ts`. Re-export from `packages/repo/src/index.ts`:
   ```typescript
   export { computeDiffNameOnly } from "./diff-name-only.js";
   export type { ComputeDiffNameOnlyInput } from "./diff-name-only.js";
   ```
2. **Move test**: `diff-name-only.test.ts` → `packages/repo/src/diff-name-only.test.ts`.
3. **Drop `isomorphic-git` from mechanical-checks deps** (`package.json:24`). It already lives in `packages/repo/package.json`.
4. **Reshape mechanical-checks adapter** — `MechanicalChecksAdapterConfig` (line 48 of `create-mechanical-checks-adapter.ts`) currently takes `gitFs: FsClient` (line 57). **Drop `gitFs`, add `diffNameOnly: readonly string[]`**:
   ```typescript
   // BEFORE
   readonly gitFs: FsClient;
   // AFTER
   readonly diffNameOnly: readonly string[];
   ```
   Then delete lines 115-119 (the computeDiffNameOnly call) and use `config.diffNameOnly` directly at every reference (lines 126, 133, 142, 192). The adapter becomes a pure transform — it no longer touches git.
5. **Wiring update at `apps/factory-cli/src/wiring/review-loop.ts:131-142`** (`mechanicalAdapterConfig` function):
   ```typescript
   // BEFORE
   gitFs: input.gitFs,
   subprocess: input.subprocess
   // AFTER
   diffNameOnly: await computeDiffNameOnly({
     fs: input.gitFs,        // factory-cli still owns the gitFs handle
     workspaceRoot: input.workspaceRoot,
     baseRef: input.baseRef
   }),
   subprocess: input.subprocess
   ```
   Note: this changes the timing — diff is computed before mechanical commands run instead of after. That matches D-02's "consumes pre-computed diff names as input."
6. **Contract test addition**: extend `mechanical-checks/src/no-net.contract.test.ts` already covers it (FORBIDDEN_NET_PATTERNS includes `isomorphic-git` at line 23). Just confirm it stays green after the move.
7. **Tier**: stays `pure` per D-02 sentence 3. No manifest changes.

**Wave dependency hint:** AUTH-02 is independent of AUTH-03..AUTH-15 except AUTH-01 (verify must already be unified to catch regressions). Wave 0 or Wave 1 candidate.

### Mechanical Command Authority (D-03 + D-04 + D-14) — closed allowlist + schema cascade

**Current state — three trust gaps:**

1. **`packages/lmstudio-adapter/src/factory-config.schema.json:187-199`** — accepts arbitrary `argv: string[]`:
   ```jsonc
   "mechanicalCheckCommand": {
     "type": "object",
     "additionalProperties": false,
     "required": ["id", "argv"],
     "properties": {
       "id": { "type": "string", "minLength": 1 },
       "argv": {
         "type": "array",
         "minItems": 1,
         "items": { "type": "string", "minLength": 1 }
       }
     }
   }
   ```

2. **`apps/factory-cli/src/wiring/review-loop.ts:214-223`** (`configuredMechanicalCommands`) — passes through unchecked:
   ```typescript
   function configuredMechanicalCommands(
     factoryConfig: ResolvedFactoryConfig
   ): readonly MechanicalChecksCommandConfig[] | undefined {
     const config = factoryConfig.config as unknown as {
       readonly mechanicalChecks?: {
         readonly commands?: readonly MechanicalChecksCommandConfig[];
       };
     };
     return config.mechanicalChecks?.commands;
   }
   ```

3. **`apps/factory-cli/src/main.ts:1831-1871`** (`createMechanicalSubprocessRunner`) — uses raw `spawn` via `runSpawnedCommand` at line 1873-1931 — bypasses repo allowlist + schema entirely. The runner inherits `process.env` because `runSpawnedCommand` doesn't set `env:` at all (line 1892-1896 spawn opts have no `env` key).

**Existing reusable pattern from Phase 3 (subprocess-schemas/`):**
The `runCommand` function in `packages/repo/src/subprocess-runner.ts:66-141` already enforces:
- `effectiveAllowlist.includes(op.command)` (line 144) — refusal `"command-not-allowlisted"`
- per-command schema lookup at line 151 — refusal `"no-schema"`
- `applyOuterPatternGuard` at line 159 — refusal `"argv-violation"`
- pre-spawn validation throws before `spawn()` is called

This is exactly what mechanical commands need. The mechanical command names (`verify`, `lint`, `typecheck`, `test`) all map to `pnpm` invocations — `pnpm` already has a schema at `packages/repo/src/subprocess-schemas/pnpm.ts` (Phase 3 plan 03-08 artifact).

**Inventory of mechanical commands operators currently run:**
- `defaultMechanicalCommandsForArchetype` at `wiring/review-loop.ts:115-125`:
  - `cosmetic-tweak`: `[{id:"verify", argv:["pnpm","verify"]}, {id:"lint", argv:["pnpm","lint"]}]`
  - all other archetypes: `[{id:"verify", argv:["pnpm","verify"]}]`
- `create-mechanical-checks-adapter.ts:160-167` `commandsFor` defaults match the same set.
- No operator-supplied custom commands exist in the toy repo's `protostar-toy-ttt` config (per the dogfood seeds at `apps/factory-cli/src/dogfood/`). [VERIFIED: `scripts/dogfood.sh` at line 43-54 invokes `node ... main.js run` without any `--mechanical-command` flag, and no `mechanicalChecks.commands` block in any test fixture.]

**Closed allowlist (researcher's recommendation, planner finalizes):**
```typescript
export const CLOSED_MECHANICAL_COMMAND_NAMES = ["verify", "typecheck", "lint", "test"] as const;
```
- `verify` covers the existing `pnpm verify` use case.
- `typecheck` is the existing `pnpm run typecheck` (subset of verify but useful alone).
- `lint` covers the existing `pnpm lint` for cosmetic-tweak.
- `test` covers `pnpm -r test` for non-cosmetic archetypes.

**Proposed `wiring/command-execution.ts` (new):**
```typescript
// apps/factory-cli/src/wiring/command-execution.ts
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { runCommand, type AuthorizedSubprocessOp, type RunCommandOptions } from "@protostar/repo";
import { MECHANICAL_COMMAND_BINDINGS, type MechanicalCommandName } from "@protostar/repo/mechanical-commands";
import type { MechanicalChecksSubprocessRunner } from "@protostar/mechanical-checks";

export function createMechanicalSubprocessRunner(input: {
  readonly runDir: string;
  readonly resolvedEnvelope: ResolvedCapabilityEnvelope;
  readonly allowedMechanicalCommands: readonly MechanicalCommandName[];   // from confirmedIntent.capabilityEnvelope.mechanical.allowed
  readonly effectiveAllowlist: readonly string[];                          // baseline ∪ policy.commandAllowlist
  readonly schemas: Readonly<Record<string, CommandSchema>>;
}): MechanicalChecksSubprocessRunner {
  return {
    async runCommand(command) {
      // adapter still calls with argv: ["pnpm", "verify"] — we map argv[0]+argv[1] → MechanicalCommandName
      const name = inferMechanicalName(command.argv);
      if (!input.allowedMechanicalCommands.includes(name)) {
        throw new MechanicalCommandRefusedError("not-in-capability-envelope", name);
      }
      const binding = MECHANICAL_COMMAND_BINDINGS[name];
      const dir = resolve(input.runDir, "review", "mechanical");
      await mkdir(dir, { recursive: true });
      const result = await runCommand(
        {
          command: binding.command,
          args: binding.args,
          cwd: command.cwd,
          resolvedEnvelope: input.resolvedEnvelope
        } satisfies AuthorizedSubprocessOp,
        {
          stdoutPath: resolve(dir, `${name}.stdout.log`),
          stderrPath: resolve(dir, `${name}.stderr.log`),
          effectiveAllowlist: input.effectiveAllowlist,
          schemas: input.schemas,
          timeoutMs: command.timeoutMs,
          inheritEnv: []   // baseline only
        }
      );
      return {
        argv: [binding.command, ...binding.args],
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        stdoutPath: result.stdoutPath,
        stderrPath: result.stderrPath,
        stdoutBytes: result.stdoutBytes,
        stderrBytes: result.stderrBytes
      };
    }
  };
}
```

**Note:** The `MechanicalChecksSubprocessRunner` interface at `create-mechanical-checks-adapter.ts:31-46` accepts `argv: readonly string[]` — keeping that interface stable means the adapter doesn't need to change its caller-shape (only the wiring impl changes). `inferMechanicalName(argv)` is a tiny lookup against `MECHANICAL_COMMAND_BINDINGS` to recover the name from the existing argv shape.

**`runSpawnedCommand` at `main.ts:1873-1931` is dead code after D-03.** The entire function (and the `import { spawn } from "node:child_process"` at `main.ts:6`) is removed, not relocated.

**`wiring/delivery.ts` (new, D-14):** owns the entire `main.ts:1192-1247` block — the `runFullDeliveryPreflight` + `wireExecuteDelivery` chain. The token site at `main.ts:1198-1199` (`process.env["PROTOSTAR_GITHUB_TOKEN"]!`) stays in this file, NOT in `command-execution.ts`. This separation is the structural assertion of D-07.

**Wave dependency hint:**
- AUTH-04 (schema cascade) is a Wave 0 foundation — must complete before any AUTH-03 (mechanical via repo) implementation runs because the new wiring reads `confirmedIntent.capabilityEnvelope.mechanical.allowed`.
- AUTH-03 + AUTH-14 (wiring decomposition) co-execute in Wave 2 — extracting `wiring/command-execution.ts` IS the AUTH-03 mechanism.

### Schema Cascade 1.5.0 → 1.6.0 (D-04) — exhaustive file inventory

**Source-file scope (excluding `dist/`):** 25 files identified by `grep -rln '"1\.5\.0"' packages/*/src apps/*/src packages/*/schema packages/*/internal apps/factory-cli/src examples/`.

```
apps/factory-cli/src/load-factory-config.test.ts
apps/factory-cli/src/run-real-execution.test.ts
examples/intents/bad/missing-capability.json                     ← signed fixture, MUST re-sign
examples/intents/scaffold.json                                   ← signed fixture, MUST re-sign
packages/admission-e2e/src/authority-governance-kernel.e2e.test.ts
packages/admission-e2e/src/calibration-log-append.contract.test.ts
packages/admission-e2e/src/evaluation-runner-no-fs.contract.test.ts
packages/admission-e2e/src/no-skipped-evaluation.contract.test.ts
packages/admission-e2e/src/planning-mission-prior-summary.contract.test.ts
packages/admission-e2e/src/signed-intent-1-5-0.test.ts           ← rename to signed-intent-1-6-0.test.ts
packages/authority/src/signature/sign-verify.test.ts
packages/authority/src/stage-reader/factory.test.ts
packages/authority/src/stage-reader/factory.ts                   ← const literal at :259
packages/evaluation/src/create-spec-ontology-snapshot.test.ts
packages/evaluation/src/lineage-hash.test.ts
packages/intent/schema/confirmed-intent.schema.json              ← const "1.5.0" → "1.6.0" + add mechanical.allowed
packages/intent/src/acceptance-criteria-normalization.test.ts
packages/intent/src/capability-envelope.test.ts
packages/intent/src/confirmed-intent-immutability.test.ts
packages/intent/src/confirmed-intent.test.ts
packages/intent/src/confirmed-intent.ts                          ← type literal at :44, :86; default at :117, :296; readOptionalSchemaVersion at :307
packages/intent/src/internal/test-builders.ts
packages/intent/src/promote-intent-draft.ts                      ← :192
packages/intent/src/public-split-exports.contract.test.ts
packages/lmstudio-adapter/internal/test-fixtures/cosmetic-tweak-fixture.ts
```

**This count compares to:**
- Phase 5 plan 05-03: `1.3.0 → 1.4.0`
- Phase 7 plan 07-01: 19 files cited at `must_haves.truths` line 32 ("All 19 1.4.0 references in source/tests/fixtures bump to 1.5.0"); 2 signed fixtures re-signed.

**Cascade recipe (extracted from `07-01-schema-cascade-PLAN.md`):**
1. Bump `packages/intent/schema/confirmed-intent.schema.json:21` `"const": "1.5.0"` → `"const": "1.6.0"`. Add `mechanical: { allowed: { enum: [...] } }` block to `capabilityEnvelope` properties; add `mechanical` to `additionalProperties: false` parent's allowed key list (verify there is one — schema is closed at `additionalProperties: false`).
2. Bump every type literal in `packages/intent/src/confirmed-intent.ts`: lines 44 (`readonly schemaVersion: "1.5.0"` → `"1.6.0"`), 86, 117, 296, 307 + 312 (the `if (value === "1.5.0")` becomes `"1.6.0"`).
3. Bump `packages/intent/src/promote-intent-draft.ts:192`.
4. Bump `packages/authority/src/stage-reader/factory.ts:259` (the up-conversion default).
5. Bump every test fixture literal — node:test will fail loud on mismatched const, so this is mechanical search-and-replace of `"1.5.0"` → `"1.6.0"`.
6. **Re-sign** `examples/intents/scaffold.json` and `examples/intents/bad/missing-capability.json` via the Phase 2 c14n + signature pipeline (`packages/authority/src/signature/canonicalize.ts` + `packages/authority/src/signature/sign-verify.ts`). The Phase 7 plan 07-01 cites `"canonicalForm": "json-c14n@1.0"` as the marker; re-running `pnpm --filter @protostar/admission-e2e test` against `signed-intent-1-6-0.test.ts` regenerates the signature.
7. Rename the contract test: `packages/admission-e2e/src/signed-intent-1-5-0.test.ts` → `signed-intent-1-6-0.test.ts`. Update test names accordingly.
8. **`mechanical.allowed` defaults to `[]`** — every existing fixture that has no `mechanical` block will fail admission for runs that try to invoke any mechanical command. **Add `mechanical: { allowed: ["verify", "lint"] }` to every existing test fixture and example intent** to preserve the current behavior of the cosmetic-tweak archetype (which today runs verify + lint by default per `wiring/review-loop.ts:118-122`).

**Wave dependency hint:** Massive parallelizable mechanical edits. Single-author wave because the search-and-replace is brittle to merge conflicts. Wave 0.

### Subprocess env scrubbing (D-06 + D-07 + D-08) — exact signature change

**Current `subprocess-runner.ts` shape** (already shown above): `RunCommandOptions.env` defaults to `process.env` at line 88.

**All callers of `runCommand` from `@protostar/repo`** (post-grep):

| Caller | File:Line | What env it needs | Recommended `inheritEnv` |
|--------|-----------|-------------------|---------------------------|
| `apps/factory-cli/src/main.ts` (mechanical region) | After D-03/D-14: `wiring/command-execution.ts` | `pnpm verify` etc. — needs `NODE_PATH`? No, pnpm self-discovers. | `[]` (baseline only) |
| Phase 3 internal tests | `packages/repo/src/subprocess-runner.test.ts:12` | Test-controlled | `[]` — tests control their own env, none inherit |

The runner is otherwise NOT consumed by domain packages — confirmed by `grep -rn "from.*subprocess-runner\|import { runCommand"` returning only `packages/repo/{src,dist}/...` and the test file. So the audit surface is small: **only the new `wiring/command-execution.ts` needs an `inheritEnv` decision**.

**`PROTOSTAR_GITHUB_TOKEN` flow today (D-07 confirmation):**

The token is read at exactly one site: `apps/factory-cli/src/main.ts:1198-1199`:
```typescript
const fullResult = await runFullDeliveryPreflight({
  token: process.env["PROTOSTAR_GITHUB_TOKEN"]!,
  ...
});
```
It is then passed in-process to `delivery-runtime`'s Octokit + `pushBranch`. `pushBranch` uses the `onAuth` shim at `delivery-runtime/src/push-branch.ts:128, 219`:
```typescript
onAuth: buildPushOnAuth(input.token, input.signal)
```
**Confirmed:** the token is never passed to a `spawn()` call. `grep "spawn" packages/delivery-runtime/src` → no matches. `grep -rn "process.env\[.PROTOSTAR_GITHUB_TOKEN" packages/repo/src` → no matches (only `clone-workspace.ts:69` reads `process.env[credentialRef]` for the *credential reference name*, not the literal token env var).

**Contract test pinning (D-07 structural assertion):**
```typescript
// packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts (NEW)
import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("subprocess-runner env-empty-default", () => {
  it("inheritEnv allowlist literally cannot include PROTOSTAR_GITHUB_TOKEN anywhere in source", async () => {
    // Static scan: every file under apps/factory-cli/src/wiring/ + packages/repo/src/
    // No string literal "PROTOSTAR_GITHUB_TOKEN" appears in any inheritEnv: [...] context.
    // Implementation: regex scan for inheritEnv:\s*\[[^\]]*PROTOSTAR_GITHUB_TOKEN
    // Assert offenders == [].
  });
  it("subprocess-runner default child env contains only POSIX baseline keys", async () => {
    // Spawn a real `node -e "console.log(JSON.stringify(process.env))"` via runCommand
    // with inheritEnv: []. Parse stdout. Assert keys are subset of POSIX_BASELINE_ENV_KEYS.
  });
});
```

**Token redaction patterns (D-08):**

**Existing seed** at `delivery-runtime/src/map-octokit-error.ts:6`:
```typescript
export const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g;
```
- `gh[pousr]_` covers classic PATs: `ghp_` (personal), `gho_` (OAuth), `ghu_` (user-to-server), `ghs_` (server-to-server), `ghr_` (refresh). [CITED: GitHub docs token format prefix taxonomy.]
- `github_pat_` covers fine-grained PATs (≥82-char total).

**Recommended extension for D-08** (lift to one shared constant + add bearer + JWT):

```typescript
// packages/repo/src/redact.ts (NEW — centralized redaction shared by repo subprocess-runner + future evidence writers)
export const TOKEN_PATTERNS: readonly RegExp[] = Object.freeze([
  // existing — GitHub PATs
  /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g,
  // bearer headers — case-insensitive prefix, base64-ish payload
  /\bBearer\s+[A-Za-z0-9._\-+/=]{16,}\b/gi,
  // JWT — three base64url segments separated by dots
  /\beyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\b/g
]);

export function redactTokens(value: string): string {
  let out = value;
  for (const pattern of TOKEN_PATTERNS) {
    out = out.replace(pattern, "***");
  }
  return out;
}
```

**Where redaction lives** (every persistence write site):
1. `subprocess-runner.ts:79-80, 92-99` — `stdoutCapture` / `stderrCapture` `tail()` is returned in `SubprocessResult.stdoutTail` / `stderrTail`. Apply `redactTokens()` when constructing the tail strings at lines 130-131. **And** apply to the file streams — but file-stream redaction is harder because chunks may split tokens. Two options:
   - (a) Buffer-then-redact: pre-flush, scan tail buffer for token shapes; trim and replace. Token shape minimum length is 36 chars for `ghp_`, 82 for fine-grained — make rolling buffer 128 chars.
   - (b) Post-write filter on read: any consumer reading `stdoutPath` re-applies `redactTokens()`. Simpler.
   - **Recommendation: (b).** Document at the writer that on-disk tails MAY contain raw tokens; the redaction lives at the read boundary (any `readFile()` → JSON.stringify into evidence). This matches the existing `delivery-runtime/src/map-octokit-error.ts:88` pattern — redaction is at the error-reporting layer, not the network layer.
2. `apps/factory-cli/src/main.ts` evidence writers — every `JSON.stringify` of a SubprocessResult flows through `redactTokens(stringify(...))`. Apply at the persistence-write site.
3. `delivery-runtime`'s existing `redact()` at `map-octokit-error.ts:88-90` is **lifted into `@protostar/repo`'s shared module** and `delivery-runtime` imports it. This is the single-source guarantee — the secret-leak attack test (D-15) and the runtime redaction filter share one regex.

**Lift dependency note:** `@protostar/delivery-runtime` already depends on `@protostar/delivery`. Adding a dep on `@protostar/repo` is allowed per `tier-conformance.contract.test.ts:9-19` `ACCEPTED_AUTHORITY_EDGES` — **but** this introduces a new edge `@protostar/delivery-runtime -> @protostar/repo` that's not in the accepted set. **Alternative:** put the redaction module in a *third* place — a new tiny pure package, OR co-locate it inside `@protostar/delivery` (pure tier — already imported by delivery-runtime). Recommendation: **add to `@protostar/delivery/redact.ts`** (pure tier, no new deps, existing edge). Both `subprocess-runner` (in `@protostar/repo`) and `map-octokit-error` (in `@protostar/delivery-runtime`) import from there. **However** — `repo` is `fs` tier and depending on `delivery` (pure) is allowed by tier-conformance dep direction (fs → pure is fine). Confirmed by `tier-conformance.contract.test.ts:91-115`.

**Wave dependency hint:** AUTH-06 (env scrubbing), AUTH-07 (token boundary contract test), AUTH-08 (redaction lift) are independent of AUTH-01..AUTH-05 and parallelizable in Wave 1.

### applyChangeSet path/op/diff invariant (D-09 + D-10)

**Current `apply-change-set.ts:8-17, 65, 82, 114`** — already shown above. The three sources of truth for "the file we're touching":
- `patch.path` (line 65): used for the cosmetic-tweak multifile guard and for result.path.
- `patch.op` (line 82): handed to `readFile(patch.op)` — this is the actual I/O path.
- `patch.op` (line 114): handed to `writeFile(patch.op, ...)` — the actual write target.
- The parsed-diff filename (line 103, `parsed[0]`) is currently used only for hunk extraction (`structuredPatch`), NEVER cross-checked against `patch.path` or `patch.op.path`.

**Today's risk:** a `PatchRequest` whose `path = "src/safe.ts"`, `op = AuthorizedWorkspaceOp{path:"src/danger.ts"}`, and `diff` parses for `src/other.ts` would: count as 1 file (path), read+write `danger.ts` (op), and apply hunks formatted for `other.ts` (diff). `src/danger.ts` gets corrupted. Today's CLI wiring derives all three from one source so this never happens — but the exported repo API does not enforce it.

**`AuthorizedWorkspaceOp` shape** — needs to be checked. From `packages/repo/src/index.ts` exports `AuthorizedWorkspaceOp` from `./fs-adapter.js`. Need to confirm whether it has a `.path` field or similar. **[ASSUMED — needs confirmation during planning]:** Based on Phase 2 brand pattern (AuthorizedSubprocessOp at `subprocess-runner.ts:15-20` has `cwd`, `args`, `command` — the workspace op should have `path`).

**Diff library filename location** — `parsePatch` returns `StructuredPatch[]` with `.oldFileName` / `.newFileName` (per `diff@9` API). Filenames carry `a/` and `b/` prefixes (standard unified-diff convention). The canonicalize helper must strip these.

**Contract test for D-09:**
```typescript
// packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { mintPatchRequest } from "@protostar/repo";

describe("apply-change-set path/op/diff invariant", () => {
  it("refuses mint when path !== op.path", () => {
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op: makeAuthorizedOp({ path: "src/danger.ts" }),
      diff: validDiffFor("src/safe.ts"),
      preImageSha256: "..."
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "path-mismatch");
  });
  it("refuses mint when diff filename !== path", () => {
    const result = mintPatchRequest({
      path: "src/safe.ts",
      op: makeAuthorizedOp({ path: "src/safe.ts" }),
      diff: validDiffFor("src/other.ts"),
      preImageSha256: "..."
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "diff-filename-mismatch");
  });
  it("canonicalization round-trip — './foo' === 'foo' === 'a/b/../foo'", () => {
    // path = "./src/file.ts", op.path = "src/file.ts", diff filename = "a/src/file.ts" (with prefix)
    // All three canonicalize to "src/file.ts" — mint succeeds.
    const result = mintPatchRequest({
      path: "./src/file.ts",
      op: makeAuthorizedOp({ path: "src/file.ts" }),
      diff: validDiffFor("a/src/file.ts"),  // diff library prefix
      preImageSha256: "..."
    });
    assert.equal(result.ok, true);
  });
});
```

**Wave dependency hint:** AUTH-09 + AUTH-10 are completely independent of AUTH-01..AUTH-08 and AUTH-11..AUTH-15. Wave 1 candidate.

### Boundary truth source (D-11 + D-12 + D-13)

**Current `tier-conformance.contract.test.ts`** already reads `manifest.protostar.tier` (lines 187-201) and asserts:
- every package declares a known tier (lines 31-38)
- explicit sentinels for `paths`, `repo`, `factory-cli`, `admission-e2e` (40-47)
- dep-direction rules (91-115)
- network packages have `no-fs.contract.test.ts` (117-128)
- pure packages have `no-net.contract.test.ts` (130-141)
- pure + test-only have `sideEffects: false` (143-151)
- published packages have `engines.node: ">=22"` (153-161)

**What's missing for D-12:**
1. Parse the AGENTS.md `## Authority Tiers` table (lines 23-26 of AGENTS.md).
2. Parse the `PACKAGE_RULES` keys + their rule shapes from `authority-boundary.contract.test.ts:62-106`.
3. Cross-assert: `manifest.tier == AGENTS.md.tier == PACKAGE_RULES.tier` per package.

**AGENTS.md table format** (current `AGENTS.md:23-27`):
```markdown
- **orchestration (`fs-permitted`, `network-permitted`):** `apps/factory-cli`
- **filesystem (`fs-permitted`, `network-forbidden`):** `packages/repo`, `@protostar/paths` (scope-ceiled carve-out)
- **domain network (`network-permitted`, `fs-forbidden`):** `@protostar/dogpile-adapter`, ...
- **pure (`fs-forbidden`, `network-forbidden`):** `@protostar/artifacts`, `@protostar/authority`, ...
- **test-only:** `@protostar/admission-e2e` may depend on any tier ...
```

**Parser regex** (researcher recommendation):
```typescript
// One bullet per tier-line, with `- **<TIER_LABEL> (<auth>...):** <CSV of @protostar/<name> or apps/<name>>
const TIER_LINE_PATTERN = /^-\s+\*\*(\w[\w\s\-]*?)\b[^:]*:\*\*\s+(.+)$/gm;
const PKG_NAME_PATTERN = /(?:@protostar\/[\w\-]+|apps\/[\w\-]+|packages\/[\w\-]+)/g;

// Map AGENTS.md tier label → manifest tier
const AGENTS_TIER_TO_MANIFEST: Record<string, string> = {
  "orchestration": "orchestration",
  "filesystem": "fs",
  "domain network": "network",
  "pure": "pure",
  "test-only": "test-only"
};
```

**`authority-boundary.contract.test.ts` PACKAGE_RULES keys** at lines 62-106 — derive a tier from rule shape:
- `PURE_PACKAGE_RULE` → `pure`
- delivery-runtime/dogpile-adapter/lmstudio-adapter/evaluation-runner rules → `network`
- `repo` rule → `fs`
- `paths` rule → `fs` (per the carve-out)
- `admission-e2e` → `unrestricted` → `test-only`
- `factory-cli` → not in PACKAGE_RULES (it's the only orchestration package; the contract scans `packages/` only — see `authority-boundary.contract.test.ts:111`). **This is a gap that D-12 must address** by adding apps/factory-cli to the contract.

**Note:** `authority-boundary.contract.test.ts:62-106` currently classifies `evaluation-runner` as `PURE_PACKAGE_RULE` (line 77), while `packages/evaluation-runner/package.json:38` declares `"tier": "network"`, while `tier-conformance.contract.test.ts` already trusts the manifest. **This is the live drift D-13 is meant to resolve.**

### evaluation-runner tier reconciliation (D-13)

**Imports in `packages/evaluation-runner/src/`** (production source only, excluding tests):
```
packages/evaluation-runner/src/run-evaluation-stages.ts:
  import type { ConfiguredModelProvider } from "@protostar/dogpile-types";
  import type { ConfirmedIntent } from "@protostar/intent";
  import type { AdmittedPlan } from "@protostar/planning";
  import type { JudgeCritique, ReviewGate } from "@protostar/review";
  import { ... } from "@protostar/dogpile-adapter";   ← network-tier dep
  import { ... } from "@protostar/evaluation";

packages/evaluation-runner/src/index.ts:
  re-exports from ./run-evaluation-stages.js
```

**Direct net imports in own src/:** **none** (no `node:http`, `node:https`, `fetch`, `@octokit/*`, `isomorphic-git`, `undici`).
**Direct fs imports in own src/:** **none** (no `node:fs`, `node:path`).

**However**, `evaluation-runner` imports `@protostar/dogpile-adapter` (declared `network` per its manifest), which transitively does network calls via `@dogpile/sdk`. Per the tier definition in `AGENTS.md:25` "domain network", evaluation-runner functions DO produce network traffic at runtime — they call `runFactoryPile` from `dogpile-adapter`.

**Recommendation (researcher's reading; planner finalizes):**

**Keep `evaluation-runner` tier = `network`** — manifest is right; `authority-boundary.contract.test.ts:77` is wrong. The package's *static imports* are pure-shaped, but its *runtime authority* is network because it is the orchestration boundary that invokes `runFactoryPile`. Per `AGENTS.md:31` "Each network-permitted package MUST contain a static `no-fs.contract.test.ts`" — and `evaluation-runner-no-fs.contract.test.ts` already exists at `packages/admission-e2e/src/`. The local `no-fs.contract.test.ts` per BOUNDARY-04 is preserved (per CONTEXT `<canonical_refs>` section).

**Action:** `authority-boundary.contract.test.ts:77` flips from `PURE_PACKAGE_RULE` to a `network` shape mirroring the `dogpile-adapter` pattern at line 71-74 (no node:http/node:https because the SDK proxies through dogpile-adapter — but if we call this `network`, the static rule should actually allow nothing in evaluation-runner src/ since it has no direct net imports either).

**Alternative reading:** Tier classification should be based on direct imports — evaluation-runner's src/ has zero net imports, so it could be `pure`. But then BOUNDARY-04's `no-fs.contract.test.ts` requirement (which IS already present per `tier-conformance.contract.test.ts:117-128` for network-tier) doesn't apply.

**Tie-breaker:** the CONTEXT explicitly says (D-13 sentence 4): "Evaluation-runner's classification is open; the planner inspects imports and picks the honest answer (likely `network` or splits into a pure orchestrator + network adapter)." The transitive network reach via `dogpile-adapter` makes "network" the honest answer. Defer the split to a future phase.

**For mechanical-checks (post-D-02):**
After `isomorphic-git` import is gone (relocated to `@protostar/repo`), mechanical-checks src/ has zero net or fs imports. Direct imports are: `@protostar/execution`, `@protostar/repo`, `@protostar/intent`, `@protostar/review`. **Stays `pure`** as locked by D-02 sentence 3.

### Wiring decomposition (D-14) — exact extraction sites

**`apps/factory-cli/src/main.ts` is 3429 LOC** per CONTEXT line 18. Three regions extract:

1. **Lines 1192-1247 (delivery flow)** → `apps/factory-cli/src/wiring/delivery.ts`. The PROTOSTAR_GITHUB_TOKEN site at `:1198-1199` lives here. Function signature (proposed):
   ```typescript
   export async function buildAndExecuteDelivery(input: { /* runId, runDir, intent, loop, ... */ }): Promise<DeliveryOutcome>;
   ```
   Imports `runFullDeliveryPreflight`, `wireExecuteDelivery`, `writeDeliveryAuthorizationPayloadAtomic`, `buildAuthorizationPayload`, `assembleDeliveryBody`.

2. **Lines 1831-1871 (`createMechanicalSubprocessRunner`)** → DELETED. Replaced by new `wiring/command-execution.ts:createMechanicalSubprocessRunner` that delegates to `runCommand` from `@protostar/repo`. The new signature is shown in §"Mechanical command authority" Pattern 1.

3. **Lines 1873-1931 (`runSpawnedCommand`)** → DELETED entirely. The whole function is dead code after D-03. The `import { spawn } from "node:child_process"` at line 6 of `main.ts` is also dropped.

4. **`apps/factory-cli/src/wiring/review-loop.ts:214-223`** (`configuredMechanicalCommands`) → REWRITTEN to return `MechanicalCommandName[]` instead of `MechanicalChecksCommandConfig[]`:
   ```typescript
   function configuredMechanicalCommands(
     factoryConfig: ResolvedFactoryConfig,
     allowedFromEnvelope: readonly MechanicalCommandName[]
   ): readonly MechanicalCommandName[] {
     // Intersect operator config (closed enum) with the capability envelope.
     // No more raw argv from operator config.
     const fromConfig = factoryConfig.config.mechanicalChecks?.commands ?? [];
     return fromConfig.filter((name): name is MechanicalCommandName =>
       allowedFromEnvelope.includes(name)
     );
   }
   ```

5. **`mechanicalAdapterConfig` at `wiring/review-loop.ts:127-143`** — adjusted per D-02: drop `gitFs`, add `diffNameOnly` (computed via newly-relocated `computeDiffNameOnly` from `@protostar/repo`). The `subprocess` field changes shape (per `wiring/command-execution.ts:createMechanicalSubprocessRunner`).

**Test impact:** `apps/factory-cli/src/wiring/review-loop.test.ts:317` already has a `runCommand` test stub. New `wiring/command-execution.test.ts` and `wiring/delivery.test.ts` follow the same convention.

### Verification (D-15)

**Phase 10 dogfood loop entrypoint:** `scripts/dogfood.sh` (already exists, 97 lines). Invoked by `pnpm dogfood:matrix` for the fixture matrix; for the AUTH-15 re-run, invoke directly:
```bash
PROTOSTAR_DOGFOOD_PAT=<toy-repo-pat> ./scripts/dogfood.sh --runs 3
```
The script (line 19-22) calls `node apps/factory-cli/dist/main.js __dogfood-step` for orchestration, then (lines 41-54) `node apps/factory-cli/dist/main.js run --draft ... --executor real --planning-mode live --review-mode fixture --exec-coord-mode fixture --delivery-mode auto --trust trusted --confirmed-intent ...`. The exit gate (per Phase 10 Plan 08) is `≥10 runs ≥80% pr-ready`. For AUTH-15, planner picks a smaller bound — the **goal is "did Phase 12 break the loop"**, not full DOG-04 calibration. **3-run smoke at minimum, full 10 if time permits.**

**Secret-leak attack test design:**

Location: `packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts`

Target-repo fixture shape: a sacrificial repo (programmable via `buildSacrificialRepo` from `@protostar/repo/internal/test-fixtures` — Phase 3 plan 03-04) with a `package.json` whose `scripts.verify` is:
```json
{
  "scripts": {
    "verify": "echo TOKEN_LEAKED=$PROTOSTAR_GITHUB_TOKEN"
  }
}
```

Test flow:
1. Set `process.env.PROTOSTAR_GITHUB_TOKEN = "ghp_TESTSENTINEL12345678901234567890123456"` (a valid-shape fake matching `TOKEN_PATTERN`).
2. Invoke a minimal `runFactory`-like flow that triggers the mechanical-checks adapter against the sacrificial repo.
3. Read every artifact written under `<runDir>/review/mechanical/*.stdout.log` and `<runDir>/review/mechanical/*.stderr.log`.
4. Assert: **no captured log file contains the literal sentinel `ghp_TESTSENTINEL12345678901234567890123456`.**
5. **Use the same `TOKEN_PATTERN` constant** (imported from `@protostar/delivery/redact.ts` — see D-08 lift): `assert.equal(content.match(TOKEN_PATTERN), null)`. This pins the redaction filter and the attack test to one regex.

**Attack assertion shape (the load-bearing line):**
```typescript
import { TOKEN_PATTERNS } from "@protostar/delivery/redact";
// ...
for (const file of [stdoutFile, stderrFile, evidenceJsonFile]) {
  const content = await readFile(file, "utf8");
  for (const pattern of TOKEN_PATTERNS) {
    assert.equal(content.match(pattern), null,
      `${file} contains a token-shape match: ${content.match(pattern)?.[0]}`);
  }
}
```

If the attack passes (token NOT in logs), it proves: env scrubbing prevented the subprocess from seeing the token (D-06/D-07). If the env scrubbing regresses but redaction works, the token shape is replaced with `***` (D-08 belt-and-suspenders). The test is positive-pass on either defense holding.

**Pitfall:** the dogfood loop at `scripts/dogfood.sh:41-43` actively SETS `PROTOSTAR_GITHUB_TOKEN=$DOGFOOD_GITHUB_TOKEN` in the environment of the `node main.js run` parent. After D-06, the **subprocess runner** scrubs by default — but `main.ts:1198` reads the token from its own `process.env` to pass to Octokit (in-process, no spawn). This is by design (D-07). The attack test must NOT set `inheritEnv: ["PROTOSTAR_GITHUB_TOKEN"]` anywhere; if a test uses the runner with that allowlist, the env-empty-default contract test fails first.

## Project Constraints (from CLAUDE.md / AGENTS.md)

| Constraint | Source | Phase 12 Implication |
|------------|--------|----------------------|
| Only `apps/factory-cli` + `packages/repo` may touch fs | `AGENTS.md:23-26`; `.planning/PROJECT.md:60` | `diff-name-only` MUST land in `@protostar/repo`, not in mechanical-checks |
| `dogpile-adapter` is coordination-only | `AGENTS.md:18` | No Phase 12 implication; mechanical authority doesn't touch dogpile |
| `node:test` against compiled `dist/*.test.js` — no Jest/Vitest | `.planning/PROJECT.md:67` | Every new contract test follows the existing pattern |
| Strict TS: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` | `.planning/PROJECT.md:66` | Brand types must use proper exactOptional shapes |
| ESM only, `module: NodeNext`, `.js` import suffixes | `.planning/PROJECT.md:66` | All new files use `.js` import suffixes |
| No `utils` / `agents` / `factory` catch-all packages | `AGENTS.md:47` | Redaction module lives in `@protostar/delivery` (existing pure tier), NOT in a new `utils` package |
| `@protostar/paths` carve-out scope ceiling: only path resolution + node:path manipulation | `AGENTS.md:53-70` | `canonicalizeRelativePath` fits — pure compute over `node:path` |
| Branch names validated `^[a-zA-Z0-9._/-]+$`; never pass to shell unvalidated | `.planning/PROJECT.md:75` | No Phase 12 implication |
| No progress logs (dark factory) | `.planning/PROJECT.md:73` | Refusal evidence via typed JSON, not stderr text |
| Schema bumps cascade fixtures | `12-CONTEXT.md` `<code_context>` | Schema 1.5.0 → 1.6.0 cascades 25 source files |
| **D-04 schema bump non-negotiable** | `12-CONTEXT.md <specifics>` line 142 | Don't propose reusing `subprocess.allow` |
| **No tiered-verify variant** | `12-CONTEXT.md <specifics>` line 141 | Single unified `verify` only |

## Common Pitfalls

### Pitfall 1: Schema cascade leaves orphaned fixtures
**What goes wrong:** The 25 source-file 1.5.0 references include 2 *signed* fixtures (`examples/intents/scaffold.json`, `examples/intents/bad/missing-capability.json`). Bumping the const without re-signing leaves a signature mismatch — every signed-intent test fails at `verifyConfirmedIntentSignature`.
**Why:** Phase 7 plan 07-01 already paid this tax (19 files + 2 re-signs). 1.6.0 has the same shape.
**How to avoid:** Re-signing protocol documented in §"Schema Cascade 1.5.0 → 1.6.0" step 6. Use the Phase 2 c14n + signature pipeline; don't hand-craft hashes.
**Warning signs:** Any test failing with `signature: { canonicalForm: "json-c14n@1.0", hash: ... }` mismatch points at a stale fixture.

### Pitfall 2: `inheritEnv` regression via implicit default
**What goes wrong:** A new caller of `runCommand` forgets to specify `inheritEnv`, defaults to baseline-only (good), then a test fails because the spawned process needs an env var the test author didn't think about (e.g., `NODE_PATH`). The author "fixes" it by setting `inheritEnv: Object.keys(process.env)` — full regress.
**Why:** TypeScript's `?` makes it easy to forget the option entirely.
**How to avoid:** Make `inheritEnv` REQUIRED (not optional). Force every call site to think about it. Default `[]` lives in the call site (explicit), not in the function signature.
**Warning signs:** A `inheritEnv: Object.keys(...)` or `inheritEnv: process.env` in any code review.

### Pitfall 3: Redaction filter applied AFTER persistence
**What goes wrong:** Code writes raw stdout to disk, then later reads it for evidence assembly and redacts at JSON.stringify time. A second consumer (e.g., a future evidence-zipper) reads the raw file and ships it.
**Why:** Persistence is the canonical record; if it's not redacted, every consumer must re-redact.
**How to avoid:** Redact at the read boundary AT MINIMUM. Tail-string in `SubprocessResult` and JSON evidence are both read-side — redact there. On-disk raw logs are okay-but-flagged because they're NEVER directly shipped — only via JSON evidence.
**Alternative:** Redact at write — buffer stream, redact, flush. Higher complexity due to chunk boundaries.
**Warning signs:** A file appears in a Phase 7 PR body's evidence bundle without going through the redactor.

### Pitfall 4: `inferMechanicalName(argv)` brittle to argv shape drift
**What goes wrong:** `wiring/command-execution.ts` infers the mechanical name from `command.argv = ["pnpm","verify"]`. If a future change makes the adapter pass `argv = ["pnpm","run","verify"]`, the inference breaks.
**Why:** Two layers (adapter passes argv, runner re-derives name) duplicate the binding.
**How to avoid:** Change the adapter interface — `MechanicalChecksSubprocessRunner.runCommand` accepts `name: MechanicalCommandName` directly, not argv. The adapter at `create-mechanical-checks-adapter.ts:73-78` reshapes its own loop to map command-config → name → invoke runner. **Recommendation: do this reshape in the same wave as D-03.**
**Warning signs:** any mismatch between `MECHANICAL_COMMAND_BINDINGS` and what adapter passes.

### Pitfall 5: Canonicalization helper diverges between PatchRequest mint and `applyChangeSet` re-assertion
**What goes wrong:** Two copies of the canonicalization logic — one in PatchRequest brand constructor, one in defense-in-depth re-check inside `applyChangeSet`. They drift; brand mint accepts something the re-check rejects (or vice versa). Re-check throws on a path that should be valid.
**Why:** Convenience copy.
**How to avoid:** ONE module. ONE export. Both call sites import it. The contract test in D-09 specifically asserts the round-trip is symmetric.

### Pitfall 6: `tier-conformance` extension parses AGENTS.md fragilely
**What goes wrong:** AGENTS.md edits a tier line (e.g., adds a fifth tier label like "domain orchestration"), the regex parser silently misclassifies, the assertion still passes, drift goes undetected.
**Why:** Markdown is not a strict schema.
**How to avoid:** The parser MUST emit the parsed result and assert on the exact set of expected tier labels. If AGENTS.md ever has a tier line the parser doesn't recognize, fail loudly. Regex provides shape; explicit `assertedTiers === EXPECTED_TIERS` provides correctness.

### Pitfall 7: Full unified verify exposes flake from Phase 6 Plan 06-09
**What goes wrong:** `verify:full` was historically tolerated because the `run-real-execution.test.ts` flake under chained verify (per STATE.md note about Plan 06-09) was a known issue. Unifying verify means every local run hits this flake.
**Why:** Plan 06-09 (verify-gate flake fix) is listed as Pending in `STATE.md:230`. Phase 12 may surface it.
**How to avoid:** Re-run `pnpm run verify` 5 times locally as part of AUTH-01 verification (matches the original PLAN-A-03 invariant). If flake persists, fold Plan 06-09's diagnosis into a Phase 12 plan.
**Warning signs:** Intermittent test failure in `apps/factory-cli/src/run-real-execution.test.ts` only under `pnpm run verify`.

### Pitfall 8: Mechanical command capability envelope default `[]` breaks cosmetic-tweak runs
**What goes wrong:** Schema 1.6.0 adds `capabilityEnvelope.mechanical.allowed: string[]` defaulting to `[]`. Existing fixtures don't have a `mechanical` block. Their effective allowed set is empty. Every cosmetic-tweak run fails because `verify` and `lint` are not in the allowed set.
**Why:** Schema bumps default-deny by spec.
**How to avoid:** Step 8 of the cascade recipe — add `mechanical: { allowed: ["verify", "lint"] }` to every fixture and example intent. Re-sign the signed ones.
**Warning signs:** Phase 10 dogfood re-run (D-15) fails with `MechanicalCommandRefusedError("not-in-capability-envelope", "verify")`.

## Code Examples

### Verified Pattern: Phase 7 schema cascade re-sign
```typescript
// from packages/authority/src/signature/sign-verify.test.ts:29 (existing)
readonly schemaVersion: "1.5.0";
// pattern: every test that constructs a ConfirmedIntent literal updates this string.
// re-signing flows through buildSignatureEnvelope (Phase 2) — the test reconstructs
// the signed envelope when it builds its fixture.
```

### Verified Pattern: Phase 3 subprocess refusal evidence
```typescript
// packages/repo/src/subprocess-runner.ts:51-64 (existing)
export type SubprocessRefusedReason =
  | "command-not-allowlisted"
  | "no-schema"
  | "argv-violation";

export class SubprocessRefusedError extends Error {
  constructor(
    public readonly reason: SubprocessRefusedReason,
    message: string
  ) { super(message); this.name = "SubprocessRefusedError"; }
}
// New mechanical refusals in D-03 follow the same shape:
// type MechanicalCommandRefusalReason = "not-in-capability-envelope" | "unknown-name";
```

### Verified Pattern: Phase 10.1 tier-conformance manifest read
```typescript
// packages/admission-e2e/src/tier-conformance.contract.test.ts:187-201 (existing)
async function readPackage(dir: string): Promise<WorkspacePackage | null> {
  const manifestPath = resolve(dir, "package.json");
  if (!await exists(manifestPath)) return null;
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("@protostar/")) return null;
  return {
    name: manifest.name,
    dir,
    manifest,
    tier: manifest.protostar?.tier,    // ← already canonical
    deps: Object.keys(manifest.dependencies ?? {}).filter((dep) => dep.startsWith("@protostar/")).sort(),
    refs: []
  };
}
// D-12 extends this with AGENTS.md parser + PACKAGE_RULES extractor.
```

### Verified Pattern: existing redaction site (lift target for D-08)
```typescript
// packages/delivery-runtime/src/map-octokit-error.ts:6 (existing)
export const TOKEN_PATTERN = /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59,})\b/g;
// :88-90
function redact(value: string): string {
  return value.replace(TOKEN_PATTERN, "***");
}
// LIFT to packages/delivery/src/redact.ts (pure tier) so both
// delivery-runtime + repo subprocess-runner + secret-leak-attack test consume one constant.
```

## State of the Art

| Old Approach (pre-Phase 12) | New Approach (post-Phase 12) | Impact |
|------------------------------|------------------------------|--------|
| `verify` (skip-listed) ≠ `verify:full` (CI) | One unified `verify` | CI and local match exactly; subpath checker + knip run in CI |
| Mechanical commands as raw `spawn` of operator-supplied argv | `runCommand` from `@protostar/repo` with closed-allowlist names + capability envelope | Refusal evidence + deterministic argv + signed admission |
| Subprocess inherits `process.env` | Subprocess gets POSIX baseline + per-call `inheritEnv` allowlist | Token cannot leak to subprocess by accident |
| Mechanical-checks imports `isomorphic-git` (violates pure tier) | `computeDiffNameOnly` lives in `@protostar/repo`; mechanical-checks consumes injected diff names | Pure tier integrity; no-net contract holds |
| `PatchRequest` is structural — three-source path/op/diff disagreement silently corrupts files | Branded with mint constructor + defense-in-depth re-assertion | Display-vs-write attack surface closed |
| Three sources of tier truth (manifest, AGENTS.md, contract test) drift independently | Three-way assertion in `tier-conformance.contract.test.ts` | Drift becomes a node:test failure |
| `evaluation-runner` manifest claims `network`, contract claims `pure` (active drift) | Reconciled — manifest is canonical, contract flips | One source of truth per D-11 |

**Deprecated/outdated:**
- `verify:full` script — removed.
- `runSpawnedCommand` at `apps/factory-cli/src/main.ts:1873-1931` — deleted as dead code.
- `import { spawn } from "node:child_process"` at `main.ts:6` — deleted.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `AuthorizedWorkspaceOp` has a `.path` field for D-09 path-mismatch check | applyChangeSet path/op/diff | Brand constructor signature shape changes; planner verifies during Wave 1 by reading `packages/repo/src/fs-adapter.ts` |
| A2 | The `evaluation-runner` honest tier is `network` (not split) | Boundary truth source | If split chosen, an extra package skeleton is needed; +1 plan in Wave 3 |
| A3 | The closed mechanical command allowlist `["verify","typecheck","lint","test"]` covers every existing operator use case | Mechanical command authority | If a fixture uses a custom mechanical command, that fixture needs adjustment OR the allowlist needs another name. Mitigation: grep all `mechanicalChecks.commands` references before Wave 0 begins. |
| A4 | `pnpm` schema at `packages/repo/src/subprocess-schemas/pnpm.ts` already covers the argv shapes the four mechanical names need (`run verify`, `run typecheck`, `run lint`, `-r test`) | Mechanical command authority | If schema needs extension, Wave 0 includes a small schema PR. Confirmed by reading `subprocess-schemas/pnpm.ts` during planning. |
| A5 | `parsePatch` in `diff@9` returns filenames with `a/` and `b/` prefixes — the canonicalize helper must strip these | applyChangeSet path/op/diff | If diff library returns un-prefixed names, the strip logic is a no-op (still safe). Verify with a quick `parsePatch("--- a/foo.ts\n+++ b/foo.ts\n@@ ...")` test. |
| A6 | Lifting `TOKEN_PATTERN` into `@protostar/delivery/redact.ts` doesn't introduce a new dep edge that violates `tier-conformance` | Token redaction | `repo` (fs) → `delivery` (pure) is fs → pure, allowed by tier rules. Confirmed by `tier-conformance.contract.test.ts:91-115`. |
| A7 | The schema cascade exhaustively covered by 25 source-file scan (excluding `dist/`) | Schema cascade | If a `.json` file outside the search has `"1.5.0"` in a non-schemaVersion context, missed. Mitigation: planner re-runs the rg before final commit. |
| A8 | The Phase 6 Plan 06-09 verify-gate flake is genuinely fixed by now (STATE.md says "Pending") OR rare enough that the unification doesn't expose it | Verify script collapse | If flake re-emerges, AUTH-01 needs to fold in 06-09's diagnosis. |

**These assumptions need user confirmation or planning-time verification before AUTH-NN tasks finalize.** A1/A4/A5 are fast file-read confirmations; A2 is a planner judgment call; A3/A7 need a one-liner grep; A6 needs a tier-conformance dry-run; A8 needs 5 verify reruns.

## Open Questions

1. **Should `evaluation-runner` split into `pure orchestrator + network adapter`?** (D-13 explicit)
   - What we know: src/ has zero direct net imports; transitive network reach via `@protostar/dogpile-adapter`.
   - What's unclear: whether the planner judges the split worth a new package skeleton.
   - Recommendation: keep as `network` (single-package); flip `authority-boundary.contract.test.ts:77` to match. Defer split to a future phase.

2. **Where does the canonicalize-relative-path helper land?**
   - What we know: AGENTS.md `@protostar/paths` carve-out permits this exact use case (`AGENTS.md:60-66`).
   - What's unclear: whether the planner prefers to add a second helper to paths or co-locate inside `@protostar/repo/src/internal/`.
   - Recommendation: `@protostar/paths` — the carve-out scope ceiling fits.

3. **Where does `redactTokens` land?**
   - What we know: existing site is `delivery-runtime/src/map-octokit-error.ts`; `delivery` is pure-tier and already imported.
   - What's unclear: whether the planner accepts `repo (fs) → delivery (pure)` as a new edge or prefers a third location.
   - Recommendation: `@protostar/delivery/redact.ts`. Single shared module, valid tier direction.

4. **Three-run vs ten-run dogfood loop for AUTH-15?** (D-15)
   - What we know: full DOG-04 is `≥10×≥80%`; Phase 12's goal is "did we break the loop", not full calibration.
   - What's unclear: whether the operator wants a quick 3-run smoke or full 10.
   - Recommendation: start with 3-run smoke; full 10 only if smoke surfaces a regression.

## Environment Availability

Phase 12 is purely code/config — no new external tools. All required tools confirmed present (per `STATE.md` showing successful prior verify runs):

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pnpm@10.33.0` | All package operations | ✓ | per `package.json:6` | — |
| Node ≥22 | Runtime | ✓ | per `engines.node:24` | — |
| TypeScript `^6.0.3` | Build | ✓ | per `package.json:21` | — |
| `isomorphic-git@1.37.6` | Diff-name-only relocation | ✓ already in tree | per `repo/package.json` | — |
| `diff@9.0.0` | applyChangeSet | ✓ already in tree | per `apply-change-set.ts:3` | — |
| `knip@^5.88.1` | Verify chain | ✓ | per `package.json:20` | — |
| GitHub PAT (`PROTOSTAR_GITHUB_TOKEN` or `PROTOSTAR_DOGFOOD_PAT`) | AUTH-15 dogfood re-run | operator-provided | — | run AUTH-15 sub-tests offline; defer dogfood to a later operator session |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `node --test` against compiled `dist/*.test.js` (built-in, no extra dep) |
| Config file | none — per-package `package.json:scripts.test` |
| Quick run command | `pnpm --filter @protostar/<package> test` for the single package under change |
| Full suite command | `pnpm run verify` (post-D-01 — single command for both local and CI) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| AUTH-01 | unified `verify` runs all packages + knip + subpath checker green | smoke | `pnpm run verify` | ✅ existing (will be modified) |
| AUTH-02 | mechanical-checks src/ has no `isomorphic-git` import | unit (static scan) | `pnpm --filter @protostar/mechanical-checks test` (existing `no-net.contract.test.ts` covers this) | ✅ `packages/mechanical-checks/src/no-net.contract.test.ts` |
| AUTH-02 | `computeDiffNameOnly` exported from `@protostar/repo` | unit | `pnpm --filter @protostar/repo test` (move existing test) | ✅ moved file |
| AUTH-03 | mechanical commands routed via `runCommand`; raw spawn deleted | unit (static scan + integration) | `pnpm --filter @protostar/admission-e2e test --test-name-pattern mechanical-via-repo` | ❌ Wave 0 — `mechanical-via-repo.contract.test.ts` |
| AUTH-04 | `confirmedIntent.schemaVersion === "1.6.0"` const-asserted; `mechanical.allowed` enum closed | unit | `pnpm --filter @protostar/intent test` + `pnpm --filter @protostar/admission-e2e test --test-name-pattern signed-intent-1-6-0` | ✅ existing (renamed); ❌ schema bump |
| AUTH-05 | mechanical command cwd === workspaceRoot | unit | extends `mechanical-via-repo.contract.test.ts` (one assertion) | ❌ Wave 0 |
| AUTH-06 | subprocess-runner default child env is POSIX baseline + inheritEnv | integration | `pnpm --filter @protostar/admission-e2e test --test-name-pattern env-empty-default` | ❌ Wave 0 — `env-empty-default.contract.test.ts` |
| AUTH-07 | `inheritEnv` cannot include PROTOSTAR_GITHUB_TOKEN (static scan) | unit (static) | extends `env-empty-default.contract.test.ts` (one assertion) | ❌ Wave 0 |
| AUTH-08 | redaction patterns scrub token shapes from evidence logs | unit | extends `mechanical-via-repo.contract.test.ts` + `redact.test.ts` in `@protostar/delivery` | ❌ Wave 0 — `packages/delivery/src/redact.test.ts` |
| AUTH-09 | `mintPatchRequest` refuses path/op/diff mismatch | unit | `pnpm --filter @protostar/admission-e2e test --test-name-pattern apply-change-set-mismatch` | ❌ Wave 0 — `apply-change-set-mismatch.contract.test.ts` |
| AUTH-10 | canonicalization round-trip: `./foo === foo === a/b/../foo === foo` | unit | extends `apply-change-set-mismatch.contract.test.ts` | ❌ Wave 0 |
| AUTH-11 | every package manifest declares `protostar.tier` (already enforced) | unit | `pnpm --filter @protostar/admission-e2e test --test-name-pattern tier-conformance` | ✅ `tier-conformance.contract.test.ts` (extends, doesn't replace) |
| AUTH-12 | `tier-conformance` cross-asserts manifest == AGENTS.md == authority-boundary | unit (static, three-source parse) | same as AUTH-11 (extended assertions) | ✅ extension |
| AUTH-13 | `evaluation-runner` tier reconciled with imports (manifest = `network`) | unit | `pnpm --filter @protostar/admission-e2e test --test-name-pattern authority-boundary` (after `authority-boundary.contract.test.ts:77` flip) | ✅ existing (modified) |
| AUTH-14 | `wiring/command-execution.ts` + `wiring/delivery.ts` exist; `main.ts` no longer imports `node:child_process` | unit (static scan) | `pnpm --filter @protostar/factory-cli test` + admission-e2e static scan | ❌ Wave 0 — extend tier-conformance OR add small contract test |
| AUTH-15 | dogfood loop completes ≥1 run end-to-end on `protostar-toy-ttt` AND no token shape in evidence | integration (manual + automated) | `./scripts/dogfood.sh --runs 3` (manual) + `pnpm --filter @protostar/admission-e2e test --test-name-pattern secret-leak-attack` | ❌ Wave 0 — `secret-leak-attack.contract.test.ts` |
| AUTH-16 | (no test artifact — see note below) | — | — | — |

**AUTH-16 note:** AUTH-16 is "Phase 12 runs after Phase 11 as roadmapped" — a pre-execution ordering check enforced by the orchestrator before phase 12 begins, not a phase-internal contract. **Planner: do not create a test for AUTH-16.** Reflect this in the requirement description as `(no test artifact — pre-phase orchestrator check)`.

### Sampling Rate
- **Per task commit:** `pnpm --filter <changed-package> test` (≤30s)
- **Per wave merge:** `pnpm run verify` (full unified, post-D-01)
- **Phase gate:** `pnpm run verify` green + `./scripts/dogfood.sh --runs 3` green + secret-leak-attack contract green; then `/gsd-verify-work`.

### Wave 0 Gaps (test infrastructure to scaffold before implementation)
- [ ] `packages/admission-e2e/src/contracts/mechanical-via-repo.contract.test.ts` — covers AUTH-03, AUTH-05
- [ ] `packages/admission-e2e/src/contracts/env-empty-default.contract.test.ts` — covers AUTH-06, AUTH-07
- [ ] `packages/admission-e2e/src/contracts/apply-change-set-mismatch.contract.test.ts` — covers AUTH-09, AUTH-10
- [ ] `packages/admission-e2e/src/contracts/secret-leak-attack.contract.test.ts` — covers AUTH-15 attack half
- [ ] `packages/delivery/src/redact.ts` + `redact.test.ts` — covers AUTH-08 (pattern lift)
- [ ] `packages/admission-e2e/src/signed-intent-1-6-0.test.ts` (rename of existing 1-5-0) — covers AUTH-04
- [ ] Schema bump confirmed-intent 1.5.0 → 1.6.0 + 25-file cascade — covers AUTH-04
- [ ] tier-conformance extension assertions for AGENTS.md + authority-boundary parse — covers AUTH-12

No new test framework install needed — `node --test` is built-in and already used.

## Security Domain

`security_enforcement` is enabled (default — not explicitly false).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes — token-based GitHub auth | Octokit + `onAuth` shim (D-07) keeps token at library boundary; never crosses subprocess |
| V3 Session Management | no | n/a (single-shot CLI, no sessions) |
| V4 Access Control | yes | Capability envelope (`mechanical.allowed[]`) — admission-time authorization for mechanical commands (D-04); precedence kernel (Phase 2) |
| V5 Input Validation | yes | Subprocess argv validation: outer pattern guard + per-command schemas (Phase 3 plans 03-08, 03-09) — inherited; mechanical name closed-enum at admission |
| V6 Cryptography | yes — secret redaction | `TOKEN_PATTERN` shared constant lifted into `@protostar/delivery/redact.ts` (D-08); never hand-roll regex |
| V7 Error Handling | yes | Refusal evidence is typed JSON; `SubprocessRefusedError` + new `MechanicalCommandRefusedError` follow same shape |
| V12 File and Resources | yes | `applyChangeSet` path/op/diff invariant (D-09/D-10); canonicalize-relative-path single helper |
| V13 API and Web Service | yes (delivery boundary) | Octokit retry/throttle + sanitization (Phase 7 plan 07-06 inherited) |
| V14 Configuration | yes | `subprocess-runner.ts` env baseline (D-06); no implicit env inheritance |

### Known Threat Patterns for Phase 12 stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Subprocess argv injection (operator-supplied free-form argv) | Tampering / Elevation of Privilege | Closed allowlist + per-command schema (D-03/D-04) |
| Secret leak via subprocess stdout/stderr (target-repo `verify` echoes `$PROTOSTAR_GITHUB_TOKEN`) | Information Disclosure | Env scrubbing (D-06) primary; redaction filter (D-08) defense-in-depth; secret-leak attack test (D-15) verifies |
| Display-vs-write split in `applyChangeSet` (path != op.path != diff filename) | Tampering | Branded `PatchRequest` mint constructor (D-09) primary; `applyChangeSet` re-assertion (D-09) defense-in-depth |
| Authority drift between manifest, AGENTS.md, contract | Repudiation / Tampering | Three-way `tier-conformance.contract.test.ts` extension (D-12) makes drift a test failure |
| Operator escalation via custom mechanical command | Elevation of Privilege | Schema 1.6.0 `mechanical.allowed[]` requires admission-time signing of allowed names (D-04); operator config can only INTERSECT this set, not extend it |
| Token leak via verify-script divergence (CI fails differently than local) | Repudiation | Verify script collapse (D-01) — no skip lists, no divergence |
| Path traversal in `applyChangeSet` (workspace escape via `../`) | Elevation of Privilege | Existing `node:path` canonicalization in `fs-adapter.ts` (Phase 3 plan 03-05); D-10 canonicalize helper rejects absolute + `..`-escaping inputs |

## Sources

### Primary (HIGH confidence — file paths in this repo)
- `.planning/phases/12-authority-boundary-stabilization/12-CONTEXT.md` — locked decisions D-01..D-16
- `.planning/phases/12-authority-boundary-stabilization/12-SEED.md` — operator-supplied review findings
- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `.planning/STATE.md` — project locks and current state
- `AGENTS.md:23-70` — tier table + paths carve-out + accepted back-edges
- `package.json:11-12` — current verify scripts
- `.github/workflows/verify.yml:11, 31` — CI gate
- `packages/repo/src/subprocess-runner.ts` — env-default sites; refusal pattern
- `packages/repo/src/apply-change-set.ts:8-17, 65, 82, 114` — current PatchRequest interface
- `packages/repo/src/index.ts` — barrel exports (no `computeDiffNameOnly` yet — D-02 adds)
- `packages/repo/src/clone-workspace.ts:69, 80, 170-174` — token NEVER passes via subprocess; `onAuth` library boundary
- `packages/mechanical-checks/src/diff-name-only.ts:1-2` — `isomorphic-git` import to relocate
- `packages/mechanical-checks/src/no-net.contract.test.ts:23` — `isomorphic-git` already in forbidden patterns
- `packages/mechanical-checks/src/create-mechanical-checks-adapter.ts:7, 16, 48-58, 115-119` — diff consumption + adapter config shape
- `packages/mechanical-checks/package.json:24, 36` — `isomorphic-git` dep + tier=`pure`
- `packages/lmstudio-adapter/src/factory-config.schema.json:187-199` — current mechanical argv schema
- `packages/intent/src/confirmed-intent.ts:44, 86, 117, 296, 307, 312` — schemaVersion literal sites
- `packages/intent/schema/confirmed-intent.schema.json:21` — schema const
- `packages/admission-e2e/src/tier-conformance.contract.test.ts` — extension target (lines 187-201 manifest read)
- `packages/admission-e2e/src/contracts/authority-boundary.contract.test.ts:62-106, 77` — PACKAGE_RULES + evaluation-runner drift
- `packages/admission-e2e/src/signed-intent-1-5-0.test.ts:96` — fixture cascade source
- `packages/evaluation-runner/package.json:38` — manifest `tier: network`
- `packages/evaluation-runner/src/run-evaluation-stages.ts:1-38` — actual imports
- `packages/delivery-runtime/src/map-octokit-error.ts:6, 88-90` — existing `TOKEN_PATTERN` + `redact()` (lift target)
- `packages/delivery-runtime/src/push-branch.ts:128, 219` — `onAuth` library-boundary token use
- `apps/factory-cli/src/main.ts:6, 1198-1199, 1831-1871, 1873-1931, 1892` — token site, mechanical runner, raw spawn (dead code post-D-03)
- `apps/factory-cli/src/wiring/review-loop.ts:115-125, 127-143, 214-223` — `defaultMechanicalCommandsForArchetype`, adapter config, `configuredMechanicalCommands`
- `scripts/dogfood.sh:19-54, 41-43` — Phase 10 dogfood entrypoint + token env-set point
- `.planning/phases/03-repo-runtime-sandbox/03-08-subprocess-allowlist-and-schemas-PLAN.md` — per-command schema pattern
- `.planning/phases/07-delivery/07-01-schema-cascade-PLAN.md` — 1.4.0 → 1.5.0 cascade reference
- `.planning/phases/10.1-boundary-hygiene-pass/` — tier classification approach Phase 12 builds on (referenced in CONTEXT)

### Secondary (MEDIUM confidence — verified by grep)
- 25-source-file 1.5.0 cascade scope — confirmed by `grep -rln '"1\.5\.0"' packages/*/src apps/*/src packages/*/schema packages/*/internal apps/factory-cli/src examples/`
- mechanical-checks `computeDiffNameOnly` sole consumer is `create-mechanical-checks-adapter.ts:115-119` — confirmed by `grep -rn "diffNameOnly\|computeDiffNameOnly" packages/`
- subprocess-runner consumers — confirmed by `grep -rn "subprocess-runner\|runCommand\|MechanicalChecksSubprocessRunner" packages/ apps/`

### Tertiary (LOW confidence — Claude's training)
- GitHub PAT prefix taxonomy (`ghp_/gho_/ghu_/ghs_/ghr_` and fine-grained `github_pat_`) — covered already by existing `TOKEN_PATTERN` in `delivery-runtime/src/map-octokit-error.ts:6`. Bearer + JWT extensions added per training; verify with a quick test against real-world examples during Wave 0.

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — no new deps; every recommended pattern is in-tree with file paths.
- Architecture: **HIGH** — every decision maps to a precise call site identified by line number; the wiring decomposition has a verified target shape.
- Pitfalls: **HIGH** — every pitfall is grounded in either a current code site or a documented prior-phase issue (Plan 06-09 flake; 07-01 cascade tax).
- Schema cascade scope: **HIGH** — exact file count via grep; recipe extracted from prior 07-01 plan.
- Token redaction: **MEDIUM-HIGH** — existing pattern lift; bearer/JWT extension is a sound additive change but should be verified against real examples in Wave 0.
- Boundary truth source extension: **HIGH** — extension target file already exists and reads manifest tier; AGENTS.md + PACKAGE_RULES parsing is straightforward.

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (30 days — stack and patterns are stable post-Phase 10.1)
