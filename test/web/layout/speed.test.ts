import { expect, it, vi } from "vitest";
import { around } from "../../../web/tree/layout/around";
import { branchPages } from "../../../web/tree/layout/branch-pages";
import { bigSnapshot, busiest } from "./big";
import { measure, wordingOf } from "./family";

// Making the family takes longer than laying it out.
vi.setConfig({ testTimeout: 60_000 });

// Generous bounds: a shared machine in CI is slow. `pnpm bench` tells the real times.

it.each([
  [300, 100],
  [2000, 400],
])("lays out the pages of %i people within %i ms", (size, bound) => {
  const snapshot = { ...bigSnapshot(size) };
  const start = performance.now();
  branchPages(snapshot, null);
  expect(performance.now() - start).toBeLessThan(bound);
});

it("lays out the view around a person among 5000 within 200 ms", () => {
  const focus = busiest(5000);
  const snapshot = { ...bigSnapshot(5000) };
  const wording = wordingOf(snapshot);
  const start = performance.now();
  around(snapshot, focus, { measure, wording });
  expect(performance.now() - start).toBeLessThan(200);
});
