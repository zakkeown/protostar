import type { ConfirmedIntent } from "@protostar/intent";
import type { AdmittedPlanExecutionArtifact } from "@protostar/planning";

interface CapabilityEnvelope14 {
  readonly repoScopes: readonly unknown[];
  readonly toolPermissions: readonly unknown[];
  readonly workspace: { readonly allowDirty: boolean };
  readonly network: { readonly allow: "loopback" };
  readonly budget: {
    readonly taskWallClockMs: 180000;
    readonly adapterRetriesPerTask: 4;
    readonly maxRepairLoops: 3;
  };
}

export interface ExecutionAdapterTaskInput {
  readonly id: "task-1";
  readonly title: "Recolor primary button";
  readonly adapterRef: "lmstudio-coder";
  readonly targetFiles: readonly ["src/Button.tsx"];
  readonly dependsOn: readonly [];
}

export interface CosmeticTweakFixture {
  readonly intent: ConfirmedIntent & { readonly capabilityEnvelope: CapabilityEnvelope14 };
  readonly admittedPlan: AdmittedPlanExecutionArtifact;
  readonly task: ExecutionAdapterTaskInput;
  readonly preImageBytes: Record<string, Uint8Array>;
  readonly expectedDiffSample: string;
  readonly proseDriftDiffSample: string;
}

const task: ExecutionAdapterTaskInput = Object.freeze({
  id: "task-1",
  title: "Recolor primary button",
  adapterRef: "lmstudio-coder",
  targetFiles: ["src/Button.tsx"] as const,
  dependsOn: [] as const
});

const expectedDiffSample = [
  "```diff",
  "--- a/src/Button.tsx",
  "+++ b/src/Button.tsx",
  "@@ -1 +1 @@",
  "-export const Button = () => <button className=\"bg-blue-500\">Click</button>;",
  "+export const Button = () => <button className=\"bg-red-500\">Click</button>;",
  "```"
].join("\n");

export const cosmeticTweakFixture: CosmeticTweakFixture = Object.freeze({
  // Adapter tests exercise intent shape only; signature verification is covered by authority/admission.
  intent: Object.freeze({
    id: "intent_cosmetic_tweak_fixture",
    sourceDraftId: "draft_cosmetic_tweak_fixture",
    mode: "brownfield",
    goalArchetype: "cosmetic-tweak",
    title: "Recolor primary button",
    problem: "The primary button should use a red background utility instead of blue.",
    requester: "phase-04-fixture",
    confirmedAt: "2026-04-27T00:00:00.000Z",
    context: "Fixture for LM Studio adapter integration tests.",
    acceptanceCriteria: Object.freeze([
      Object.freeze({
        id: "ac_primary_button_red",
        statement: "The primary button uses red background",
        verification: "test"
      })
    ]),
    capabilityEnvelope: Object.freeze({
      repoScopes: Object.freeze([
        Object.freeze({
          workspace: "trusted-workspace",
          path: "src/Button.tsx",
          access: "write"
        })
      ]),
      toolPermissions: Object.freeze([
        Object.freeze({
          tool: "network",
          permissionLevel: "allow",
          reason: "LM Studio loopback adapter call",
          risk: "low"
        }),
        Object.freeze({
          tool: "subprocess",
          permissionLevel: "deny",
          reason: "Fixture must not require subprocess access",
          risk: "low"
        })
      ]),
      workspace: Object.freeze({ allowDirty: false }),
      network: Object.freeze({ allow: "loopback" }),
      budget: Object.freeze({
        taskWallClockMs: 180_000,
        adapterRetriesPerTask: 4,
        maxRepairLoops: 3
      })
    }),
    constraints: Object.freeze(["Only change src/Button.tsx.", "Return one fenced unified diff."]),
    stopConditions: Object.freeze([]),
    schemaVersion: "1.4.0",
    signature: Object.freeze({
      algorithm: "sha256",
      canonicalForm: "json-c14n@1.0",
      value: "fixture-signature-not-production",
      intentHash: "fixture-intent-hash-not-production",
      envelopeHash: "fixture-envelope-hash-not-production",
      policySnapshotHash: "fixture-policy-hash-not-production"
    })
  }) as unknown as CosmeticTweakFixture["intent"],
  admittedPlan: Object.freeze({
    planId: "plan_cosmetic_tweak_fixture",
    intentId: "intent_cosmetic_tweak_fixture",
    admittedPlan: Object.freeze({
      planId: "plan_cosmetic_tweak_fixture",
      intentId: "intent_cosmetic_tweak_fixture",
      planGraphUri: "plan.json",
      planningAdmissionArtifact: "planning-admission.json",
      planningAdmissionUri: "planning-admission.json",
      validationSource: "planning-admission.json",
      proofSource: "PlanGraph"
    }),
    evidence: Object.freeze({
      planId: "plan_cosmetic_tweak_fixture",
      intentId: "intent_cosmetic_tweak_fixture",
      planGraphUri: "plan.json",
      planningAdmissionArtifact: "planning-admission.json",
      planningAdmissionUri: "planning-admission.json",
      validationSource: "planning-admission.json",
      proofSource: "PlanGraph"
    }),
    tasks: Object.freeze([
      Object.freeze({
        planTaskId: task.id,
        title: task.title,
        dependsOn: task.dependsOn,
        adapterRef: task.adapterRef,
        targetFiles: task.targetFiles
      })
    ])
  }) as unknown as AdmittedPlanExecutionArtifact,
  task,
  preImageBytes: Object.freeze({
    "src/Button.tsx": new TextEncoder().encode(
      "export const Button = () => <button className=\"bg-blue-500\">Click</button>;"
    )
  }),
  expectedDiffSample,
  proseDriftDiffSample: [
    `Sure, here's the patch: ${expectedDiffSample}`,
    "",
    "Let me know if you want me to adjust."
  ].join("\n")
});
