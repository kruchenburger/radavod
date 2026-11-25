import { expect, it } from "vitest";
import { stubFor } from "../src/worker/stub";
import type { Env } from "../src/worker/env";

/** Records where the object would be created: local workerd has no jurisdictions. */
function fakeNamespace() {
  const at = (where: string) => ({ getByName: (name: string) => `${where}:${name}` });
  return {
    ...at("anywhere"),
    jurisdiction: (j: string) => at(j),
  } as unknown as Env["TREE"];
}

const place = (jurisdiction: string) =>
  stubFor(fakeNamespace(), "kin", { JURISDICTION: jurisdiction as Env["JURISDICTION"] });

it("creates objects in the eu jurisdiction", () => {
  expect(place("eu")).toBe("eu:kin");
});

it("creates objects without a jurisdiction only when told so", () => {
  expect(place("none")).toBe("anywhere:kin");
});

it.each(["", "EU", "us", undefined])("refuses jurisdiction %j", (value) => {
  expect(() => place(value as string)).toThrow("JURISDICTION");
});
