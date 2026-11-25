import { queryOptions } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import { SAMPLE_FILE } from "../../src/shared/sample-path";
import { type TreeSample, treeSampleSchema, type TreeSnapshot } from "../../src/shared/tree";
import type { Words } from "../tree/words";

export const sampleQuery = queryOptions({
  queryKey: ["sample"],
  queryFn: fetchSample,
  retry: 1,
  networkMode: "always",
  staleTime: Infinity,
  // The tree is read once and compared by identity.
  structuralSharing: false,
});

/** Fails when the server does not answer; null is an answer that is not a tree. */
async function fetchSample(): Promise<TreeSample | null> {
  const response = await fetch(SAMPLE_FILE, { signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  try {
    return treeSampleSchema.parse(JSON.parse(text));
  } catch {
    return null;
  }
}

export type Data = { snapshot: TreeSnapshot; start: string; words: Words };

export const DataContext = createContext<Data | null>(null);

export function useData(): Data {
  const data = useContext(DataContext);
  if (!data) throw new Error("no-data");
  return data;
}
