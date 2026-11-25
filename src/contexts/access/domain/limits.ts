import type { Result } from "../../../kernel/result";

/** What is counted, and by whom: an address by its hash, or a keeper. */
export type Limit = "sign-in" | "setup" | "invite";

const minute = 60_000;
const day = 1_440 * minute;

/** At most so many tries within a time. */
const limits: Readonly<Record<Limit, { most: number; within: number }>> = {
  "sign-in": { most: 10, within: 15 * minute },
  setup: { most: 10, within: 15 * minute },
  invite: { most: 50, within: day },
};

/** No try is worth keeping longer than this. */
export const longestWindow = Math.max(...Object.values(limits).map(({ within }) => within));

/** In seconds, as `Retry-After` says it. */
export type RateLimited = { code: "rate-limited"; retryAfter: number };

/** When the tries that count began: those before do not. */
export function windowStart(limit: Limit, now: number): number {
  return now - limits[limit].within;
}

/** Whether one more try is allowed, given the times of the tries within the window. */
export function allowance(
  limit: Limit,
  tries: readonly number[],
  now: number,
): Result<null, RateLimited> {
  const { most, within } = limits[limit];
  const counted = tries.filter((at) => at > now - within).sort((a, b) => a - b);
  if (counted.length < most) return { ok: true, value: null };
  // One more is allowed once the oldest that blocks it is out of the window.
  const free = (counted[counted.length - most] ?? now) + within;
  return { ok: false, error: { code: "rate-limited", retryAfter: Math.ceil((free - now) / 1000) } };
}
