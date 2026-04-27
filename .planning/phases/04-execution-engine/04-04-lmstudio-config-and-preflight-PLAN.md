---
phase: 04-execution-engine
plan: 04
type: execute
wave: 1
depends_on: [03]
files_modified:
  - packages/lmstudio-adapter/src/factory-config.ts
  - packages/lmstudio-adapter/src/factory-config.test.ts
  - packages/lmstudio-adapter/src/factory-config.schema.json
  - packages/lmstudio-adapter/src/preflight.ts
  - packages/lmstudio-adapter/src/preflight.test.ts
  - packages/lmstudio-adapter/src/index.ts
autonomous: true
requirements: [EXEC-03]
must_haves:
  truths:
    - "`resolveFactoryConfig` is a PURE function: takes `{ fileBytes?: string, env: Record<string, string|undefined> }`, returns `{ config, configHash }`. No `node:fs` import."
    - "Defaults: baseUrl=http://localhost:1234/v1, model=qwen3-coder-next-mlx-4bit, apiKeyEnv=LMSTUDIO_API_KEY"
    - "Env overrides LMSTUDIO_BASE_URL, LMSTUDIO_MODEL, LMSTUDIO_API_KEY take precedence over file values"
    - "configHash is computed via `@protostar/authority` json-c14n@1.0 canonicalizer over the resolved config"
    - "preflightLmstudio classifies into one of: ok | unreachable | model-not-loaded | empty-models | http-error"
    - "Preflight does NOT mint AuthorizedNetworkOp (consumed by gate caller); takes a pre-minted op or raw URL+signal"
  artifacts:
    - path: packages/lmstudio-adapter/src/factory-config.ts
      provides: "Pure config resolver + hasher"
      exports: ["resolveFactoryConfig", "FactoryConfig", "ResolvedFactoryConfig"]
    - path: packages/lmstudio-adapter/src/factory-config.schema.json
      provides: "JSON Schema for factory-config.json file"
    - path: packages/lmstudio-adapter/src/preflight.ts
      provides: "GET /v1/models classifier"
      exports: ["preflightLmstudio", "PreflightResult"]
  key_links:
    - from: "packages/lmstudio-adapter/src/factory-config.ts"
      to: "@protostar/authority json-c14n@1.0"
      via: "config-hash computation"
      pattern: "canonicalize|c14n"
---

<objective>
Ship the **pure** factory-config resolver (file+env+default merge with hash) and the LM Studio preflight classifier (`GET /v1/models` → `ok | unreachable | model-not-loaded | empty-models | http-error`). Per advisor #3, the resolver is fs-pure: factory-cli (Plan 10) reads the file and passes bytes in.

Purpose: Wave 2 admission gate (Plan 10) calls `preflightLmstudio` and `resolveFactoryConfig` without violating the authority boundary.
Output: factory-config + schema + preflight, all under `packages/lmstudio-adapter/src/`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/04-execution-engine/04-CONTEXT.md
@.planning/phases/04-execution-engine/04-RESEARCH.md
@.planning/phases/04-execution-engine/04-PATTERNS.md
@.planning/phases/04-execution-engine/04-03-stub-server-and-fixture-PLAN.md
@AGENTS.md
@apps/factory-cli/src/load-repo-policy.ts

<interfaces>
```typescript
// factory-config.ts
export interface FactoryConfig {
  readonly adapters: {
    readonly coder: {
      readonly provider: "lmstudio";
      readonly baseUrl: string;
      readonly model: string;
      readonly apiKeyEnv: string;
      readonly temperature?: number;          // default 0.2
      readonly topP?: number;                  // default 0.9
    };
  };
}

export interface ResolvedFactoryConfig {
  readonly config: FactoryConfig;
  readonly configHash: string;                 // hex sha256 of c14n(config)
  readonly resolvedFromFile: boolean;
  readonly envOverridesApplied: readonly ("LMSTUDIO_BASE_URL"|"LMSTUDIO_MODEL"|"LMSTUDIO_API_KEY")[];
}

export type ResolveFactoryConfigResult =
  | { readonly ok: true; readonly resolved: ResolvedFactoryConfig; readonly errors: readonly [] }
  | { readonly ok: false; readonly errors: readonly string[] };

export function resolveFactoryConfig(input: {
  readonly fileBytes?: string;                  // file contents OR undefined if absent (factory-cli reads file)
  readonly env: Readonly<Record<string, string | undefined>>;
}): ResolveFactoryConfigResult;
```

```typescript
// preflight.ts
import type { AuthorizedNetworkOp } from "@protostar/authority";

export type PreflightResult =
  | { readonly outcome: "ok"; readonly availableModels: readonly string[] }
  | { readonly outcome: "unreachable"; readonly errorClass: string; readonly errorMessage: string }
  | { readonly outcome: "model-not-loaded"; readonly model: string; readonly availableModels: readonly string[] }
  | { readonly outcome: "empty-models"; readonly availableModels: readonly [] }
  | { readonly outcome: "http-error"; readonly status: number; readonly bodySnippet: string };

export interface PreflightInput {
  readonly authorizedOp: AuthorizedNetworkOp;   // pre-minted by caller (factory-cli) for GET {baseUrl}/models
  readonly model: string;                        // configured model id to look for
  readonly signal: AbortSignal;
  readonly fetchImpl?: typeof fetch;             // injectable for tests; defaults to global fetch
}

export function preflightLmstudio(input: PreflightInput): Promise<PreflightResult>;
```

Authority lock (AGENTS.md + advisor #3): `factory-config.ts` MUST NOT import `node:fs`. The factory-cli wrapper in Plan 10 does the read.

Hash invariant: `configHash` is `sha256(c14n({ adapters: ... }))` — uses `@protostar/authority`'s json-c14n@1.0 (already shipped Phase 2). Resolved config (post-env-override) is what's hashed; stored in policy snapshot for governance.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: factory-config schema + pure resolver</name>
  <files>packages/lmstudio-adapter/src/factory-config.schema.json, packages/lmstudio-adapter/src/factory-config.ts, packages/lmstudio-adapter/src/factory-config.test.ts, packages/lmstudio-adapter/src/index.ts</files>
  <read_first>
    - apps/factory-cli/src/load-repo-policy.ts (loader-with-defaults pattern, lines 1-29)
    - packages/intent/schema/capability-admission-decision.schema.json (schema layout template)
    - packages/authority/src (find json-c14n@1.0 canonicalizer export)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-09
  </read_first>
  <behavior>
    - Test 1: `resolveFactoryConfig({ env: {} })` returns defaults: `baseUrl: 'http://localhost:1234/v1'`, `model: 'qwen3-coder-next-mlx-4bit'`, `apiKeyEnv: 'LMSTUDIO_API_KEY'`.
    - Test 2: With `fileBytes` providing `{ adapters: { coder: { baseUrl: "http://other:5555/v1" } } }`, file values override defaults; missing fields fall back to defaults.
    - Test 3: With `env: { LMSTUDIO_BASE_URL: "http://envhost:9999/v1" }`, env overrides file → `baseUrl === "http://envhost:9999/v1"`; `envOverridesApplied` includes `"LMSTUDIO_BASE_URL"`.
    - Test 4: Two equivalent inputs (same resolved config) produce identical `configHash`; different `model` produces different hash.
    - Test 5: Malformed `fileBytes` (invalid JSON) → `{ ok: false, errors: [...] }`.
    - Test 6: File schema-violation (unknown top-level key) → `{ ok: false, errors: [...] }` with the error mentioning `additionalProperties`.
    - Test 7: Schema file matches the structure used at runtime — load-and-validate against the resolved-config object.
  </behavior>
  <action>
    1. Create `packages/lmstudio-adapter/src/factory-config.schema.json` — `$schema` 2020-12, `$id: "https://protostar.local/schema/factory-config.schema.json"`, `additionalProperties: false`, `required: ["adapters"]`, `adapters.coder` requires `provider` (`const: "lmstudio"`), `baseUrl` (string), `model` (string), `apiKeyEnv` (string, default `"LMSTUDIO_API_KEY"`); optional `temperature`, `topP`.
    2. Create `factory-config.ts`:
       - Import the json-c14n canonicalizer from `@protostar/authority` (locate exact export name during impl — search for `c14n` or `canonicalize`).
       - Default config constant with all four required fields.
       - `resolveFactoryConfig({ fileBytes, env })`:
         - If `fileBytes`: `JSON.parse` (catch → error). Validate shape inline (manual checks: `additionalProperties: false` style — since we don't ship Ajv, hand-code field allow-list).
         - Merge: defaults ← file ← env (env beats file beats defaults). Track which env vars actually overrode something in `envOverridesApplied`.
         - Compute `configHash = hex(sha256(c14n(merged)))`.
         - Return `{ ok: true, resolved: { config, configHash, resolvedFromFile, envOverridesApplied }, errors: [] }`.
       - NO `node:fs`. NO `node:path`. Pure function.
    3. Add to barrel `packages/lmstudio-adapter/src/index.ts`: `export { resolveFactoryConfig, type FactoryConfig, type ResolvedFactoryConfig } from "./factory-config.js";`.
    4. Tests: cover all 7 behaviors using `node:test`. Hash test: assert two semantically-equal-but-key-reordered inputs produce same hash (proves c14n).
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -25 && ! grep -E "node:fs|node:path|readFile" packages/lmstudio-adapter/src/factory-config.ts && grep -c "configHash" packages/lmstudio-adapter/src/factory-config.ts</automated>
  </verify>
  <acceptance_criteria>
    - `factory-config.ts` and `factory-config.schema.json` exist
    - `grep -E "node:fs|readFile" packages/lmstudio-adapter/src/factory-config.ts` returns nothing
    - All 7 tests pass
    - `grep -c "configHash" packages/lmstudio-adapter/src/factory-config.ts` ≥ 2
    - Barrel re-exports the resolver
  </acceptance_criteria>
  <done>Pure resolver shipped; factory-cli (Plan 10) will read the file and pass bytes in.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: preflight.ts classifier</name>
  <files>packages/lmstudio-adapter/src/preflight.ts, packages/lmstudio-adapter/src/preflight.test.ts, packages/lmstudio-adapter/src/index.ts</files>
  <read_first>
    - packages/lmstudio-adapter/internal/test-fixtures/stub-lmstudio-server.ts (Plan 03 — for tests)
    - packages/authority/src/authorized-ops/network-op.ts (AuthorizedNetworkOp shape)
    - .planning/phases/04-execution-engine/04-CONTEXT.md §Q-13
    - .planning/phases/04-execution-engine/04-RESEARCH.md §"GET /v1/models" + Pitfall 6
  </read_first>
  <behavior>
    - Test 1 (ok): Stub server with `models: ["qwen3-coder-next-mlx-4bit", "other"]`; preflight with `model: "qwen3-coder-next-mlx-4bit"` returns `{ outcome: "ok", availableModels: ["qwen3-coder-next-mlx-4bit","other"] }`.
    - Test 2 (model-not-loaded): Stub `models: ["other"]`; preflight `model: "qwen3-coder-next-mlx-4bit"` → `{ outcome: "model-not-loaded", model, availableModels: ["other"] }` (truncate to ≤20 entries).
    - Test 3 (empty-models): Stub `models: []` → `{ outcome: "empty-models", availableModels: [] }`.
    - Test 4 (unreachable): Pass a baseUrl pointing at a closed port → `{ outcome: "unreachable", errorClass: "TypeError"|..., errorMessage: <string> }`.
    - Test 5 (http-error): Stub `preflightStatus: 500` → `{ outcome: "http-error", status: 500, bodySnippet: <≤500 chars> }`.
    - Test 6 (abort): Pass aborted signal → fetch rejects; preflight returns `{ outcome: "unreachable", errorClass: "AbortError" }` (or treats abort as unreachable; plan locks: classify abort as `unreachable` with `errorClass: "AbortError"`).
    - Test 7 (injectable fetch): Pass a custom `fetchImpl` that returns canned Response; assert preflight uses it.
  </behavior>
  <action>
    Create `packages/lmstudio-adapter/src/preflight.ts`:
    ```ts
    import type { AuthorizedNetworkOp } from "@protostar/authority";

    export async function preflightLmstudio(input: PreflightInput): Promise<PreflightResult> {
      const fetchImpl = input.fetchImpl ?? fetch;
      const url = input.authorizedOp.url;
      let res: Response;
      try {
        res = await fetchImpl(url, { method: "GET", signal: input.signal });
      } catch (err) {
        return { outcome: "unreachable", errorClass: errorClassOf(err), errorMessage: errorMessageOf(err) };
      }
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return { outcome: "http-error", status: res.status, bodySnippet: body.slice(0, 500) };
      }
      const json = await res.json().catch(() => null);
      const data = (json && typeof json === "object" && Array.isArray((json as any).data)) ? (json as any).data : null;
      if (!data) return { outcome: "http-error", status: res.status, bodySnippet: "missing data[]" };
      const ids: string[] = data.map((m: any) => String(m?.id ?? "")).filter(Boolean);
      const truncated = ids.slice(0, 20);
      if (ids.length === 0) return { outcome: "empty-models", availableModels: [] as const };
      if (!ids.includes(input.model)) return { outcome: "model-not-loaded", model: input.model, availableModels: truncated };
      return { outcome: "ok", availableModels: truncated };
    }
    function errorClassOf(err: unknown): string { return (err && typeof err === "object" && "name" in err) ? String((err as any).name) : "Error"; }
    function errorMessageOf(err: unknown): string { return (err instanceof Error) ? err.message : String(err); }
    ```
    Note: `authorizedOp.url` is read from the brand; preflight does NOT mint. The brand is consumed at the I/O call site (matches PATTERNS.md "brand-consume at I/O").
    Tests: use stub server from Plan 03; for "unreachable" use a port that's never listened (start+close stub then fetch). For Test 7, inject a `fetchImpl` returning `new Response(JSON.stringify({...}), {status: 200})`.
    Add to barrel: `export { preflightLmstudio, type PreflightResult, type PreflightInput } from "./preflight.js";`.
  </action>
  <verify>
    <automated>cd /Users/zakkeown/Code/protostar && pnpm --filter @protostar/lmstudio-adapter test 2>&1 | tail -25 && ! grep -E "mintAuthorizedNetworkOp" packages/lmstudio-adapter/src/preflight.ts && grep -c '"model-not-loaded"\|"empty-models"\|"unreachable"\|"http-error"\|"ok"' packages/lmstudio-adapter/src/preflight.ts</automated>
  </verify>
  <acceptance_criteria>
    - `preflight.ts` exists, exports `preflightLmstudio` + `PreflightResult` + `PreflightInput`
    - Five outcome literals present: `grep -c '"ok"\|"unreachable"\|"model-not-loaded"\|"empty-models"\|"http-error"' packages/lmstudio-adapter/src/preflight.ts` ≥ 5
    - `grep -c 'mintAuthorizedNetworkOp' packages/lmstudio-adapter/src/preflight.ts` returns 0 (consumes brand only)
    - All 7 tests pass against the stub server
  </acceptance_criteria>
  <done>Preflight ready for Plan 10's admission gate to wire.</done>
</task>

</tasks>

<threat_model>
| Boundary | Description |
|----------|-------------|
| factory-config bytes ↔ runtime | malicious config could redirect baseUrl to attacker host |
| preflight HTTP ↔ LM Studio | unverified URL could leak api key in Authorization header |

| Threat ID | Category | Component | Disposition | Mitigation |
|-----------|----------|-----------|-------------|------------|
| T-04-09 | Tampering | factory-config.json swapped to point baseUrl at evil.example | mitigate | Config hash recorded in policy snapshot (Plan 10); auditable. `network.allow: 'loopback'` (Plan 08) refuses non-loopback URLs at brand-mint time |
| T-04-10 | Information Disclosure | API key sent to wrong host | mitigate | Preflight only uses `authorizedOp.url` which was already validated against `network.allow` in `authorizeNetworkOp` (Plan 08). No raw URL string path |
| T-04-11 | DoS | Preflight hangs on malicious server | mitigate | Caller passes `signal` from parent AbortController with timeout; preflight returns `unreachable` on abort |
</threat_model>

<verification>
- `pnpm --filter @protostar/lmstudio-adapter test` green for both new test files
- No `node:fs` in `factory-config.ts`
- Preflight does NOT mint AuthorizedNetworkOp
</verification>

<success_criteria>
- Pure resolver with deterministic hash
- Three default values, three env-var overrides, schema-validated file shape
- Five preflight outcomes — including the three CONTEXT failure modes plus `empty-models` (Pitfall) and `http-error`
</success_criteria>

<output>
Create `.planning/phases/04-execution-engine/04-04-SUMMARY.md` documenting: default config, env-var precedence, configHash recipe, and the five preflight outcomes for Plan 10's gate consumer.
</output>
