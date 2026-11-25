import { expect, it } from "vitest";
import { exceptions } from "./exceptions.ts";
import { check, type Exception, type Package, parseList } from "./guard.ts";

const pkg = (license: string, name = "lib"): Package => ({ name, version: "1.0.0", license });
const mit = pkg("MIT", "ok");
const helper = pkg("MIT", "helper");
const tool: Exception = { name: "tool", licences: ["MPL-2.0"], reason: "runs in CI only" };

const shipped = (license: string, name?: string) =>
  check([mit, pkg(license, name)], [mit, helper, pkg(license, name)], []);
const dev = (license: string, list: Exception[], name?: string) =>
  check([mit], [mit, helper, pkg(license, name)], list);

it.each([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "0BSD",
  "CC0-1.0",
  "MIT OR GPL-3.0-only",
  "(MIT OR CC0-1.0)",
  "Apache-2.0 AND MIT",
  "(MPL-2.0 OR MIT) AND ISC",
])("lets %s ship", (license) => {
  expect(shipped(license)).toEqual([]);
});

it.each([
  "GPL-3.0-only",
  "LGPL-3.0-or-later",
  "AGPL-3.0-only",
  "MPL-2.0",
  "EPL-2.0",
  "EPL-2.0 OR GPL-3.0-or-later",
  "Apache-2.0 AND LGPL-3.0-or-later",
  "Apache-2.0 WITH LLVM-exception",
  "CC-BY-4.0",
  "BlueOak-1.0.0",
  "MITX",
  "Unknown",
  "UNLICENSED",
  "SEE LICENSE IN LICENSE",
  "MIT OR",
  "(MIT",
  "MIT)",
  "MIT ISC",
  "OR",
  "",
])("does not let %j ship", (license) => {
  expect(shipped(license)).toEqual([`shipped: lib@1.0.0 is under "${license}"`]);
});

it("lets OFL-1.1 ship in fonts and nothing else", () => {
  expect(shipped("OFL-1.1", "@fontsource/alegreya-sans")).toEqual([]);
  expect(shipped("OFL-1.1", "@fontsource-variable/alegreya")).toEqual([]);
  expect(shipped("OFL-1.1", "@fontsource-utils/cli")).toHaveLength(1);
  expect(shipped("OFL-1.1", "lib")).toHaveLength(1);
  expect(shipped("GPL-3.0-only", "@fontsource/alegreya-sans")).toHaveLength(1);
});

it("gives no exception to what ships", () => {
  const lib = pkg("MPL-2.0", "tool");
  expect(check([mit, lib], [mit, helper, lib], [tool])).toContain(
    'shipped: tool@1.0.0 is under "MPL-2.0"',
  );
});

it("needs an exception for a development tool under another licence", () => {
  expect(dev("MPL-2.0", [], "tool")).toEqual(['development: tool@1.0.0 is under "MPL-2.0"']);
  expect(dev("MPL-2.0", [tool], "tool")).toEqual([]);
  expect(dev("MPL-2.0 AND MIT", [tool], "tool")).toEqual([]);
});

it("allows a tool the licence it is listed with and no other", () => {
  expect(dev("GPL-3.0-only", [tool], "tool")).toContain(
    'development: tool@1.0.0 is under "GPL-3.0-only"',
  );
  expect(dev("MPL-2.0", [tool], "tool-kit")).toContain(
    'development: tool-kit@1.0.0 is under "MPL-2.0"',
  );
});

it("follows a star in the name of an exception", () => {
  const family = { ...tool, name: "tool-*" };
  expect(dev("MPL-2.0", [family], "tool-linux-x64")).toEqual([]);
  expect(dev("MPL-2.0", [family], "other-tool-x")).toContain(
    'development: other-tool-x@1.0.0 is under "MPL-2.0"',
  );
});

it("reports an exception nobody needs", () => {
  expect(dev("MIT", [tool], "tool")).toEqual(["exception: nothing needs tool"]);
});

it("refuses an exception without a reason", () => {
  expect(() => dev("MPL-2.0", [{ ...tool, reason: " " }], "tool")).toThrow("tool");
});

it("fails when nothing was scanned", () => {
  expect(() => check([], [mit], [])).toThrow("no packages scanned");
  expect(() => check([mit], [mit], [])).toThrow("no packages scanned");
});

it("reads the list of pnpm", () => {
  const list = {
    MIT: [{ name: "a", versions: ["1.0.0", "2.0.0"], license: "MIT" }],
    Unknown: [{ name: "b", versions: ["1.0.0"], license: "Unknown" }],
  };
  expect(parseList(JSON.stringify(list))).toEqual([
    { name: "a", version: "1.0.0", license: "MIT" },
    { name: "a", version: "2.0.0", license: "MIT" },
    { name: "b", version: "1.0.0", license: "Unknown" },
  ]);
  expect(() => parseList("No licenses in packages found")).toThrow();
  expect(() => parseList('{"MIT":[{"name":"a"}]}')).toThrow();
});

it("lists exceptions of this repository with a reason each", () => {
  expect(exceptions.length).toBeGreaterThan(0);
  for (const { name, reason } of exceptions) expect(reason.length, name).toBeGreaterThan(20);
});
