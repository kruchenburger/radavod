import type { Change, EvidenceReader } from "../domain/citation";

/** Where sources and citations are kept. It reads what was saved before, and counts the versions. */
export interface EvidenceStore extends EvidenceReader {
  save(change: Change): void;
}
