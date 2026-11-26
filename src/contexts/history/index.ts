/** The edit journal and the trash. */
export { sqliteCheckpoints, upgradeHistory } from "./adapters/sqlite-checkpoints";
export { purge } from "./adapters/sqlite-purge";
export { addSnapshot, type KeptSnapshot, sqliteSnapshots } from "./adapters/sqlite-snapshot";
export { sqliteTrash } from "./adapters/sqlite-trash";
export { type Migration, migrate } from "./adapters/migrate";
export { historyTables, sqliteJournal } from "./adapters/sqlite-journal";
export { type Act, type Journal, journalOver } from "./application/journal";
export type { JournalStore } from "./application/ports";
export { linkMark, scrubbed, type Words, wholeNames, withoutNames, wordsOf } from "./domain/erase";
export type { Trash, Trashed, TrashedUnion } from "./domain/trash";
export { aggregateOf, type Changed, type Entry, type Patch } from "./domain/entry";
