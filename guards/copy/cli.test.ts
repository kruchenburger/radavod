import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const cli = fileURLToPath(new URL("cli.ts", import.meta.url));

it.each([
  ["clean", 0, "14 texts"],
  ["jsx-literal", 1, "jsx-text: web/extra.tsx:1 Save"],
  ["empty", 1, "no files parsed"],
])("turns the result for %s into exit code %i", (fixture, code, output) => {
  const run = spawnSync(process.execPath, [cli, fixture], { encoding: "utf8" });
  expect(run.stdout + run.stderr).toContain(output);
  expect(run.status).toBe(code);
});
