import { describe, expect, it } from "vitest";
import { writes } from "../../src/kernel/change";

describe("a write", () => {
  it("is of one aggregate before and after", () => {
    expect(writes("thing", "t1", null, { a: 1 })).toEqual([
      { kind: "thing", id: "t1", before: null, after: { a: 1 } },
    ]);
    expect(writes("thing", "t1", { a: 1 }, null)).toHaveLength(1);
    expect(writes("thing", "t1", { a: [1, 2] }, { a: [2, 1] })).toHaveLength(1);
    expect(writes<"thing", string, unknown>("thing", "t1", { a: [] }, { a: {} })).toHaveLength(1);
  });

  it("is none when nothing differs, in whatever order the keys stand", () => {
    expect(writes("thing", "t1", null, null)).toEqual([]);
    expect(writes("thing", "t1", { a: 1, b: { c: 2, d: 3 } }, { b: { d: 3, c: 2 }, a: 1 })).toEqual(
      [],
    );
  });
});
