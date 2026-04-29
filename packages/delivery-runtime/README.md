# @protostar/delivery-runtime

Network-only GitHub delivery runtime for preflight, branch push, PR creation, comments, and CI polling.

## Public exports

- `export { buildOctokit } from "./octokit-client.js"` - public surface exported from `src/index.ts`.
- `export { ProtostarOctokit } from "./octokit-client.js"` - public surface exported from `src/index.ts`.
- `export { mapOctokitErrorToRefusal, TOKEN_PATTERN } from "./map-octokit-error.js"` - public surface exported from `src/index.ts`.
- `export { OctokitDeliveryPhase } from "./map-octokit-error.js"` - public surface exported from `src/index.ts`.
- `export { preflightDeliveryFast } from "./preflight-fast.js"` - public surface exported from `src/index.ts`.
- `export { FastPreflightResult } from "./preflight-fast.js"` - public surface exported from `src/index.ts`.
- `export { FORBIDDEN_SCOPES, preflightDeliveryFull } from "./preflight-full.js"` - public surface exported from `src/index.ts`.
- `export { DeliveryTarget, FullPreflightResult } from "./preflight-full.js"` - public surface exported from `src/index.ts`.
- `export { buildBranchName, generateBranchSuffix } from "./branch-template.js"` - public surface exported from `src/index.ts`.
- `export { buildPushOnAuth, pushBranch } from "./push-branch.js"` - public surface exported from `src/index.ts`.
- `export { PushBranchInput, PushResult } from "./push-branch.js"` - public surface exported from `src/index.ts`.
- `export { findExistingPr } from "./find-existing-pr.js"` - public surface exported from `src/index.ts`.
- `export { ExistingPrResult } from "./find-existing-pr.js"` - public surface exported from `src/index.ts`.
- `export { findCommentByMarker, postEvidenceComment } from "./post-evidence-comment.js"` - public surface exported from `src/index.ts`.
- `export { EvidenceCommentInput, EvidenceCommentResult } from "./post-evidence-comment.js"` - public surface exported from `src/index.ts`.
- `export { executeDelivery } from "./execute-delivery.js"` - public surface exported from `src/index.ts`.
- `export { computeCiVerdict } from "./compute-ci-verdict.js"` - public surface exported from `src/index.ts`.
- `export { CiCheckRun, CiVerdict } from "./compute-ci-verdict.js"` - public surface exported from `src/index.ts`.

## Runtime dependencies

- `@octokit/plugin-retry`
- `@octokit/plugin-throttling`
- `@octokit/rest`
- `@protostar/artifacts`
- `@protostar/delivery`
- `@protostar/intent`
- `@protostar/review`
- `isomorphic-git`

## Authority constraints

network-permitted, fs-forbidden domain network tier. `no-fs.contract.test.ts` and `no-merge.contract.test.ts` enforce no filesystem authority and no merge/update-branch authority.

## Change log

See [root CHANGELOG.md](../../CHANGELOG.md) (managed by changesets).
