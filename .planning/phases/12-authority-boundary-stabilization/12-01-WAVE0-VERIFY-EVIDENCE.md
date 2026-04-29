---
plan: 12-01
task: 3
gate: wave-0-verify
status: passed
runs: 5
---

# Wave 0 — `pnpm run verify` Evidence

After Wave 0 worktrees (12-01, 12-02, 12-03) merged into main, `pnpm run verify`
ran 5 consecutive times against the merged tree. All runs green.

| Run | Result | Duration (admission-e2e) |
|-----|--------|--------------------------|
| 1   | pass   | 1085 ms (after stale 1.5.0 dist purge) |
| 2   | pass   | 1066 ms                  |
| 3   | pass   | 1091 ms                  |
| 4   | pass   | 1059 ms                  |
| 5   | pass   | 1076 ms                  |

Test totals (steady state): 1199 pass / 0 fail across 23 packages including
`@protostar/admission-e2e` (155/155, with 1.6.0-renamed signed-intent test).

## Notes

- Run 1 initially failed because TypeScript build cache held a stale
  `signed-intent-1-5-0.test.js` from before 12-02's rename to 1.6.0. Solved
  with `rm -rf packages/admission-e2e/dist` once; subsequent runs all clean.
- Phase 11 plan 11-07 (hosted-llm-adapter) commits landed on main during
  Wave 0 execution; verify includes its 9-test suite (all green).
- Wave-0 commit range: `4e88240..` through merge commits for 12-02 and 12-03.
