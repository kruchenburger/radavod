import type { BranchMap } from "./layout/branch-map";
import { answer, type MapRequest } from "./layout/map-request";

export type Question = { id: number; request: MapRequest };
export type Answer = { id: number; maps: BranchMap[] };

export const handle = ({ id, request }: Question): Answer => ({ id, maps: answer(request) });

self.addEventListener("message", ({ data }: MessageEvent<Question>) => {
  self.postMessage(handle(data));
});
