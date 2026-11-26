import { writes } from "../../../kernel/change";
import type { MemberId } from "../../../kernel/id";
import { type Missing, missing } from "../../../kernel/refusal";
import type { Result } from "../../../kernel/result";
import type { AccessReader, Change } from "./member";

/**
 * A step of signing in begun and not finished: the challenge a passkey must sign, and what the step
 * is for. It is known by the hash of the token its browser holds, answered once and soon over.
 */
export type Challenge = {
  hash: string;
  challenge: string;
  expiresAt: number;
} & (
  | {
      purpose: "setup";
      /** The hash of the setup code, the name of the family and of its first keeper. */
      code: string;
      family: string;
      member: { id: MemberId; name: string };
    }
  | {
      purpose: "register";
      /** The hash of the invitation or recovery link it spends. */
      invitation: string;
      member: { id: MemberId; name: string };
    }
  | { purpose: "login" }
);

export type Purpose = Challenge["purpose"];

/** A browser has this long to answer. */
const lifetime = 5 * 60_000;

export type Expired = { code: "expired" };

export function openChallenge(
  input: DistributiveOmit<Challenge, "expiresAt">,
  now: number,
): Change {
  const challenge = { ...input, expiresAt: now + lifetime } as Challenge;
  return writes("challenge", input.hash, null, challenge);
}

/** The challenge of a step, taken: it is answered once, whatever the answer, even a late one. */
export function takeChallenge<P extends Purpose>(
  reader: AccessReader,
  hash: string,
  purpose: P,
  now: number,
): { change: Change; taken: Result<Extract<Challenge, { purpose: P }>, Missing | Expired> } {
  const found = reader.challenge(hash);
  if (found === null) return { change: [], taken: missing("challenge") };
  const change = writes("challenge", hash, found, null);
  if (found.purpose !== purpose) return { change, taken: missing("challenge") };
  if (now >= found.expiresAt) return { change, taken: { ok: false, error: { code: "expired" } } };
  return { change, taken: { ok: true, value: found as Extract<Challenge, { purpose: P }> } };
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
