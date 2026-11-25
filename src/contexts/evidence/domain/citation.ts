import { type Write, writes } from "../../../kernel/change";
import type { CitationId, FactRef, PersonId, SourceId, UnionId } from "../../../kernel/id";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
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
  /** Whose fact a citation stands behind. */
  subjectOf(citation: CitationId): SubjectId | null;
}

/** A citation taken back, with how many are left behind its fact. */
export type Uncited = { change: Change; left: number; fact: FactRef };

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
  if (reader.subjectOf(citation.id) !== null) return duplicate;
  const { subject } = citation.fact;
  const cited = reader.citedOf(subject);
  const { version = 0, citations = [] } = cited ?? {};
  const after = { id: subject, version, citations: [...citations, citation] };
  return { ok: true, value: writes("cited", subject, cited, after) };
}

export function uncite(reader: EvidenceReader, id: CitationId): Result<Uncited, Missing> {
  const subject = reader.subjectOf(id);
  const cited = subject && reader.citedOf(subject);
  const citation = cited?.citations.find((one) => one.id === id);
  if (!subject || !cited || !citation) return missing(id);
  const citations = cited.citations.filter((one) => one !== citation);
  const { fact } = citation;
  const left = citations.filter((one) => one.fact.fact === fact.fact).length;
  const change = writes("cited", subject, cited, { ...cited, citations });
  return { ok: true, value: { change, left, fact } };
}
