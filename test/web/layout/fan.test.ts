import { describe, expect, it } from "vitest";
import { generateFamily } from "../../../examples/generate.ts";
import { sampleOf } from "../../../examples/snapshot.ts";
import type { TreeSnapshot } from "../../../src/shared/tree";
import {
  type Fan,
  type FanArrow,
  fanKeys,
  fanMetrics,
  fanOf,
  fanText,
  firstCell,
  sharesOf,
} from "../../../web/tree/layout/fan";
import { kinOf } from "../../../web/tree/layout/kin";
import { bigSnapshot } from "./big";
import { cases } from "./cases";
import { type FamilySpec, familyOf, measure, wordingOf } from "./family";

const eps = 1e-9;

/**
 * What every fan keeps: cells of a ring never overlap, parents stand within their child, one ring
 * further out, inside the half of their side; a person stands once, and a repeat goes no further.
 */
function expectSound(fan: Fan): void {
  const byKey = new Map(fan.cells.map((cell) => [cell.key, cell]));
  const rings = new Map<number, Fan["cells"]>();
  for (const cell of fan.cells) {
    expect(cell.from).toBeGreaterThan(cell.to);
    expect(cell.outer).toBeGreaterThan(cell.inner);
    expect(cell.ring).toBeLessThanOrEqual(fan.metrics.rings.length);
    rings.set(cell.ring, [...(rings.get(cell.ring) ?? []), cell]);
    const child = cell.child === null ? null : byKey.get(cell.child);
    if (child == null) {
      expect(cell.ring).toBe(1);
      const side = fan.sides.find(({ from, to }) => cell.from <= from + eps && cell.to >= to - eps);
      expect(side).toBeDefined();
    } else {
      expect(cell.ring).toBe(child.ring + 1);
      expect(cell.inner).toBeCloseTo(child.outer);
      expect(cell.from).toBeLessThanOrEqual(child.from + eps);
      expect(cell.to).toBeGreaterThanOrEqual(child.to - eps);
      expect(child.repeat).toBe(false);
    }
    const middle = (cell.inner + cell.outer) / 2;
    expect((cell.from - cell.to) * middle).toBeGreaterThanOrEqual(fan.metrics.least - eps);
  }
  for (const ring of rings.values()) {
    const sorted = [...ring].sort((a, b) => b.from - a.from);
    sorted.slice(1).forEach((cell, i) => {
      expect(cell.from).toBeLessThanOrEqual((sorted[i]?.to ?? 0) + eps);
    });
  }
  const once = fan.cells.filter(({ repeat }) => !repeat).map(({ person }) => person);
  const centre = fan.sides.map(({ person }) => person);
  expect(new Set([...once, ...centre]).size).toBe(once.length + centre.length);
}

const wide = { metrics: fanMetrics.wide };

/** The first partner of a person: in the invented family, the couple where the branches meet. */
const partnerOf = (snapshot: TreeSnapshot, id: string): string =>
  kinOf(snapshot)
    .unions(id)
    .find(({ other }) => other !== null)?.other ?? id;

const family: FamilySpec = {
  people: [
    { id: "gf", given: "Grandfather" },
    { id: "gm", given: "Grandmother" },
    { id: "f", parents: ["gf", "gm"] },
    { id: "m", parents: ["mf"] },
    { id: "mf" },
    { id: "x", parents: ["f", "m"] },
    { id: "w", parents: ["wf", "wm"] },
    "wf",
    "wm",
  ],
  unions: [
    ["gf", "gm"],
    ["f", "m"],
    ["x", "w"],
  ],
};
const male = (snapshot: TreeSnapshot, ids: string[]): TreeSnapshot => ({
  ...snapshot,
  people: snapshot.people.map((one) => (ids.includes(one.id) ? { ...one, sex: "male" } : one)),
});

describe("the fan of ancestors", () => {
  const snapshot = male(familyOf(family), ["gf", "f", "mf", "wf"]);

  it("gives a couple a half each, the first on the left, fathers on the outer side", () => {
    const fan = fanOf(snapshot, ["x", "w"], wide);
    expectSound(fan);
    expect(fan.sides).toEqual([
      { person: "x", from: Math.PI, to: Math.PI / 2, further: false },
      { person: "w", from: Math.PI / 2, to: 0, further: false },
    ]);
    const [f, m] = ["f", "m"].map((id) => fan.cells.find(({ person }) => person === id));
    expect(f?.from).toBeCloseTo(Math.PI);
    expect(m?.to).toBeCloseTo(Math.PI / 2);
    const [wf, wm] = ["wf", "wm"].map((id) => fan.cells.find(({ person }) => person === id));
    expect(wf?.from).toBeGreaterThan(wm?.from ?? 0);
  });

  it("gives a person the angle of the known ends of the line", () => {
    const fan = fanOf(snapshot, ["x"], wide);
    const [f, m] = ["f", "m"].map((id) => fan.cells.find(({ person }) => person === id));
    // Two grandparents against one and the place of one nobody knows.
    expect(((f?.from ?? 0) - (f?.to ?? 0)) / ((m?.from ?? 0) - (m?.to ?? 0))).toBeCloseTo(2 / 1.6);
  });

  it("names a person met again and goes no further", () => {
    const cousins = male(
      familyOf({
        people: [
          "a",
          "b",
          { id: "s1", parents: ["a", "b"] },
          { id: "s2", parents: ["a", "b"] },
          {
            id: "x",
            parents: ["c1", "c2"],
          },
          { id: "c1", parents: ["s1"] },
          { id: "c2", parents: ["s2"] },
        ],
      }),
      ["a"],
    );
    const fan = fanOf(cousins, ["x"], wide);
    expectSound(fan);
    const repeats = fan.cells.filter(({ repeat }) => repeat);
    expect(repeats.map(({ person }) => person).sort()).toEqual(["a", "b"]);
    for (const { key } of repeats) expect(fan.cells.some(({ child }) => child === key)).toBe(false);
  });

  it("keeps a parent with no ancestors beside one with many, at the least", () => {
    const line = Array.from({ length: 6 }, (_, i) => i);
    const deep = male(
      familyOf({
        people: [
          { id: "x", parents: ["f", "m"] },
          { id: "f", parents: ["f0", "fm0"] },
          "m",
          ...line.flatMap((i) => [
            { id: `f${i}`, parents: [`f${i + 1}`, `fm${i + 1}`] },
            { id: `fm${i}`, parents: [`m${i + 1}a`, `m${i + 1}b`] },
            `m${i + 1}a`,
            `m${i + 1}b`,
          ]),
        ],
      }),
      ["f", ...line.map((i) => `f${i}`)],
    );
    for (const options of [wide, { metrics: fanMetrics.narrow, isQuarter: true }]) {
      const fan = fanOf(deep, ["x"], options);
      expectSound(fan);
      expect(fan.cells.filter(({ ring }) => ring === 1).map(({ person }) => person)).toEqual([
        "f",
        "m",
      ]);
    }
  });

  it("gives the least from the others and from the place of nobody, or nothing", () => {
    expect(sharesOf([9, 1], 0, { span: 1, least: 0.2 })).toEqual([0.8, 0.2]);
    const [a, b] = sharesOf([1], 0.6, { span: 1, least: 0.7 });
    expect([a, b]).toEqual([0.7, undefined]);
    expect(sharesOf([9, 1], 0, { span: 1, least: 0.6 })).toEqual([0.9, 0.1]);
  });

  it("stands a person met twice in full where they are nearer the centre", () => {
    // g is a grandparent of the father's side and the father of the mother.
    const twice = male(
      familyOf({
        people: [
          { id: "x", parents: ["f", "m"] },
          { id: "f", parents: ["ff", "fm"] },
          { id: "ff", parents: ["g", "gw"] },
          { id: "m", parents: ["g", "gw2"] },
          { id: "g", parents: ["gg", "ggw"] },
          "fm",
          "gw",
          "gw2",
          "gg",
          "ggw",
        ],
      }),
      ["f", "ff", "g", "gg"],
    );
    const fan = fanOf(twice, ["x"], wide);
    expectSound(fan);
    const g = fan.cells.filter(({ person }) => person === "g");
    expect(g.map(({ ring, repeat }) => [ring, repeat])).toEqual([
      [2, false],
      [3, true],
    ]);
    expect(fan.cells.some(({ person }) => person === "gg")).toBe(true);
  });

  it("leaves out who is too narrow and too far, and their child says so", () => {
    const chain = Array.from({ length: 12 }, (_, i) => ({
      id: `p${i}`,
      parents: i === 11 ? [] : [`p${i + 1}`],
    }));
    const fan = fanOf(familyOf({ people: chain }), ["p0"], wide);
    expectSound(fan);
    expect(Math.max(...fan.cells.map(({ ring }) => ring))).toBe(fanMetrics.wide.rings.length);
    expect(fan.cells.find(({ ring }) => ring === 6)?.further).toBe(true);
    const narrow = fanOf(familyOf({ people: chain }), ["p0"], {
      metrics: { ...fanMetrics.wide, least: 10_000 },
    });
    expect(narrow.cells).toEqual([]);
  });

  it("gives one person a quarter on the phone", () => {
    const fan = fanOf(snapshot, ["x", "w"], { metrics: fanMetrics.narrow, isQuarter: true });
    expectSound(fan);
    expect(fan.sides).toEqual([{ person: "x", from: Math.PI / 2, to: 0, further: false }]);
  });

  it("marks the direct line, and none for somebody off it", () => {
    const on = fanOf(snapshot, ["x"], { ...wide, lineOf: "x" });
    expect(on.cells.every(({ direct }) => direct)).toBe(true);
    const off = fanOf(snapshot, ["w"], { ...wide, lineOf: "x" });
    expect(off.cells.some(({ direct }) => direct)).toBe(false);
  });

  it.each(Object.entries(cases))("manages %s", (_, spec) => {
    const own = familyOf(spec);
    for (const { id } of own.people.slice(-3)) {
      expectSound(fanOf(own, [id], wide));
      expectSound(fanOf(own, [id], { metrics: fanMetrics.narrow, isQuarter: true }));
    }
  });

  it("draws the couple of the invented family where all branches meet", () => {
    const { snapshot: invented, line } = sampleOf(generateFamily(1, 300));
    const fan = fanOf(invented, [line, partnerOf(invented, line)], { ...wide, lineOf: line });
    expectSound(fan);
    const branches = new Set(
      fan.cells.flatMap(
        ({ person }) => invented.people.find((one) => one.id === person)?.branch ?? [],
      ),
    );
    expect(branches.size).toBe(invented.branches.length);
  });

  it("lays out two thousand people within 50 ms", () => {
    const big = { ...bigSnapshot(2000) };
    const start = performance.now();
    for (const { id } of big.people.slice(-20)) expectSound(fanOf(big, [id], wide));
    expect((performance.now() - start) / 20).toBeLessThan(50);
  });
});

describe("the words of a cell", () => {
  const { snapshot: invented, line } = sampleOf(generateFamily(1, 300));
  const wording = wordingOf(invented);

  it("fit their cell, whatever form they take", () => {
    for (const metrics of [fanMetrics.wide, fanMetrics.narrow]) {
      const fan = fanOf(invented, [line, partnerOf(invented, line)], { metrics, lineOf: line });
      for (const cell of fan.cells) {
        const person = invented.people.find(({ id }) => id === cell.person);
        if (person === undefined) continue;
        const lines = fanText(cell, wording.person(person), { measure, sets: metrics.sets });
        const set = metrics.sets[cell.ring - 1];
        for (const one of lines) {
          if (set === "along") {
            const arc = (cell.from - cell.to) * (cell.inner + (cell.outer - cell.inner) / 2);
            expect(one.w).toBeLessThanOrEqual(arc);
          } else {
            expect(one.w).toBeLessThanOrEqual(cell.outer - cell.inner - 16);
          }
        }
        expect(lines.length * 17).toBeLessThanOrEqual(
          set === "along" ? cell.outer - cell.inner : (cell.from - cell.to) * (cell.inner + 10) + 8,
        );
      }
    }
  });
});

describe("the keys on the fan", () => {
  const { snapshot: invented, line } = sampleOf(generateFamily(1, 300));
  const fan = fanOf(invented, [line, partnerOf(invented, line)], { ...wide, lineOf: line });
  const move = fanKeys(fan);

  it("go up to a parent on the direct line, down to the child, along the ring", () => {
    const first = firstCell(fan);
    expect(first?.direct).toBe(true);
    const up = move(first?.key ?? "", "up");
    const parent = fan.cells.find(({ key }) => key === up);
    expect(parent?.child).toBe(first?.key);
    expect(parent?.direct).toBe(true);
    expect(move(up ?? "", "down")).toBe(first?.key);
    expect(move(first?.key ?? "", "down")).toBeNull();
    const right = fan.cells.find(({ key }) => key === move(first?.key ?? "", "right"));
    expect(right?.ring).toBe(1);
    expect(right?.from).toBeLessThanOrEqual((first?.to ?? 0) + eps);
  });

  it("reach everybody", () => {
    const seen = new Set<string>();
    const queue = [firstCell(fan)?.key ?? ""];
    for (const key of queue) {
      if (seen.has(key)) continue;
      seen.add(key);
      for (const arrow of ["up", "down", "left", "right"] as FanArrow[]) {
        const next = move(key, arrow);
        if (next !== null) queue.push(next);
      }
    }
    expect(seen.size).toBe(fan.cells.length);
  });
});
