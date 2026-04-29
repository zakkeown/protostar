# GitHub-Hosted Headless Mode

Mode literal: `github-hosted`

Use this mode for GitHub-hosted Actions jobs that run without an attached operator terminal. The manual or scheduled workflow is introduced by Phase 11 Plan 13; this page pins the command and environment contract that workflow must call.

## Command

```bash
protostar-factory run --headless-mode github-hosted --non-interactive --draft <intent-draft.json> --out .protostar/runs --trust untrusted
```

The run may add the later backend selector once Plan 11-06/11-07 lands, but the headless portion of the command stays exactly `protostar-factory run --headless-mode github-hosted --non-interactive`.

## Required Inputs

- `PROTOSTAR_HOSTED_LLM_API_KEY` must be provided as a GitHub Actions secret. It is read from the environment by the hosted backend plan; it must never be checked into the repository.
- `.protostar/factory-config.json` may set `"factory": { "headlessMode": "github-hosted", "nonInteractive": true }`, but the CLI flag takes precedence.
- The workflow must run after `pnpm install --frozen-lockfile` and a factory CLI build, matching the normal verify workflow shape.
- Intent drafts, target repository credentials, and delivery credentials remain normal factory inputs. This mode does not weaken admission, delivery, or no-merge gates.

## Evidence

Stress-cap and runner evidence is written below:

```text
.protostar/stress/<sessionId>/events.jsonl
```

The Actions job should upload that path, plus any run bundle under `.protostar/runs/`, as artifacts when a headless run fails or reaches a stress gate.

## Failure Posture

`--non-interactive` means the process refuses instead of prompting. Missing `PROTOSTAR_HOSTED_LLM_API_KEY`, missing draft inputs, missing toy-repo verification preconditions, or an unavailable delivery credential must produce a non-zero exit and durable refusal evidence. The workflow must not ask for input, wait for stdin, or fall back to a local daemon.
