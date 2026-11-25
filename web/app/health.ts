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

async function fetchHealth({ signal }: { signal: AbortSignal }): Promise<Health> {
  // 503 has the same body and says which part is down.
  const response = await fetch("/health", { signal });
  return healthSchema.parse(await response.json());
}
