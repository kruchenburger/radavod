import type { MemberId } from "../../../kernel/id";

/**
 * The sign-in log that keepers read: who signed in with what and when, and who was given a recovery
 * link. The place is a country at most: an address is never kept.
 */
export type LogEntry = {
  at: number;
  kind: "sign-in" | "recovery";
  member: MemberId;
  credential: string | null;
  /** Who gave a recovery link. */
  by: MemberId | null;
  country: string | null;
};

/** Two letters of a country, as Cloudflare names it; anything else is no place. */
export function countryOf(value: unknown): string | null {
  return typeof value === "string" && /^[A-Z]{2}$/u.test(value) && value !== "XX" ? value : null;
}
