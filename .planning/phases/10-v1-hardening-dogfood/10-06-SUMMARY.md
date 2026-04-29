# Phase 10 Plan 06 Summary

**Plan:** `10-06-PLAN.md`
**Requirement:** DOG-07
**Completed:** 2026-04-29

## Outcome

Release packaging is wired but intentionally not published. The repo now has Changesets configured for public `@protostar/*` packages, every workspace package manifest has explicit public publish metadata, `apps/factory-cli` publishes as `@protostar/factory-cli` with the `protostar-factory` binary, and the root `release` script performs versioning, build, tests, and Changesets publish.

The first publish is represented by `.changeset/initial-publish.md`. Package versions remain at `0.0.0` so the checked-in minor changeset will produce `0.1.0` during the operator-run release step. This avoids landing `0.1.0` in manifests now and then accidentally publishing `0.2.0` on the first real Changesets version pass.

## Files Landed

- `.changeset/config.json`
- `.changeset/README.md`
- `.changeset/initial-publish.md`
- `.github/workflows/changeset-required.yml`
- root `package.json` and `pnpm-lock.yaml`
- all `packages/*/package.json`
- `apps/factory-cli/package.json`

## Deviations

- Did not run `pnpm release`, `pnpm changeset publish`, or any npm publish command. The operator approved setup and agreed to stop before real publish.
- Did not require or read `NPM_TOKEN`. That remains a real publish-time prerequisite.
- Kept package versions at `0.0.0` with an initial `minor` changeset so the first versioned release becomes `0.1.0`.
- `pnpm add -w -D @changesets/cli@^2` hit a local pnpm store mismatch. I added the root dev dependency in `package.json` and ran `pnpm install`, which resolved `@changesets/cli` to `2.31.0` in the lockfile.

## Verification

- Release packaging acceptance checks passed:
  - Changesets config has `access: public`, `baseBranch: main`, `updateInternalDependencies: patch`
  - `apps/factory-cli` is named `@protostar/factory-cli`
  - `apps/factory-cli` exposes `bin.protostar-factory = dist/main.js`
  - every publishable workspace manifest has `private: false` and `publishConfig.access = public`
  - `.changeset/initial-publish.md` exists
  - `.github/workflows/changeset-required.yml` includes the package-source changeset gate and `skip changeset` escape hatch
- `pnpm knip --no-config-hints`
- `pnpm run verify`
