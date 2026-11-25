import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const cli = fileURLToPath(new URL("cli.ts", import.meta.url));

it.each([
  ["clean", 0, "18 modules"],
  ["deep-import", 1, "only-index-is-public: src/contexts/life/application/events.ts"],
  ["empty", 1, "no modules scanned"],
])("turns the result for %s into exit code %i", (fixture, code, output) => {
  const run = spawnSync(process.execPath, [cli, fixture], { encoding: "utf8" });
  expect(run.stdout + run.stderr).toContain(output);
  expect(run.status).toBe(code);
});
