import type { Key, Params } from "../i18n/t";
import type { Refusal } from "./api";

/** Codes the server or the browser refuse with, each with its text. */
const known = new Set<string>([
  "origin",
  "not-configured",
  "setup-refused",
  "passkey-refused",
  "sign-in-refused",
  "cancelled",
  "bad-request",
  "spent",
  "expired",
  "missing",
  "passkey-required",
  "one-device",
  "last-keeper",
  "stale-version",
  "forbidden",
  "unauthorized",
  "duplicate",
  "rate-limited",
  "broken",
]);

/** What a query threw: a refusal, or something that is not one. */
export function asRefusal(error: unknown): Refusal {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? (error as Refusal) : { code: "unknown" };
}

/** What a person reads about a refusal: the reason and the way out. */
export function textOf(t: (key: Key, params?: Params) => string, refusal: Refusal): string {
  const { code, retryAfter } = refusal;
  if (code === "rate-limited") {
    return t("error.rate-limited", { count: Math.max(1, Math.ceil((retryAfter ?? 60) / 60)) });
  }
  return t(known.has(code) ? (`error.${code}` as Key) : "error.unknown");
}
