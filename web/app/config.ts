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

/** Fails when the server does not answer; null is an answer that is not a config. */
async function fetchConfig(): Promise<Config | null> {
  const response = await fetch("/config", { signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  try {
    return configSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}
