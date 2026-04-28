import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildEvidenceMarker,
  EVIDENCE_COMMENT_KINDS,
  parseEvidenceMarker,
  type EvidenceCommentKind
} from "./evidence-marker.js";

describe("evidence markers", () => {
  it("builds and parses all marker kinds with run ids", () => {
    for (const kind of EVIDENCE_COMMENT_KINDS) {
      const marker = buildEvidenceMarker(kind, `run_${kind.replaceAll("-", "_")}`);
      assert.equal(marker, `<!-- protostar-evidence:${kind}:run_${kind.replaceAll("-", "_")} -->`);
      assert.deepEqual(parseEvidenceMarker(marker), { kind, runId: `run_${kind.replaceAll("-", "_")}` });
    }
  });

  it("builds the exact mechanical summary marker", () => {
    assert.equal(
      buildEvidenceMarker("mechanical-full", "run_abc123"),
      "<!-- protostar-evidence:mechanical-full:run_abc123 -->"
    );
  });

  it("parses a known marker", () => {
    assert.deepEqual(parseEvidenceMarker("<!-- protostar-evidence:judge-transcripts:run_xyz -->"), {
      kind: "judge-transcripts" satisfies EvidenceCommentKind,
      runId: "run_xyz"
    });
  });

  it("rejects malformed, kind-only, unknown-kind, and whitespace-variant markers", () => {
    assert.equal(parseEvidenceMarker("<!-- protostar-evidence:mechanical-full -->"), null);
    assert.equal(parseEvidenceMarker("<!-- protostar-evidence:unknown-kind:run_xyz -->"), null);
    assert.equal(parseEvidenceMarker(" <!-- protostar-evidence:mechanical-full:run_xyz -->"), null);
    assert.equal(parseEvidenceMarker("<!-- protostar-evidence:mechanical-full:run_xyz-->"), null);
  });
});
