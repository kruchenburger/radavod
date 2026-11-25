import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { snapshotOf } from "../../../examples/snapshot.ts";
import { branchMap } from "../../../web/tree/layout/branch-map";
import { answer, type MapRequest } from "../../../web/tree/layout/map-request";
import { handle, type Question } from "../../../web/tree/layout.worker";
import { MapLayouter } from "../../../web/tree/map-layouter";
import { measure } from "./family";

/** Stands for the worker of a browser: everything that passes is cloned, as it is there. */
const { FakeWorker } = vi.hoisted(() => {
  type Handle = (question: never) => unknown;
  class FakeWorker extends EventTarget {
    static last: FakeWorker;
    static handle: Handle;
    isBroken = false;
    isStopped = false;

    constructor() {
      super();
      FakeWorker.last = this;
    }

    postMessage(data: unknown): void {
      const sent = structuredClone(data);
      queueMicrotask(() => {
        if (this.isBroken) {
          this.dispatchEvent(new Event("error"));
          return;
        }
        const reply = structuredClone(FakeWorker.handle(sent as never));
        this.dispatchEvent(new MessageEvent("message", { data: reply }));
      });
    }

    terminate(): void {
      this.isStopped = true;
    }
  }
  return { FakeWorker };
});

vi.mock("../../../web/tree/layout.worker?worker", () => ({ default: FakeWorker }));

const snapshot = snapshotOf(generateFamily(1, 300));
const request: MapRequest = {
  snapshot,
  levels: ["far", "closer", "near"],
  headWidths: snapshot.branches.map(({ id, title }) => [id, measure(title.ru, "head")]),
  lineOf: "p1",
};

describe("a map asked for as a message", () => {
  it("is the map the page would lay out, on every level", () => {
    const maps = answer(request);
    expect(maps.map(({ level }) => level)).toEqual(request.levels);
    const far = branchMap(snapshot, {
      level: "far",
      measure,
      lineOf: "p1",
      headOf: ({ title }) => title.ru,
    });
    expect(maps[0]).toEqual(far);
    expect(new Set(maps.map(({ perRow }) => perRow)).size).toBe(1);
  });

  it("manages a branch whose head nobody measured", () => {
    expect(answer({ ...request, headWidths: [] })[0]?.pages).toHaveLength(11);
  });
});

describe("the layout in a worker", () => {
  let layouter: MapLayouter;

  beforeEach(() => {
    FakeWorker.handle = (question) => handle(question as Question);
    layouter = new MapLayouter();
  });
  afterEach(() => layouter.stop());

  it("answers with the same map", async () => {
    expect(await layouter.layOut(request)).toEqual(answer(request));
  });

  it("tells answers apart", async () => {
    const [far, near] = await Promise.all([
      layouter.layOut({ ...request, levels: ["far"] }),
      layouter.layOut({ ...request, levels: ["near"] }),
    ]);
    expect([far[0]?.level, near[0]?.level]).toEqual(["far", "near"]);
  });

  it("fails every waiting question when the worker breaks", async () => {
    FakeWorker.last.isBroken = true;
    await expect(layouter.layOut(request)).rejects.toThrow("layout-worker-failed");
  });

  it("fails waiting questions, and later ones, when it is stopped", async () => {
    const answered = layouter.layOut(request);
    layouter.stop();
    await expect(answered).rejects.toThrow("layout-worker-stopped");
    await expect(layouter.layOut(request)).rejects.toThrow("layout-worker-stopped");
    expect(FakeWorker.last.isStopped).toBe(true);
  });
});
