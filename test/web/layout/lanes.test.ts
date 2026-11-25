import { describe, expect, it } from "vitest";
import { Track } from "../../../web/tree/layout/lanes";

function laid(...spans: [string, number, number][]): Record<string, number> {
  const track = new Track();
  for (const [family, from, to] of spans) {
    track.touch(family, from);
    track.touch(family, to);
  }
  track.lay();
  return Object.fromEntries(spans.map(([family]) => [family, track.lane(family)]));
}

describe("lanes", () => {
  it("part families that lie side by side", () => {
    expect(laid(["a", 0, 100], ["b", 50, 150])).toEqual({ a: 0, b: 1 });
  });

  it("are used again further on", () => {
    expect(laid(["a", 0, 100], ["b", 150, 200])).toEqual({ a: 0, b: 0 });
  });

  it("are not shared by ends that nearly meet", () => {
    expect(laid(["a", 0, 100], ["b", 104, 200])).toEqual({ a: 0, b: 1 });
  });

  it("are as many as needed and no more", () => {
    const track = new Track();
    for (const [family, at] of [["a", 0], ["a", 9], ["b", 5], ["b", 20], ["c", 40], ["c", 41]] as const) {
      track.touch(family, at);
    }
    expect(track.lay()).toBe(2);
  });

  it("are not needed by a family with a single place", () => {
    const track = new Track();
    track.touch("a", 5);
    track.touch("a", 5);
    expect(track.lay()).toBe(0);
  });

  it("take ends without a bound", () => {
    expect(laid(["a", -Infinity, 10], ["b", 5, Infinity], ["c", 30, 40])).toEqual({
      a: 0,
      b: 1,
      c: 0,
    });
  });
});
