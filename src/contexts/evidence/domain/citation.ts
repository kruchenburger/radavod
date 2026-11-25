import { type Write, writes } from "../../../kernel/change";
import type { CitationId, FactRef, PersonId, SourceId, UnionId } from "../../../kernel/id";
import {
  type Duplicate,
  duplicate,
  type InUse,
  inUse,
  type Missing,
  missing,
} from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import type { Source, SourceChange, SourceReader } from "./source";

/** A source behind a fact. The fact is known by its identifier only. */
export type Citation = {
  id: CitationId;
  source: SourceId;
  fact: FactRef;
  page: string;
  quote: string;
};

/** Whose facts are cited. */
export type SubjectId = FactRef["subject"];

/** All citations of the facts of one subject. */
export type Cited = { id: SubjectId; version: number; citations: Citation[] };

export type Change = (SourceChange[number] | Write<"cited", PersonId | UnionId, Cited>)[];

export interface EvidenceReader extends SourceReader {
  citedOf(id: SubjectId): Cited | null;
  /** How many citations are of a source. */
  countOf(source: SourceId): number;
}

/** A citation taken back, with how many are left behind its fact. */
export type Uncited = { change: Change; left: number; fact: FactRef };

/** A source or the citations of a subject as they were, or null when there were none. */
export type EvidenceTarget =
  | { kind: "source"; id: SourceId; value: Omit<Source, "id" | "version"> | null }
  | { kind: "cited"; id: SubjectId; value: Pick<Cited, "citations"> | null };

/** Puts citations as they were, and the sources that were there. */
export function putCitationsBack(
  reader: EvidenceReader,
  targets: readonly EvidenceTarget[],
): Result<Change, Missing> {
  const change: Change = [];
  const sources = new Set<SourceId>();
  for (const target of targets) {
    if (target.kind === "source" && target.value !== null) {
      sources.add(target.id);
      const stored = reader.source(target.id);
      const after = { ...target.value, id: target.id, version: stored?.version ?? 0 };
      change.push(...writes("source", target.id, stored, after));
    }
  }
  for (const target of targets) {
    if (target.kind !== "cited") continue;
    const citations = target.value?.citations ?? [];
    const lost = citations.find(
      ({ source }) => !sources.has(source) && reader.source(source) === null,
    );
    if (lost !== undefined) return missing(lost.source);
    const stored = reader.citedOf(target.id);
    const after = target.value && { ...target.value, id: target.id, version: stored?.version ?? 0 };
    change.push(...writes("cited", target.id, stored, after));
  }
  return { ok: true, value: change };
}

/** Removes a source nothing is known from. */
export function removeSource(
  reader: EvidenceReader,
  id: SourceId,
): Result<Change, Missing | InUse> {
  const source = reader.source(id);
  if (source === null) return missing(id);
  const count = reader.countOf(id);
  return count > 0 ? inUse(count) : { ok: true, value: writes("source", id, source, null) };
}

export function citationsOf(reader: EvidenceReader, subject: SubjectId): Citation[] {
  return reader.citedOf(subject)?.citations ?? [];
}

export function countFor(reader: EvidenceReader, { subject, fact }: FactRef): number {
  return citationsOf(reader, subject).filter((one) => one.fact.fact === fact).length;
}

export function cite(
  reader: EvidenceReader,
  citation: Citation,
): Result<Change, Missing | Duplicate> {
  if (reader.source(citation.source) === null) return missing(citation.source);
  const { subject } = citation.fact;
  const cited = reader.citedOf(subject);
  const { version = 0, citations = [] } = cited ?? {};
  // Identifiers are random: a new one is not looked for at other subjects.
  if (citations.some(({ id }) => id === citation.id)) return duplicate;
  const after = { id: subject, version, citations: [...citations, citation] };
  return { ok: true, value: writes("cited", subject, cited, after) };
}

/** Takes a citation back from the fact it is believed to stand behind. */
export function uncite(
  reader: EvidenceReader,
  fact: FactRef,
  id: CitationId,
): Result<Uncited, Missing> {
  const { subject } = fact;
  const cited = reader.citedOf(subject);
  const citation = cited?.citations.find((one) => one.id === id && one.fact.fact === fact.fact);
  if (!cited || !citation) return missing(id);
  const citations = cited.citations.filter((one) => one !== citation);
  const left = citations.filter((one) => one.fact.fact === fact.fact).length;
  const change = writes("cited", subject, cited, { ...cited, citations });
  return { ok: true, value: { change, left, fact } };
}
