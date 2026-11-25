import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { cruise, type ICruiseResult } from "dependency-cruiser";
import { parse } from "./ast.ts";
import contexts from "./contexts.json" with { type: "json" };
import { checkImports } from "./imports.ts";
import { checkTables, createdTables } from "./tables.ts";

export type Violation = { rule: string; from: string; to: string };
export type Report = { modules: number; edges: number; violations: Violation[] };

const { forbidden, options } = createRequire(import.meta.url)("../../.dependency-cruiser.cjs");
const { enhancedResolveOptions, ...cruiseOptions } = options;

const repository = fileURLToPath(new URL("../..", import.meta.url));
const context = `contexts/(?:${Object.keys(contexts).join("|")})/(?:index\\.ts$|domain/|application/|adapters/)`;
const homes = new RegExp(`^(?:web/|src/(?:kernel/|scenarios/|shared/|worker/|${context}))`);

/** Checks a fixture by name, or the repository itself for "src". */
export function runGuard(name: string): Promise<Report> {
  const fixture = new URL(`fixtures/${name}`, import.meta.url);
  return check(name === "src" ? repository : fileURLToPath(fixture));
}

export async function check(root: string): Promise<Report> {
  const src = filesIn(root, "src");
  const files = [...src, ...filesIn(root, "web")].filter(isModule);
  if (files.length === 0) throw new Error("no modules scanned");
  const asts = new Map(
    files.map((file) => [file, parse(file, readFileSync(join(root, file), "utf8"))]),
  );

  const result = await cruise(
    files,
    { ...cruiseOptions, baseDir: root, validate: true, ruleSet: { forbidden } },
    enhancedResolveOptions,
  );
  const { modules, summary } = result.output as ICruiseResult;

  // A tool that cannot read a file skips it without a word. That must not look like a pass.
  const scanned = new Map(modules.map((module) => [module.source, module.dependencies]));
  const missed = files.filter((file) => !scanned.has(file));
  if (missed.length > 0) throw new Error(`not scanned: ${missed.join(", ")}`);

  const violations = summary.violations.map(({ rule, from, to }) => ({
    rule: rule.name,
    from,
    to,
  }));
  const tables = new Set([...asts.values()].flatMap(createdTables));
  let edges = 0;
  for (const [file, ast] of asts) {
    const dependencies = scanned.get(file) ?? [];
    edges += dependencies.length;
    violations.push(...checkImports(file, ast, new Set(dependencies.map(({ module }) => module))));
    if (file.startsWith("src/")) violations.push(...checkTables(file, ast, tables));
    if (!homes.test(file)) violations.push({ rule: "every-module-has-a-home", from: file, to: "" });
  }
  // SQL in a file of its own would escape the table check.
  for (const file of src.filter((file) => !isModule(file))) {
    violations.push({ rule: "src-holds-modules-only", from: file, to: "" });
  }
  return { modules: files.length, edges, violations };
}

function isModule(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file);
}

function filesIn(root: string, folder: string): string[] {
  if (!existsSync(join(root, folder))) return [];
  return readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
}
