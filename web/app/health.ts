import { queryOptions } from "@tanstack/react-query";
import { type Health, healthSchema } from "../../src/shared/health";

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: fetchHealth,
  retry: 1,
  // Offline is an answer too: "paused" would wait without a word.
  networkMode: "always",
  refetchOnReconnect: true,
});

/** Fails when the server does not answer; null is an answer that is not about health. */
async function fetchHealth(): Promise<Health | null> {
  const response = await fetch("/health", { signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  try {
    // 503 has the same body and says which part is down.
    return healthSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}
