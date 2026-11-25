/** Events, their participants, occupations and notes. */
export { lifeTables, sqliteLife } from "./adapters/sqlite-life";
export { type Life, type LifeError, lifeOver } from "./application/life";
export type { LifeStore } from "./application/ports";
export { type EventKind, eventOf, factOf, type LifeEvent } from "./domain/event";
export type { Change, LifeTarget, PersonLife } from "./domain/life";
export type { Warning } from "./domain/warnings";
