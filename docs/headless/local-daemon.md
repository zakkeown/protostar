# Local Daemon Headless Mode

Mode literal: `local-daemon`

Use this mode for unattended local runs on an operator machine. It preserves the ordinary LM Studio default and adds the explicit headless/no-prompt posture needed for overnight stress sessions.

## Command

```bash
protostar-factory run --headless-mode local-daemon --non-interactive --draft <intent-draft.json> --out .protostar/runs --trust untrusted
```

The launchd sample at `scripts/protostar-local-daemon.launchd.plist` invokes the same `protostar-factory run --headless-mode local-daemon --non-interactive` shape. The plist is sample configuration only; no repository script installs, loads, starts, or restarts it.

## Required Inputs

- Run from the Protostar workspace root after dependencies are installed and the factory CLI is built.
- LM Studio must be reachable at the configured local endpoint, normally `http://localhost:1234/v1`.
- `.protostar/factory-config.json` may set `"factory": { "headlessMode": "local-daemon", "nonInteractive": true }`, but the CLI flag takes precedence.
- The daemon user must have access to the target repository credentials, local model service, and `.protostar/` evidence directory.

## Evidence And Logs

Stress evidence is written below:

```text
.protostar/stress/<sessionId>/events.jsonl
```

Run bundles remain under:

```text
.protostar/runs/<runId>/
```

The sample plist writes stdout and stderr to:

```text
.protostar/headless/local-daemon.stdout.log
.protostar/headless/local-daemon.stderr.log
```

## Stop And Restart

Copy the sample plist to a user LaunchAgents directory only after replacing every placeholder path:

```bash
launchctl unload ~/Library/LaunchAgents/local.protostar.factory.plist
launchctl load ~/Library/LaunchAgents/local.protostar.factory.plist
```

Use `launchctl kickstart -k gui/$(id -u)/local.protostar.factory` only after confirming the previous process has stopped and any `.protostar/runs/<runId>/` bundle is terminal or intentionally preserved for triage.

## Failure Posture

`--non-interactive` means the daemon refuses instead of prompting. Missing LM Studio, a missing draft, an untrusted workspace gate, missing toy-repo verification preconditions, or delivery credential absence must produce a non-zero exit and durable evidence. The daemon must not open a browser, wait for stdin, or auto-install the plist.
