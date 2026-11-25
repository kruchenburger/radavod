import { type Write, writes } from "../../../kernel/change";
import type { SourceId } from "../../../kernel/id";
import { type Duplicate, duplicate, type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";

/** Where facts are known from. A relative's story is one too. */
export type Source = {
  id: SourceId;
  version: number;
  kind: "document" | "book" | "story" | "site" | "import" | "other";
  title: string;
  /** Who keeps it, and where. */
  repository: string;
  note: string;
};

export type NewSource = Omit<Source, "version">;
export type SourcePatch = Partial<Omit<Source, "id" | "version">>;
export type SourceChange = Write<"source", SourceId, Source>[];

export interface SourceReader {
  source(id: SourceId): Source | null;
}

export function addSource(
  reader: SourceReader,
  source: NewSource,
): Result<SourceChange, Duplicate> {
  if (reader.source(source.id) !== null) return duplicate;
  return { ok: true, value: writes("source", source.id, null, { ...source, version: 0 }) };
}

export function editSource(
  reader: SourceReader,
  id: SourceId,
  patch: SourcePatch,
): Result<SourceChange, Missing> {
  const source = reader.source(id);
  if (source === null) return missing(id);
  return { ok: true, value: writes("source", id, source, { ...source, ...patch }) };
}
