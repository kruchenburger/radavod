import { bench, describe } from "vitest";
import { around } from "../../../web/tree/layout/around";
import { aroundNarrow } from "../../../web/tree/layout/around-narrow";
import { branchMap } from "../../../web/tree/layout/branch-map";
import { bigSnapshot, busiest } from "./big";
import { measure, wordingOf } from "./family";

describe.each([300, 5000])("%i people", (size) => {
  const snapshot = bigSnapshot(size);
  const focus = busiest(size);
  const options = { measure, wording: wordingOf(snapshot) };
  // The layout keeps its index of a snapshot, so a new object starts from nothing.
  const fresh = () => ({ ...snapshot });

  bench("the canvas of all branches", () => {
    branchMap(fresh(), { measure, headOf: ({ title }) => title.ru });
  });
  bench("around the person with the most kin, a new snapshot", () => {
    around(fresh(), focus, options);
  });
  bench("around, another centre of the same snapshot", () => {
    around(snapshot, focus, options);
  });
  bench("around, on a phone", () => {
    aroundNarrow(snapshot, focus, { ...options, width: 328 });
  });
});
