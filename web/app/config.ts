import { queryOptions } from "@tanstack/react-query";
import { type Config, configSchema } from "../../src/shared/config";

/** What this installation allows before a sign-in. */
export const configQuery = queryOptions({
  queryKey: ["config"],
  queryFn: fetchConfig,
  retry: 1,
  networkMode: "always",
  staleTime: Infinity,
});

async function fetchConfig(): Promise<Config> {
  const response = await fetch("/config", { signal: AbortSignal.timeout(10_000) });
  return configSchema.parse(await response.json());
}
