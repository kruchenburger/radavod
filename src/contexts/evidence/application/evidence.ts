import type { CitationId, FactRef, SourceId } from "../../../kernel/id";
import type { Duplicate, InUse, Missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import {
  type Change,
  type Citation,
  citationsOf,
  cite,
  countFor,
  type EvidenceTarget,
  putCitationsBack,
  removeSource,
  type SubjectId,
  type Uncited,
  uncite,
} from "../domain/citation";
import {
  addSource,
  editSource,
  type NewSource,
  type Source,
  type SourcePatch,
} from "../domain/source";
import type { EvidenceStore } from "./ports";

export type EvidenceError = Missing | Duplicate | InUse;

/** A command that is refused or changes nothing is not stored. */
export interface Evidence {
  source(id: SourceId): Source | null;
  addSource(source: NewSource): Result<Change, EvidenceError>;
  editSource(id: SourceId, patch: SourcePatch): Result<Change, EvidenceError>;
  removeSource(id: SourceId): Result<Change, EvidenceError>;
  /** Puts sources and citations as they were. */
  putBack(targets: readonly EvidenceTarget[]): Result<Change, EvidenceError>;
  citationsOf(subject: SubjectId): Citation[];
  countFor(fact: FactRef): number;
  cite(citation: Citation): Result<Change, EvidenceError>;
  uncite(fact: FactRef, id: CitationId): Result<Uncited, EvidenceError>;
}

export function evidenceOver(store: EvidenceStore): Evidence {
  const saved = (result: Result<Change, EvidenceError>) => {
    if (result.ok && result.value.length > 0) store.save(result.value);
    return result;
  };
  return {
    source: (id) => store.source(id),
    addSource: (source) => saved(addSource(store, source)),
    editSource: (id, patch) => saved(editSource(store, id, patch)),
    removeSource: (id) => saved(removeSource(store, id)),
    putBack(targets) {
      const back = saved(putCitationsBack(store, targets));
      if (!back.ok) return back;
      // What goes is asked last: the citations of it may have gone before.
      const change = [...back.value];
      for (const { kind, id, value } of targets) {
        if (kind !== "source" || value !== null || store.source(id) === null) continue;
        const removed = saved(removeSource(store, id));
        if (!removed.ok) return removed;
        change.push(...removed.value);
      }
      return { ok: true, value: change };
    },
    citationsOf: (subject) => citationsOf(store, subject),
    countFor: (fact) => countFor(store, fact),
    cite: (citation) => saved(cite(store, citation)),
    uncite(fact, id) {
      const result = uncite(store, fact, id);
      if (result.ok) store.save(result.value.change);
      return result;
    },
  };
}
