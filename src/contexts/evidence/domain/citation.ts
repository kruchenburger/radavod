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
import type { SourceChange, SourceReader } from "./source";

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
