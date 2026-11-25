import type { BranchMap } from "./layout/branch-map";
import type { MapRequest } from "./layout/map-request";
import type { Answer } from "./layout.worker";
import LayoutWorker from "./layout.worker?worker";

type Waiting = { resolve: (maps: BranchMap[]) => void; reject: (reason: Error) => void };

/** Lays out the map off the main thread. */
export class MapLayouter {
  readonly #worker = new LayoutWorker();
  readonly #waiting = new Map<number, Waiting>();
  #count = 0;
  #isStopped = false;

  constructor() {
    this.#worker.addEventListener("message", ({ data }: MessageEvent<Answer>) => {
      this.#waiting.get(data.id)?.resolve(data.maps);
      this.#waiting.delete(data.id);
    });
    this.#worker.addEventListener("error", () => this.#fail("layout-worker-failed"));
  }

  layOut(request: MapRequest): Promise<BranchMap[]> {
    this.#count += 1;
    const id = this.#count;
    return new Promise((resolve, reject) => {
      this.#waiting.set(id, { resolve, reject });
      if (this.#isStopped) this.#fail("layout-worker-stopped");
      else this.#worker.postMessage({ id, request });
    });
  }

  stop(): void {
    this.#isStopped = true;
    this.#worker.terminate();
    this.#fail("layout-worker-stopped");
  }

  #fail(code: string): void {
    for (const { reject } of this.#waiting.values()) reject(new Error(code));
    this.#waiting.clear();
  }
}
