---
phase: 02-authority-governance-kernel
plan: 14
type: execute
wave: 6
depends_on: [05, 07, 09, 13]
files_modified:
  - packages/authority/src/stage-reader/factory.ts
  - packages/authority/src/stage-reader/factory.test.ts
  - apps/factory-cli/src/admission-decisions-index.ts
  - apps/factory-cli/src/admission-decisions-index.test.ts
  - apps/factory-cli/src/write-admission-decision.test.ts
  - packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
requirements:
  - GOV-03
  - GOV-05
  - GOV-06
autonomous: true
must_haves:
  truths:
    - "AuthorityStageReader consumes the JSONL emitted by factory-cli without field-name mismatch."
    - "A stage cannot obtain a branded `ConfirmedIntent` from `AuthorityStageReader.confirmedIntent()` unless signature verification succeeds."
    - "There is an explicit unbranded parsed read method for diagnostics or legacy inspection, named so callers cannot mistake it for verified authority."
  artifacts:
    - path: packages/authority/src/stage-reader/factory.ts
      provides: "Verified/branded read path and JSONL compatibility"
      contains: "readParsedConfirmedIntent"
    - path: packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
      provides: "Writer-to-reader integration coverage for signed intent and admission decision index"
      contains: "admissionDecisionsIndex"
---

<objective>
Close two GOV-03/GOV-06 reader gaps:

1. Factory CLI writes `artifactPath` in `admission-decisions.jsonl`, while `AuthorityStageReader` requires `path`.
2. `AuthorityStageReader.confirmedIntent()` can return a branded `ConfirmedIntent` before calling the signature verifier.

The fix standardizes the index field while keeping a legacy `path` fallback, and splits parsed/unverified reads from verified/branded reads.
</objective>

<context>
@.planning/phases/02-authority-governance-kernel/02-VERIFICATION.md
@packages/authority/src/stage-reader/factory.ts
@packages/authority/src/stage-reader/factory.test.ts
@apps/factory-cli/src/admission-decisions-index.ts
@apps/factory-cli/src/write-admission-decision.ts
@packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
</context>

<threat_model>
Threats addressed:
- T-2-1 unverified branded read: parsed disk JSON becomes authority without verification.
- T-2-6 durable artifact incompatibility: reader rejects writer output, forcing consumers around the safe API.

Block on high severity threats. The verified reader path must fail closed on missing snapshot, signature mismatch, or unsupported legacy signed artifacts.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Standardize admission-decisions index on artifactPath with legacy path fallback</name>
  <files>
    packages/authority/src/stage-reader/factory.ts,
    packages/authority/src/stage-reader/factory.test.ts,
    apps/factory-cli/src/admission-decisions-index.ts,
    apps/factory-cli/src/admission-decisions-index.test.ts,
    apps/factory-cli/src/write-admission-decision.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/admission-decisions-index.ts (writer contract)
    - packages/authority/src/stage-reader/factory.ts (`validateAdmissionDecisionIndexEntry`)
    - apps/factory-cli/src/write-admission-decision.test.ts (real index output)
  </read_first>
  <action>
    Make `artifactPath` the canonical field name for `AdmissionDecisionIndexEntry` in both writer and reader.

    In `packages/authority/src/stage-reader/factory.ts`:
    - Change `AdmissionDecisionIndexEntry` to include `artifactPath: string`.
    - `validateAdmissionDecisionIndexEntry` accepts canonical `artifactPath`.
    - For old fixtures only, if `artifactPath` is missing and `path` is present, return `{ ...parsed, artifactPath: parsed.path }`.
    - Error text for neither field must contain `artifactPath must be a string`.

    Update tests so at least one reader fixture uses real writer-style `artifactPath`, and one legacy fixture uses `path`.
  </action>
  <acceptance_criteria>
    - `packages/authority/src/stage-reader/factory.ts` contains `artifactPath`.
    - `packages/authority/src/stage-reader/factory.ts` contains a fallback branch for `parsed["path"]`.
    - `packages/authority/src/stage-reader/factory.test.ts` contains both `artifactPath` and legacy `path`.
    - `pnpm --filter @protostar/authority test` exits 0.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Split parsed/unverified intent reads from verified/branded reads</name>
  <files>
    packages/authority/src/stage-reader/factory.ts,
    packages/authority/src/stage-reader/factory.test.ts,
    packages/admission-e2e/src/signed-confirmed-intent.e2e.test.ts
  </files>
  <read_first>
    - packages/authority/src/stage-reader/factory.ts (`confirmedIntent`, `verifyConfirmedIntent`)
    - packages/authority/src/signature/verify.ts (`VerifyConfirmedIntentSignatureResult`)
    - packages/intent/src/confirmed-intent.ts (`parseConfirmedIntent`)
  </read_first>
  <action>
    Update the stage reader interface:

    - Add `readParsedConfirmedIntent(): Promise<unknown>` or `readParsedConfirmedIntent(): Promise<ParsedConfirmedIntent>` for diagnostics. This method reads and parses JSON, applies the existing safe legacy `1.0.0` unsigned upconversion, but its name must include `Parsed` and it must not be documented as authority.
    - Change `verifyConfirmedIntent()` to call `readParsedConfirmedIntent()`, require `policySnapshot()`, derive `resolvedEnvelope`, and call `verifyConfirmedIntentSignature`.
    - Change `confirmedIntent()` so it calls `verifyConfirmedIntent()` and returns a branded/verified intent only when `ok === true`. On `ok === false`, throw `StageReaderError` with a reason containing `confirmed intent signature verification failed`.

    If `VerifyConfirmedIntentSignatureResult` does not currently return the verified intent value, extend it or add a local safe return path only after the verifier says `ok: true`.

    Update tests:
    - `readParsedConfirmedIntent()` can parse unsigned legacy fixtures.
    - `confirmedIntent()` rejects missing `policy-snapshot.json`.
    - `confirmedIntent()` rejects tampered signature.
    - `confirmedIntent()` succeeds for the signed factory-cli artifact.
  </action>
  <acceptance_criteria>
    - `packages/authority/src/stage-reader/factory.ts` contains `readParsedConfirmedIntent`.
    - `packages/authority/src/stage-reader/factory.ts` contains `confirmed intent signature verification failed`.
    - `packages/authority/src/stage-reader/factory.ts` does not contain `return result.data as ConfirmedIntent` inside the raw parse helper without verification.
    - `packages/authority/src/stage-reader/factory.test.ts` contains `confirmedIntent()` rejection tests for missing snapshot or tampering.
    - `pnpm --filter @protostar/authority test` exits 0.
    - `pnpm --filter @protostar/admission-e2e test` exits 0.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm --filter @protostar/authority test`
- `pnpm --filter @protostar/factory-cli test`
- `pnpm --filter @protostar/admission-e2e test`
- `pnpm run verify`
</verification>

<success_criteria>
- Stage reader can consume factory-cli JSONL indexes.
- Verified/branded confirmed-intent reads cannot be accidentally bypassed by calling the natural `confirmedIntent()` method.
- Legacy inspection remains possible through an explicitly unverified parsed method.
</success_criteria>
