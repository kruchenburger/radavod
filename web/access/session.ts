import { queryOptions } from "@tanstack/react-query";
import { type SessionAnswer, sessionAnswer } from "../../src/shared/access";

/** A refusal of the server, or of the browser, by its code. */
export type Refusal = { code: string; retryAfter?: number };

export type Answer<T> = { ok: true; value: T } | { ok: false; error: Refusal };

/** Asks the server. The cookie goes along; an answer that is no answer is a refusal too. */
export async function call<T = unknown>(
  method: "GET" | "POST" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Answer<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      credentials: "same-origin",
      // A server that never answers is told as one that did not.
      signal: AbortSignal.timeout(20_000),
      headers: body === undefined ? {} : { "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { ok: false, error: { code: "unknown" } };
  }
  const json: unknown = response.status === 204 ? null : await response.json().catch(() => null);
  if (response.ok) return { ok: true, value: json as T };
  const code = (json as { error?: unknown } | null)?.error;
  // A server that fails says no code of ours.
  const fallback = response.status >= 500 ? "broken" : "unknown";
  const after = Number(response.headers.get("retry-after"));
  return {
    ok: false,
    error: {
      code: typeof code === "string" ? code : fallback,
      ...(Number.isFinite(after) && after > 0 ? { retryAfter: after } : {}),
    },
  };
}

/** Who is signed in, null when nobody. Asked whenever the app opens: it gives the cookie again. */
export const sessionQuery = queryOptions({
  queryKey: ["session"],
  queryFn: async (): Promise<SessionAnswer | null> => {
    const answer = await call("GET", "/api/session");
    if (answer.ok) return sessionAnswer.parse(answer.value);
    if (answer.error.code === "unauthorized") return null;
    throw new Error(answer.error.code);
  },
  retry: 1,
  networkMode: "always",
});
