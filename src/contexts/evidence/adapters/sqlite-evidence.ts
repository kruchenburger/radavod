import { z } from "zod";
import { isId, type SourceId } from "../../../kernel/id";
import { type Kept, type RawRow, Rows, type Written } from "../../../shared/rows";
import { citationIdSchema, factRefSchema, sourceIdSchema } from "../../../shared/values";
import type { EvidenceStore } from "../application/ports";
import type { Change, Citation, Cited, SubjectId } from "../domain/citation";
import type { Source } from "../domain/source";

export const evidenceTables = [
  `CREATE TABLE evidence_source (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
  `CREATE TABLE evidence_subject (
    id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL
  ) WITHOUT ROWID`,
];

const sourceSchema = z.strictObject({
  kind: z.enum(["document", "book", "story", "site", "import", "other"]),
  title: z.string(),
  repository: z.string(),
  note: z.string(),
}) satisfies z.ZodType<Omit<Source, "id" | "version">>;

const citationSchema = z.strictObject({
  id: citationIdSchema,
  source: sourceIdSchema,
  fact: factRefSchema,
  page: z.string(),
  quote: z.string(),
}) satisfies z.ZodType<Citation>;

const citedSchema = z.strictObject({
  citations: z.array(citationSchema),
}) satisfies z.ZodType<Omit<Cited, "id" | "version">>;

export function sqliteEvidence(sql: SqlStorage): EvidenceStore & Kept {
  return new SqliteEvidence(sql);
}

class SqliteEvidence implements EvidenceStore, Kept {
  readonly #sql: SqlStorage;
  readonly #sources: Rows<SourceId, Source>;
  readonly #cited: Rows<SubjectId, Cited>;

  constructor(sql: SqlStorage) {
    this.#sql = sql;
    this.#sources = new Rows<SourceId, Source>("source", sourceSchema, {
      read: (id) =>
        sql.exec<RawRow>("SELECT version, data FROM evidence_source WHERE id = ?", id).toArray()[0],
      write: (id, version, data) => {
        sql.exec(
          `INSERT INTO evidence_source (id, version, data) VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
          id,
          version,
          data,
        );
      },
      remove: (id) => {
        sql.exec("DELETE FROM evidence_source WHERE id = ?", id);
      },
    });
    this.#cited = new Rows<SubjectId, Cited>("cited", citedSchema, {
      read: (id) =>
        sql
          .exec<RawRow>("SELECT version, data FROM evidence_subject WHERE id = ?", id)
          .toArray()[0],
      write: (id, version, data) => {
        sql.exec(
          `INSERT INTO evidence_subject (id, version, data) VALUES (?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET version = excluded.version, data = excluded.data`,
          id,
          version,
          data,
        );
      },
      remove: (id) => {
        sql.exec("DELETE FROM evidence_subject WHERE id = ?", id);
      },
    });
  }

  source(id: SourceId): Source | null {
    return this.#sources.get(id);
  }

  citedOf(id: SubjectId): Cited | null {
    return this.#cited.get(id);
  }

  countOf(source: SourceId): number {
    const found = this.#sql
      .exec<RawRow & { id: SubjectId }>(
        "SELECT id, version, data FROM evidence_subject WHERE instr(data, ?) > 0",
        source,
      )
      .toArray();
    const citations = this.#cited.among(found).flatMap((cited) => cited.citations);
    return citations.filter((one) => one.source === source).length;
  }

  save(change: Change): void {
    for (const write of change) {
      if (write.kind === "source") this.#sources.put(write.id, write.after);
      else this.#cited.put(write.id, write.after);
    }
  }

  current(kind: string, id: string): number | undefined {
    if (kind === "source" && isId("source", id)) return this.#sources.version(id);
    if (kind !== "cited") return undefined;
    return isId("person", id) || isId("union", id) ? this.#cited.version(id) : undefined;
  }

  authored(kind: string, id: string): unknown {
    if (kind === "source" && isId("source", id)) return this.#sources.authored(id);
    if (kind !== "cited") return undefined;
    return isId("person", id) || isId("union", id) ? this.#cited.authored(id) : undefined;
  }

  everything() {
    const sources = this.#sql.exec<RawRow & { id: SourceId }>(
      "SELECT id, version, data FROM evidence_source",
    );
    const cited = this.#sql.exec<RawRow & { id: SubjectId }>(
      "SELECT id, version, data FROM evidence_subject",
    );
    return [
      ...this.#sources.authoredAmong(sources.toArray()),
      ...this.#cited.authoredAmong(cited.toArray()),
    ];
  }

  flush(version: number): Written[] {
    return [...this.#sources.flush(version), ...this.#cited.flush(version)];
  }
}
