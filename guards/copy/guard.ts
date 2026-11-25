import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { type Module, parse } from "./ast.ts";
import type { Locale } from "./banned.ts";
import { type Catalog, compare, parametersOf, readCatalog } from "./catalog.ts";
import { checkCode, type Finding, usesOf } from "./code.ts";
import { checkMarkup, checkStyles } from "./markup.ts";
import { Origins } from "./origins.ts";

export type Report = { files: number; texts: number; violations: Finding[] };
/** Path to source. */
export type Tree = Map<string, string>;

export const repository = fileURLToPath(new URL("../..", import.meta.url));
const fixtures = fileURLToPath(new URL("fixtures", import.meta.url));
const catalogFiles: [Locale, string][] = [
  ["ru", "web/i18n/ru.ts"],
  ["en", "web/i18n/en.ts"],
];

/** Checks a fixture by name. A bad one is the clean one with its files put over it. */
export function runCopyGuard(name: string): Finding[] {
  return check(fixture(name)).violations;
}

export function fixture(name: string): Tree {
  const bad = join(fixtures, "bad", name);
  return existsSync(bad)
    ? new Map([...readTree(join(fixtures, "clean")), ...readTree(bad)])
    : readTree(join(fixtures, name));
}

export function readTree(root: string): Tree {
  const files = ["src", "web"].flatMap((folder) =>
    existsSync(join(root, folder))
      ? readdirSync(join(root, folder), { recursive: true, withFileTypes: true })
          .filter((entry) => !entry.isDirectory())
          .map((entry) => relative(root, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
      : [],
  );
  return new Map(files.sort().map((file) => [file, readFileSync(join(root, file), "utf8")]));
}

export function check(tree: Tree): Report {
  const modules = new Map<string, Module>();
  for (const [file, source] of tree) if (isCode(file)) modules.set(file, parse(file, source));
  if (modules.size === 0) throw new Error("no files parsed");

  const catalogs = catalogFiles.map(([locale, file]) => {
    const module = modules.get(file);
    if (!module) throw new Error(`no catalog ${file}`);
    modules.delete(file);
    return readCatalog(locale, module);
  });
  const texts = catalogs.reduce((sum, { entries }) => sum + entries.size, 0);

  const violations = catalogs.flatMap(({ findings }) => findings);
  const shared = sharedTexts(catalogs);
  for (const [file, source] of tree) {
    if (isCode(file) || !file.startsWith("web/") || isForMachines(file)) continue;
    if (file.endsWith(".css")) violations.push(...checkStyles(file, source));
    else if (/\.(?:html|svg)$/.test(file)) {
      const { findings, scripts } = checkMarkup(file, source, shared);
      violations.push(...findings);
      for (const [i, code] of scripts.entries()) {
        modules.set(`${file}#${i}`, parse(file, code, "script.js"));
      }
    } else violations.push({ rule: "unread-file", file, line: 1, text: "nobody reads its texts" });
  }

  const origins = new Origins(modules);
  const keys = new Set(catalogs.flatMap(({ entries }) => [...entries.keys()]));
  const strings = new Set<string>();
  const patterns: RegExp[] = [];
  for (const module of modules.values()) {
    violations.push(...checkCode(module, origins, keys));
    if (!module.file.startsWith("web/")) continue;
    const uses = usesOf(module, origins);
    for (const text of uses.strings) strings.add(text);
    patterns.push(...uses.patterns);
    for (const call of uses.calls) {
      for (const key of call.keys) {
        const found = { file: module.file, line: call.line, text: key };
        const entry = catalogs.map(({ entries }) => entries.get(key)).find(Boolean);
        if (!entry) violations.push({ rule: "unknown-key", ...found });
        else if (parametersOf(entry).some((name) => call.parameters?.includes(name) === false)) {
          violations.push({ rule: "missing-parameter", ...found });
        }
      }
    }
  }
  const isUsed = (key: string) => strings.has(key) || patterns.some((p) => p.test(key));
  violations.push(...compare(catalogs, isUsed));
  return { files: tree.size, texts, violations };
}

/** Texts that are the same in every language. */
function sharedTexts(catalogs: Catalog[]): Set<string> {
  const [first, ...others] = catalogs;
  const shared = new Set<string>();
  for (const [key, { forms }] of first?.entries ?? []) {
    const text = forms.get("");
    if (text && others.every(({ entries }) => entries.get(key)?.forms.get("") === text)) {
      shared.add(text);
    }
  }
  return shared;
}

function isCode(file: string): boolean {
  return /\.[cm]?[jt]sx?$/.test(file);
}

function isForMachines(file: string): boolean {
  return /\.(?:woff2|png|jpe?g|webp|avif|ico)$|\/(?:robots\.txt|_headers|_redirects)$/.test(file);
}
