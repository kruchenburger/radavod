/** Sources and the citations that tie them to facts. */
export { evidenceTables, sqliteEvidence } from "./adapters/sqlite-evidence";
export { type Evidence, type EvidenceError, evidenceOver } from "./application/evidence";
export type { EvidenceStore } from "./application/ports";
export type {
  Change,
  Citation,
  Cited,
  EvidenceTarget,
  SubjectId,
  Uncited,
} from "./domain/citation";
export type { NewSource, Source, SourcePatch } from "./domain/source";
