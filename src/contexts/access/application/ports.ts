import type { Limit } from "../domain/limits";
import type { LogEntry } from "../domain/log";
import type { AccessReader, Change } from "../domain/member";

/** Where the access of a family is kept. It reads what was saved before. */
export interface AccessStore extends AccessReader {
  save(change: Change): void;
  /** When a key tried something since a time. */
  triesOf(limit: Limit, key: string, since: number): number[];
  tried(limit: Limit, key: string, at: number): void;
  log(entry: LogEntry): void;
  /** The sign-in log, the newest first. */
  logged(): LogEntry[];
  /** Takes away sessions and invitations that are over, and tries before a time. */
  clean(now: number, triesBefore: number): void;
  /** Whether anything is kept that will be over some day. */
  isWaiting(): boolean;
}
