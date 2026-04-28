# Deferred Items

## 05-11: Factory CLI inline planning fixtures need acceptanceTestRefs

- **Found during:** Task 2 `pnpm run verify:full`
- **Scope:** Out of scope for this parallel worker; user scoped writes to policy/planning/examples/admission-e2e while preserving unrelated Phase 6/factory-cli work.
- **Issue:** `apps/factory-cli` tests include inline/generated planning fixtures whose tasks do not yet carry `acceptanceTestRefs`, so the new universal planning admission gate rejects them with `ac-coverage-incomplete`.
- **Suggested follow-up:** Update factory-cli planning fixture builders to emit `acceptanceTestRefs` for every confirmed-intent AC before treating `verify:full` as the final green gate for 05-11.
