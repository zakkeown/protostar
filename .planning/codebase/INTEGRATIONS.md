# External Integrations

**Analysis Date:** 2026-04-26

## APIs & External Services

**Coordination cell:**
- **Dogpile SDK** (`@dogpile/sdk`) — bounded multi-agent coordination for planning, review, execution
  - Source: `link:../../../dogpile` (local sibling checkout, NOT npm)
  - Used in: `packages/dogpile-adapter/src/index.ts`
  - Imported symbols: `budget`, `convergence`, `firstOf`, `AgentSpec`, `DogpileOptions`
  - Auth: none — local link; no network calls in current code

**Version control / delivery:**
- **GitHub** (via `gh` CLI) — post-approval pull-request delivery channel
  - Used in: `packages/delivery/src/index.ts` (`createGitHubPrDeliveryPlan`)
  - Integration is COMMAND-ONLY: the function emits the argv `["gh", "pr", "create", "--base", ..., "--head", ..., "--title", ..., "--body-file", "delivery/pr-body.md"]` into `delivery-plan.json`. The CLI does NOT execute it — the operator runs `gh` manually.
  - Auth: delegated to the operator's `gh` CLI configuration; no token handling in this repo.

**LLM / model providers:**
- None integrated in code. Project memory notes LM Studio (Qwen3-Coder exec + Qwen3-80B judge) as the intended local model surface, but no HTTP client, SDK, or model invocation exists in the current source.

## Data Storage

**Databases:**
- None. No database client, ORM, or connection string anywhere in the repo.

**File Storage:**
- Local filesystem only.
- Run bundles written under `.protostar/runs/<runId>/` (gitignored)
- Per-run artifacts include: `intent.json`, `intent-draft.json`, `clarification-report.json`, `admission-decision.json`, `intent-ambiguity.json`, `intent-archetype-suggestion.json`, `manifest.json`, `planning-mission.txt`, `planning-result.json`, `review-mission.txt`, `plan.json`, `execution-plan.json`, `execution-events.json`, `execution-result.json`, `review-execution-loop.json`, `execution-evidence/*.json`, `review-gate.json`, `evaluation-report.json`, `evolution-decision.json`, `delivery-plan.json`, `delivery/pr-body.md`
- I/O surface: `node:fs/promises` (`mkdir`, `readFile`, `writeFile`) in `apps/factory-cli/src/main.ts`

**Caching:**
- None.

## Authentication & Identity

**Auth Provider:**
- None. The control plane is single-operator local CLI. No user model, sessions, tokens, or OAuth.
- GitHub auth is implicit via the operator's local `gh` CLI when they run the emitted delivery command.

## Monitoring & Observability

**Error Tracking:**
- None. Errors surface via process exit code and stderr from `apps/factory-cli/src/main.ts`.

**Logs:**
- Plain `console`/stdout writes from the CLI. No structured logger, no log shipping.
- Execution lifecycle is captured as deterministic event records in `execution-events.json` rather than streamed logs.

**Metrics/Tracing:**
- None.

## CI/CD & Deployment

**Hosting:**
- Not deployed. Local-only CLI factory.

**CI Pipeline:**
- None configured (no `.github/workflows/`, no `.circleci/`, no other CI config files at repo root).
- Local verification: `pnpm run verify` (typecheck + intent + factory-cli tests).

## Environment Configuration

**Required env vars:**
- None. The CLI reads zero environment variables; all configuration is via command-line flags (`--draft`, `--intent`, `--intent-draft`, `--out`, `--confirmed-intent-output`, `--planning-fixture`, `--intent-mode`, `--fail-task-ids`).

**Secrets location:**
- No secrets handled in-repo. `.gitignore` reserves `.env`, `.env.*` (with `.env.example` allowed) but no env file exists.
- GitHub credentials live wherever the operator's `gh` CLI stores them (out of scope for this repo).

## Webhooks & Callbacks

**Incoming:**
- None. No HTTP server, no webhook receiver.

**Outgoing:**
- None. No outbound HTTP from current code. The only external surface is the emitted `gh` argv that the operator runs manually.

## Linked / Sibling Repositories

- `../dogpile` — required sibling checkout supplying `@dogpile/sdk` via pnpm `link:` protocol (`packages/dogpile-adapter/package.json`, `pnpm-lock.yaml` line 68-70). Project memory references a Tauri+React toy sibling repo as the cosmetic-tweak-loop target for v0.0.1, but it is not yet wired into source.

---

*Integration audit: 2026-04-26*
