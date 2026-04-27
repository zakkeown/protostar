// ============================================================================
// PRIVATE SUBPATH — TEST-ONLY. NOT a public API.
//
// This file is reachable only via the `@protostar/intent/internal/test-builders`
// subpath import. Phase 2 may relocate or remove this file without notice.
//
// RULES:
//  - DO NOT import from production code.
//  - DO NOT re-export from packages/intent/src/index.ts or any consumer-facing
//    subpath barrel under packages/intent/src/. The admission-e2e contract test
//    in Plan 06b Task D enforces this with a runtime leak grep.
//  - Production code that needs a ConfirmedIntent must call promoteIntentDraft.
// ============================================================================

import {
  mintConfirmedIntent,
  type ConfirmedIntent,
  type ConfirmedIntentData
} from "../confirmed-intent.js";

/**
 * Test-only producer. Mints a ConfirmedIntent from already-shaped data without
 * running the promotion pipeline. The callsite-mechanical replacement for the
 * deleted public defineConfirmedIntent.
 *
 * Accepts ConfirmedIntentData (the un-branded structural shape) so test
 * fixtures can be authored as plain literals; mintConfirmedIntent then folds
 * deepFreeze + normalization and stamps the module-private brand.
 */
export function buildConfirmedIntentForTest(data: ConfirmedIntentData): ConfirmedIntent {
  return mintConfirmedIntent(data);
}
