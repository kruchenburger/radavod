import { describe, expect, it } from "vitest";
import { isErasedMark } from "../../src/kernel/id";

describe("a mark of somebody erased", () => {
  it("is the mark of a person, of a link named by them, or one in words", () => {
    for (const text of ["erased", "erased-abc", "erased-abc-2", "[erased]-2", "Со слов [erased]"]) {
      expect(isErasedMark(text)).toBe(true);
    }
  });

  it("is not an ordinary text or identifier", () => {
    for (const text of ["unknown", "unknown-2", "person_2g2j2g1111111111111111", "erasedly", ""]) {
      expect(isErasedMark(text)).toBe(false);
    }
  });
});
