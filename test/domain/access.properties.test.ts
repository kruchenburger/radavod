import fc from "fast-check";
import { describe, it } from "vitest";
import { accessOver } from "../../src/contexts/access";
import { someStep, walk } from "./access-steps";
import { MemoryAccess } from "./memory-access";

describe("after any operations on members", () => {
  it("a family once set up has a keeper who can sign in", () =>
    fc.assert(
      fc.property(fc.array(someStep, { minLength: 1, maxLength: 60 }), (steps) =>
        walk(accessOver(new MemoryAccess()), steps),
      ),
      { numRuns: 300 },
    ));
});
