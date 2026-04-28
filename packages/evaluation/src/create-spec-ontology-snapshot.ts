import type { ConfirmedIntent } from "@protostar/intent";

import type { OntologySnapshot } from "./index.js";

export function createSpecOntologySnapshot(intent: ConfirmedIntent): OntologySnapshot {
  return {
    generation: 0,
    fields: intent.acceptanceCriteria.map((criterion) => ({
      name: criterion.id,
      type: criterion.verification,
      description: criterion.statement
    }))
  };
}
