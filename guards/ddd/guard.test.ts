import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { check, runGuard } from "./guard.ts";

const bad: [fixture: string, rule: string][] = [
  ["deep-import", "only-index-is-public"],
  ["deep-import-type", "only-index-is-public"],
  ["deep-import-inline-type", "every-import-is-seen"],
  ["deep-import-require", "only-index-is-public"],
  ["deep-import-computed", "every-import-is-seen"],
  ["deep-import-glob", "every-import-is-seen"],
  ["deep-import-dynamic", "only-index-is-public"],
  ["deep-import-reexport", "only-index-is-public"],
  ["deep-import-scenario", "only-index-is-public"],
  ["deep-import-tsx", "only-index-is-public"],
  ["domain-imports-adapter", "domain-is-pure"],
  ["domain-imports-application", "domain-is-pure"],
  ["domain-imports-npm", "domain-is-pure"],
  ["domain-imports-node", "domain-is-pure"],
  ["domain-imports-context", "domain-is-pure"],
  ["application-imports-adapter", "application-knows-no-adapters"],
  ["kinship-imports-life", "context-direction"],
  ["life-imports-evidence", "context-direction"],
  ["exchange-imports-access", "context-direction"],
  ["context-imports-scenario", "inner-knows-no-outer"],
  ["context-imports-worker", "inner-knows-no-outer"],
  ["scenario-imports-worker", "inner-knows-no-outer"],
  ["shared-imports-worker", "inner-knows-no-outer"],
  ["kernel-imports-npm", "kernel-is-a-leaf"],
  ["kernel-imports-context", "kernel-is-a-leaf"],
  ["web-imports-adapters", "web-reaches-no-adapters"],
  ["web-reaches-adapters", "web-reaches-no-adapters"],
  ["web-imports-worker", "web-knows-no-server"],
  ["server-imports-web", "server-knows-no-web"],
  ["unresolved-import", "every-import-resolves"],
  ["outside-module", "stays-in-src-and-web"],
  ["outside-sql", "stays-in-src-and-web"],
  ["outside-web", "stays-in-src-and-web"],
  ["shared-imports-context", "inner-knows-no-outer"],
  ["own-index", "index-is-for-outsiders"],
  ["deep-import-url", "every-import-is-seen"],
  ["deep-import-glob-cast", "every-import-is-seen"],
  ["no-home", "every-module-has-a-home"],
  ["no-home-context", "every-module-has-a-home"],
  ["no-home-folder", "every-module-has-a-home"],
  ["sql-file", "src-holds-modules-only"],
  ["foreign-table", "foreign-table"],
  ["foreign-table-case", "foreign-table"],
  ["foreign-table-constant", "foreign-table"],
  ["foreign-table-built", "foreign-table"],
  ["foreign-table-scenario", "foreign-table"],
  ["unprefixed-table", "table-without-owner"],
  ["unprefixed-table-renamed", "table-without-owner"],
  ["unprefixed-table-dynamic", "table-without-owner"],
  ["ownerless-table", "table-without-owner"],
];

it.each(bad)("rejects %s", async (fixture, rule) => {
  const { violations } = await runGuard(fixture);
  expect(violations.map((v) => v.rule)).toContain(rule);
});

it("accepts the clean fixture", async () => {
  const { modules, violations } = await runGuard("clean");
  expect(violations).toEqual([]);
  expect(modules).toBe(19);
});

it.each(["empty", "no-such-fixture"])("fails when nothing was scanned: %s", async (fixture) => {
  await expect(runGuard(fixture)).rejects.toThrow("no modules scanned");
});

it("fails when a module cannot be parsed", async () => {
  await expect(runGuard("broken-syntax")).rejects.toThrow("src/worker/index.ts");
});

it.each(["extra.mts", "extra.cts", "extra.js", "extra.mjs", "extra.cjs", "extra.jsx"])(
  "never ignores a module with another extension: %s",
  async (file) => {
    const root = temporaryTree();
    cpSync(fileURLToPath(new URL("fixtures/clean", import.meta.url)), root, { recursive: true });
    writeFileSync(join(root, "src/contexts/life/domain", file), 'import "node:fs";\n');
    const found = await check(root).then(
      ({ violations }) => violations.map((v) => v.rule),
      (error: Error) => error.message,
    );
    expect(String(found)).toMatch(/domain-is-pure|not scanned/);
  },
);

it("allows exactly the context dependencies of the design", async () => {
  const contexts = ["kinship", "life", "places", "evidence", "access", "history", "exchange"];
  const allowed = new Set([
    "life -> kinship",
    "life -> places",
    "exchange -> kinship",
    "exchange -> life",
    "exchange -> places",
    "exchange -> evidence",
    "exchange -> history",
  ]);
  const root = temporaryTree();
  for (const from of contexts) {
    mkdirSync(join(root, "src/contexts", from, "application"), { recursive: true });
    writeFileSync(join(root, "src/contexts", from, "index.ts"), "export {};\n");
    for (const to of contexts.filter((name) => name !== from)) {
      const file = join(root, "src/contexts", from, `application/${to}.ts`);
      writeFileSync(file, `import * as other from "../../${to}";\n\nexport default other;\n`);
    }
  }

  const { violations } = await check(root);
  const rejected = new Set(
    violations
      .filter((v) => v.rule === "context-direction")
      .map((v) => `${v.from.split("/")[2]} -> ${v.to.split("/")[2]}`),
  );
  const pairs = contexts.flatMap((a) => contexts.filter((b) => b !== a).map((b) => `${a} -> ${b}`));
  expect(pairs.filter((pair) => !rejected.has(pair)).sort()).toEqual([...allowed].sort());
});

it("scans the real tree", async () => {
  const { modules, edges, violations } = await runGuard("src");
  expect(modules).toBeGreaterThan(9);
  expect(edges).toBeGreaterThan(5);
  expect(violations).toEqual([]);
});

const trees: string[] = [];

afterEach(() => {
  for (const tree of trees.splice(0)) rmSync(tree, { recursive: true });
});

function temporaryTree(): string {
  const root = mkdtempSync(join(tmpdir(), "guard-"));
  trees.push(root);
  return root;
}
