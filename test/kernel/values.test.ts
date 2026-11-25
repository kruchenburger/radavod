import { describe, expect, expectTypeOf, it } from "vitest";
import { type Certainty, needsCitation } from "../../src/kernel/certainty";
import type { ParsedDate } from "../../src/kernel/fuzzy-date";
import type { BranchId, FactRef, PersonId, UnionId } from "../../src/kernel/id";
import type { NameForm } from "../../src/kernel/name-form";
import type { Result } from "../../src/kernel/result";
import type { Certainty as TreeCertainty, TreeNameForm, TreeYear } from "../../src/shared/tree";

describe("a certainty", () => {
  it.each<[Certainty, boolean]>([
    ["hypothesis", false],
    ["one-source", true],
    ["confirmed", true],
    ["contradiction", false],
    ["unresolved", false],
  ])("%s needs a citation: %s", (certainty, needs) => {
    expect(needsCitation(certainty)).toBe(needs);
  });
});

// The compiler checks the types below (`pnpm typecheck`).

it("speaks the words of the snapshot", () => {
  expectTypeOf<Certainty>().toEqualTypeOf<TreeCertainty>();
  expectTypeOf<NameForm["language"]>().toEqualTypeOf<TreeNameForm["language"]>();
  expectTypeOf<NameForm["script"]>().toEqualTypeOf<TreeNameForm["script"]>();
  expectTypeOf<NameForm["kind"]>().toEqualTypeOf<TreeNameForm["kind"]>();
  expectTypeOf<ParsedDate["qualifier"] | "unread">().toEqualTypeOf<TreeYear["qualifier"]>();
});

it("tells identifiers apart", () => {
  expectTypeOf<PersonId>().toExtend<string>();
  expectTypeOf<PersonId>().not.toExtend<UnionId>();
  expectTypeOf<string>().not.toExtend<PersonId>();
  expectTypeOf<BranchId>().not.toExtend<FactRef["subject"]>();
});

it("makes a caller look whether there is a value", () => {
  type Half = Result<number, { code: "odd"; n: number }>;
  const half = (n: number): Half =>
    n % 2 === 0 ? { ok: true, value: n / 2 } : { ok: false, error: { code: "odd", n } };
  const result = half(3);
  expect(result.ok ? result.value : result.error).toEqual({ code: "odd", n: 3 });
  expectTypeOf<Half>().not.toHaveProperty("value");
});
