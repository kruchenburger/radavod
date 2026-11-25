import type { BranchMap } from "./layout/branch-map";
import type { MapRequest } from "./layout/map-request";
import type { Answer } from "./layout.worker";
import LayoutWorker from "./layout.worker?worker";

type Waiting = { resolve: (maps: BranchMap[]) => void; reject: (reason: Error) => void };

/**
 * Lays out the map off the main thread. A worker that breaks or does not load fails the questions
 * that wait for it, and the next question gets a new worker.
 */
export class MapLayouter {
  #worker: Worker | null = null;
  #isStopped = false;
  #count = 0;
  readonly #waiting = new Map<number, Waiting>();

  layOut(request: MapRequest): Promise<BranchMap[]> {
    return new Promise((resolve, reject) => {
      if (this.#isStopped) throw new Error("layout-worker-stopped");
      this.#worker ??= this.#start();
      this.#count += 1;
      const id = this.#count;
      this.#worker.postMessage({ id, request });
      // Only what was sent is waited for.
      this.#waiting.set(id, { resolve, reject });
    });
  }

  stop(): void {
    this.#isStopped = true;
    this.#end("layout-worker-stopped");
  }

  #start(): Worker {
    const worker = new LayoutWorker();
    worker.addEventListener("message", ({ data }: MessageEvent<Answer>) => {
      const waiting = this.#waiting.get(data.id);
      this.#waiting.delete(data.id);
      if ("maps" in data) waiting?.resolve(data.maps);
      else waiting?.reject(new Error(data.error));
    });
    const breakDown = (): void => {
      if (this.#worker === worker) this.#end("layout-worker-failed");
    };
    worker.addEventListener("error", breakDown);
    worker.addEventListener("messageerror", breakDown);
    return worker;
  }

  #end(code: string): void {
    this.#worker?.terminate();
    this.#worker = null;
    for (const { reject } of this.#waiting.values()) reject(new Error(code));
    this.#waiting.clear();
  }
}
