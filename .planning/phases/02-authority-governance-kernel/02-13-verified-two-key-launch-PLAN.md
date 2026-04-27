---
phase: 02-authority-governance-kernel
plan: 13
type: execute
wave: 6
depends_on: [05, 08, 11]
files_modified:
  - apps/factory-cli/src/two-key-launch.ts
  - apps/factory-cli/src/two-key-launch.test.ts
  - apps/factory-cli/src/main.ts
  - apps/factory-cli/src/main.test.ts
requirements:
  - GOV-04
  - GOV-06
autonomous: true
must_haves:
  truths:
    - "`--trust trusted --confirmed-intent <path>` reads and parses the supplied file, verifies its signature, and compares it to the current promoted intent plus resolved policy snapshot before trusting the workspace."
    - "Missing, malformed, unsigned, mismatched, or unverifiable confirmed-intent files reject trusted launch before workspace-trust allow evidence is written."
    - "The old presence-only second-key check remains only a CLI preflight; it is not treated as verification."
  artifacts:
    - path: apps/factory-cli/src/two-key-launch.ts
      provides: "Trusted launch file verification helper"
      contains: "verifyTrustedLaunchConfirmedIntent"
    - path: apps/factory-cli/src/main.test.ts
      provides: "Trusted launch rejects fake second key and accepts a verified matching second key"
      contains: "operator-confirmed-intent"
---

<objective>
Close the GOV-04/GOV-06 blocker where trusted launch accepts any string as the second key. The second key must be a verified `ConfirmedIntent` artifact that matches the run's current promoted intent, resolved envelope, and policy snapshot hash.
</objective>

<context>
@.planning/phases/02-authority-governance-kernel/02-VERIFICATION.md
@apps/factory-cli/src/two-key-launch.ts
@apps/factory-cli/src/main.ts
@apps/factory-cli/src/main.test.ts
@packages/intent/src/confirmed-intent.ts
@packages/authority/src/signature/verify.ts
@packages/authority/src/signature/sign.ts
</context>

<threat_model>
Threats addressed:
- T-2-5 trusted workspace spoofing: any filesystem path currently satisfies the second key.
- T-2-7 signature bypass: trusted launch does not prove the supplied intent matches current authority state.

Block on high severity threats. A dummy JSON file must never authorize trusted workspace launch.
</threat_model>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add trusted-launch confirmed-intent verifier</name>
  <files>
    apps/factory-cli/src/two-key-launch.ts,
    apps/factory-cli/src/two-key-launch.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/two-key-launch.ts (current presence-only preflight)
    - packages/intent/src/confirmed-intent.ts (`parseConfirmedIntent`, `ConfirmedIntent`)
    - packages/authority/src/signature/verify.ts (`verifyConfirmedIntentSignature`)
    - packages/authority/src/signature/sign.ts (`canonicalizeForSignature` or equivalent helper)
  </read_first>
  <action>
    Keep `validateTwoKeyLaunch` as a cheap CLI-argument preflight. Add a new async helper:

    `verifyTrustedLaunchConfirmedIntent(input): Promise<TrustedLaunchVerificationResult>`

    Input fields:
    - `confirmedIntentPath: string`
    - `expectedIntent: ConfirmedIntent`
    - `policySnapshot: PolicySnapshot`
    - `resolvedEnvelope: CapabilityEnvelope`
    - `readFile(path): Promise<string>`

    Behavior:
    - Read the supplied path.
    - Parse JSON and call `parseConfirmedIntent`.
    - Reject if `signature === null`.
    - Call `verifyConfirmedIntentSignature(parsedIntent, policySnapshot, resolvedEnvelope)`.
    - Compare the parsed intent body to `expectedIntent` after removing `signature` from both values. Use the same stable canonicalization helper used by signature code; do not compare raw JSON string order.
    - Return structured errors with reasons: `missing-file`, `malformed-json`, `invalid-confirmed-intent`, `unsigned-confirmed-intent`, `signature-mismatch`, `intent-body-mismatch`.

    Unit tests must cover every error reason and one success case.
  </action>
  <acceptance_criteria>
    - `apps/factory-cli/src/two-key-launch.ts` exports `verifyTrustedLaunchConfirmedIntent`.
    - `apps/factory-cli/src/two-key-launch.test.ts` contains `unsigned-confirmed-intent`, `signature-mismatch`, and `intent-body-mismatch`.
    - `pnpm --filter @protostar/factory-cli test -- two-key-launch` or the package test command exits 0.
  </acceptance_criteria>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire trusted-launch verification into runFactory before trust allow</name>
  <files>
    apps/factory-cli/src/main.ts,
    apps/factory-cli/src/main.test.ts
  </files>
  <read_first>
    - apps/factory-cli/src/main.ts (where `signedPromotion.intent`, `policySnapshot`, and `precedenceDecision.resolvedEnvelope` are available)
    - apps/factory-cli/src/main.test.ts (current trusted launch dummy fixture)
    - apps/factory-cli/src/escalation-marker.ts (existing trust failure artifact path)
  </read_first>
  <action>
    In `runFactory`, after `signedPromotion.intent` exists and before workspace-trust allow evidence can be written:

    - If `options.trust === "trusted"`, require `options.confirmedIntent` to be present from the preflight.
    - Call `verifyTrustedLaunchConfirmedIntent` with:
      - `confirmedIntentPath: resolve(workspaceRoot, options.confirmedIntent)` unless the existing CLI path handling already resolves paths another way.
      - `expectedIntent: intent`
      - `policySnapshot`
      - `resolvedEnvelope: precedenceDecision.resolvedEnvelope`
      - `readFile` from `node:fs/promises`.
    - If verification fails, write an escalation marker for `gate: "workspace-trust"` whose reason contains `trusted launch confirmed intent verification failed`.
    - Throw `CliExitError` with exit code `2`.

    Replace the current trusted launch test that writes `{ fixture: "operator-confirmed-intent" }` and expects success. New tests:
    - Fake JSON object is rejected.
    - Unsigned parsed ConfirmedIntent is rejected.
    - Signed but mismatched ConfirmedIntent is rejected.
    - A matching signed ConfirmedIntent from a prior dry run is accepted.
  </action>
  <acceptance_criteria>
    - `apps/factory-cli/src/main.ts` contains `verifyTrustedLaunchConfirmedIntent`.
    - `apps/factory-cli/src/main.test.ts` no longer expects a dummy `{ fixture: "operator-confirmed-intent" }` file to succeed.
    - `apps/factory-cli/src/main.test.ts` contains `trusted launch confirmed intent verification failed`.
    - `pnpm --filter @protostar/factory-cli test` exits 0.
  </acceptance_criteria>
</task>

</tasks>

<verification>
- `pnpm --filter @protostar/factory-cli test`
- `pnpm run factory`
- `pnpm run verify`
</verification>

<success_criteria>
- Trusted launch requires a real verified second key.
- The supplied second key is tied to the same intent body, resolved envelope, and policy snapshot in force for the current run.
- Fake confirmed-intent paths cannot produce trusted workspace authority.
</success_criteria>
