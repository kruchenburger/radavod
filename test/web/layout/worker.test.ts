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
    static isMissing = false;
    isStopped = false;
    isDead = false;

    constructor() {
      super();
      FakeWorker.last = this;
    }

    postMessage(data: unknown): void {
      const sent = structuredClone(data);
      queueMicrotask(() => {
        if (FakeWorker.isMissing) this.break();
        if (this.isDead) return;
        let reply: unknown;
        try {
          reply = structuredClone(FakeWorker.handle(sent as never));
        } catch {
          this.dispatchEvent(new Event("error"));
          return;
        }
        this.dispatchEvent(new MessageEvent("message", { data: reply }));
      });
    }

    /** What a script that did not load does: one event, and silence after it. */
    break(): void {
      this.isDead = true;
      this.dispatchEvent(new Event("error"));
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

  it("has as many pages in a row on every level, within a width too", () => {
    for (const levels of [request.levels, [...request.levels].reverse()]) {
      const maps = answer({ ...request, levels, width: 1200 });
      expect(new Set(maps.map(({ perRow }) => perRow)).size).toBe(1);
      expect(maps[0]?.perRow).toBeLessThan(5);
    }
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
    const answered = [layouter.layOut(request), layouter.layOut(request)];
    FakeWorker.last.break();
    for (const one of answered) await expect(one).rejects.toThrow("layout-worker-failed");
  });

  it("starts again after a worker that broke between questions", async () => {
    await layouter.layOut(request);
    const broken = FakeWorker.last;
    broken.break();
    expect(await layouter.layOut(request)).toEqual(answer(request));
    expect(FakeWorker.last).not.toBe(broken);
    expect(broken.isStopped).toBe(true);
  });

  it("does not wait for a worker that never loads", async () => {
    FakeWorker.isMissing = true;
    for (let i = 0; i < 2; i += 1) {
      await expect(layouter.layOut(request)).rejects.toThrow("layout-worker-failed");
    }
    FakeWorker.isMissing = false;
    expect(await layouter.layOut(request)).toEqual(answer(request));
  });

  it("is not disturbed by a late error of a worker it left", async () => {
    await layouter.layOut(request);
    const broken = FakeWorker.last;
    broken.break();
    const answered = layouter.layOut(request);
    broken.break();
    expect(await answered).toEqual(answer(request));
  });

  it("fails one question it cannot answer and answers the rest", async () => {
    const bad = { ...request, snapshot: null as never };
    const [failed, fine] = await Promise.allSettled([
      layouter.layOut(bad),
      layouter.layOut(request),
    ]);
    expect(failed).toMatchObject({ status: "rejected", reason: { message: "layout-failed" } });
    expect(fine.status).toBe("fulfilled");
  });

  it("fails a question that cannot be sent", async () => {
    const bad = { ...request, levels: [() => "far"] as never };
    await expect(layouter.layOut(bad)).rejects.toThrow();
    expect(await layouter.layOut(request)).toEqual(answer(request));
  });

  it("fails waiting questions, and later ones, when it is stopped", async () => {
    const answered = layouter.layOut(request);
    layouter.stop();
    await expect(answered).rejects.toThrow("layout-worker-stopped");
    await expect(layouter.layOut(request)).rejects.toThrow("layout-worker-stopped");
    expect(FakeWorker.last.isStopped).toBe(true);
  });
});
