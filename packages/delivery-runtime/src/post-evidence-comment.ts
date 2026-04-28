import type { EvidenceCommentKind, PrBody } from "@protostar/delivery";
import { buildEvidenceMarker, parseEvidenceMarker } from "@protostar/delivery";

import { sanitizeDeliveryErrorMessage } from "./map-octokit-error.js";
import type { ProtostarOctokit } from "./octokit-client.js";
import type { DeliveryTarget } from "./preflight-full.js";

export interface EvidenceCommentInput {
  readonly target: DeliveryTarget;
  readonly prNumber: number;
  readonly runId: string;
  readonly kind: EvidenceCommentKind;
  readonly body: PrBody;
  readonly octokit: ProtostarOctokit;
  readonly signal: AbortSignal;
}

export type EvidenceCommentResult =
  | { readonly ok: true; readonly commentId: number; readonly url: string }
  | { readonly ok: false; readonly reason: string };

interface ExistingComment {
  readonly id: number;
  readonly body?: string | null;
}

export async function postEvidenceComment(input: EvidenceCommentInput): Promise<EvidenceCommentResult> {
  const marker = buildEvidenceMarker(input.kind, input.runId);
  const wrappedBody = `${marker}\n\n${input.body}` as PrBody;

  try {
    const existing = await findExistingComment(input);
    if (existing !== null) {
      const updated = await input.octokit.rest.issues.updateComment({
        owner: input.target.owner,
        repo: input.target.repo,
        comment_id: existing.id,
        body: wrappedBody,
        request: { signal: input.signal }
      });

      return { ok: true, commentId: updated.data.id, url: updated.data.html_url };
    }

    const created = await input.octokit.rest.issues.createComment({
      owner: input.target.owner,
      repo: input.target.repo,
      issue_number: input.prNumber,
      body: wrappedBody,
      request: { signal: input.signal }
    });

    return { ok: true, commentId: created.data.id, url: created.data.html_url };
  } catch (error: unknown) {
    return { ok: false, reason: sanitizeDeliveryErrorMessage(error) };
  }
}

export function findCommentByMarker(
  comments: readonly ExistingComment[],
  kind: EvidenceCommentKind,
  runId: string
): ExistingComment | null {
  for (const comment of comments) {
    const firstLine = firstNonEmptyLine(comment.body ?? "");
    if (firstLine === null) {
      continue;
    }
    const parsed = parseEvidenceMarker(firstLine);
    if (parsed?.kind === kind && parsed.runId === runId) {
      return comment;
    }
  }

  return null;
}

async function findExistingComment(input: EvidenceCommentInput): Promise<ExistingComment | null> {
  for await (const page of input.octokit.paginate.iterator(input.octokit.rest.issues.listComments, {
    owner: input.target.owner,
    repo: input.target.repo,
    issue_number: input.prNumber,
    request: { signal: input.signal }
  })) {
    const match = findCommentByMarker(page.data, input.kind, input.runId);
    if (match !== null) {
      return match;
    }
  }

  return null;
}

function firstNonEmptyLine(body: string): string | null {
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }

  return null;
}
