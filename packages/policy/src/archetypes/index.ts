// Plan 06a: archetypes + archetype-autotag relocated to @protostar/intent. This subbarrel
// preserves the @protostar/policy/archetypes import surface byte-equivalent.
export {
  ARCHETYPE_POLICY_TABLE,
  BUGFIX_GOAL_ARCHETYPE,
  COSMETIC_TWEAK_GOAL_ARCHETYPE,
  FEATURE_ADD_GOAL_ARCHETYPE,
  GOAL_ARCHETYPE_POLICY_TABLE,
  INTENT_ARCHETYPE_REGISTRY,
  REFACTOR_GOAL_ARCHETYPE,
  REPO_SCOPE_ACCESS_VALUES,
  SUPPORTED_GOAL_ARCHETYPES,
  V0_0_1_INTENT_ARCHETYPE_IDS,
  V0_0_1_INTENT_ARCHETYPE_REGISTRY
} from "@protostar/intent";
export type {
  FactoryAutonomyPolicy,
  GoalArchetype,
  GoalArchetypeBudgetPolicy,
  GoalArchetypeCapabilityGrantKind,
  GoalArchetypeCapabilityGrantsPolicy,
  GoalArchetypeCompatibilityBudgetCaps,
  GoalArchetypeExecuteGrantPolicy,
  GoalArchetypeExecutionScope,
  GoalArchetypePolicy,
  GoalArchetypePolicyEntry,
  GoalArchetypePolicyStatus,
  GoalArchetypePolicyTable,
  GoalArchetypeRepoScopePolicy,
  GoalArchetypeToolPermissionGrantPolicy,
  GoalArchetypeToolPermissionLimitsPolicy,
  GoalArchetypeToolPermissionsPolicy,
  GoalArchetypeWriteGrantPolicy,
  IntentArchetypeAutoTagScore,
  IntentArchetypeAutoTagSignal,
  IntentArchetypeAutoTagSignalSource,
  IntentArchetypeAutoTagSuggestion,
  IntentArchetypeCapabilityCapStatus,
  IntentArchetypeRegistry,
  IntentArchetypeRegistryEntry,
  IntentArchetypeSupportStatus,
  RepoAccessLevel,
  V001IntentArchetypeId
} from "@protostar/intent";
export {
  autoTagIntentDraftArchetype,
  proposeIntentDraftArchetype
} from "@protostar/intent";
