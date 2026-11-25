/** The edit journal and the trash. */
export { type Migration, migrate } from "./adapters/migrate";
export { historyTables, sqliteJournal } from "./adapters/sqlite-journal";
export { type Act, type Journal, journalOver } from "./application/journal";
export type { JournalStore } from "./application/ports";
export { aggregateOf, type Changed, type Entry, type Patch } from "./domain/entry";
