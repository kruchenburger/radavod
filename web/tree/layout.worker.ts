import type { BranchMap } from "./layout/branch-map";
import { answer, type MapRequest } from "./layout/map-request";

export type Question = { id: number; request: MapRequest };
export type Answer = { id: number; maps: BranchMap[] } | { id: number; error: string };

/** One question that cannot be answered does not take the others with it. */
export function handle({ id, request }: Question): Answer {
  try {
    return { id, maps: answer(request) };
  } catch {
    return { id, error: "layout-failed" };
  }
}

self.addEventListener("message", ({ data }: MessageEvent<Question>) => {
  self.postMessage(handle(data));
});
