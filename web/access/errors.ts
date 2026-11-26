import { ru } from "../i18n/ru";
import type { Key, Params } from "../i18n/t";
import type { Refusal } from "./api";

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
  const key = `error.${code}`;
  // Every code with a text in the catalog is known; any other is a server that said nothing of use.
  return t(Object.hasOwn(ru, key) ? (key as Key) : "error.unknown");
}
