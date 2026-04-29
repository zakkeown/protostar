# Self-Hosted Runner Headless Mode

Mode literal: `self-hosted-runner`

Use this mode for a trusted, single-tenant GitHub Actions runner on operator-owned hardware. It is intended for local LM Studio or local-network model access while preserving the GitHub Actions operator surface.

## Command

```bash
protostar-factory run --headless-mode self-hosted-runner --non-interactive --draft <intent-draft.json> --out .protostar/runs --trust untrusted
```

The exact headless selector is `protostar-factory run --headless-mode self-hosted-runner --non-interactive`; other flags only supply the normal factory run inputs.

## Required Inputs

- The runner must be single-tenant and trusted by the operator. Do not run untrusted third-party jobs on the same runner user account.
- LM Studio or the selected local backend must be reachable from the runner through loopback or the approved local network address in `.protostar/factory-config.json`.
- No API keys, model credentials, GitHub tokens, or runner secrets may be checked in. Use GitHub Actions secrets or host-local environment files outside the repository.
- `.protostar/factory-config.json` may set `"factory": { "headlessMode": "self-hosted-runner", "nonInteractive": true }`, but the CLI flag takes precedence.
- Run residue must be managed with the existing dry-run-first cleanup posture:

```bash
protostar-factory prune --older-than 14d
protostar-factory prune --older-than 14d --confirm
```

## Evidence

Stress and headless-run evidence is written below:

```text
.protostar/stress/<sessionId>/events.jsonl
```

Runner logs should retain the matching `.protostar/runs/<runId>/` bundle so the events file can be traced back to run manifests, refusals, and review or delivery evidence.

## Failure Posture

`--non-interactive` means the runner refuses instead of prompting. Missing LM Studio availability, missing model names, missing toy-repo verification files, dirty workspace policy refusal, or delivery credential absence must stop the job with non-zero exit and evidence. The runner must not pause waiting for terminal input, browser login, or pasted secrets.
