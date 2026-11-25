import { bare, type Module, nameOf, type Node, nodes, walk } from "./ast.ts";
import { checkText, type Locale } from "./banned.ts";
import type { Finding } from "./code.ts";

type Entry = { forms: Map<string, string>; isPlural: boolean; line: number };
export type Catalog = {
  locale: Locale;
  file: string;
  entries: Map<string, Entry>;
  findings: Finding[];
};

/** Reads the catalog without running it: every text must be written out. */
export function readCatalog(locale: Locale, module: Module): Catalog {
  const { file, source } = module;
  const object = exported(module, locale);
  if (!object) throw new Error(`no catalog in ${file}`);
  const catalog: Catalog = { locale, file, entries: new Map(), findings: [] };
  if (nodes(object.properties).length === 0) throw new Error(`empty catalog ${file}`);

  for (const property of nodes(object.properties)) {
    const line = source.slice(0, property.start).split("\n").length;
    const key = property.computed === true ? undefined : nameOf(property.key);
    const forms = property.type === "Property" ? formsOf(property.value) : undefined;
    const report = (rule: string, text: string) =>
      catalog.findings.push({ rule, file, line, text });

    if (key === undefined || forms === undefined) {
      report("unreadable-text", key ?? property.type);
      if (key === undefined) continue;
    } else if (catalog.entries.has(key)) report("duplicate-key", key);
    const entry = { forms: forms ?? new Map(), isPlural: !forms?.has(""), line };
    catalog.entries.set(key, entry);
    if (!forms) continue;

    for (const text of forms.values()) {
      if (text.trim() === "") report("empty-text", key);
      for (const rule of checkText(locale, text)) report(rule, `${key}: ${text}`);
    }
    checkPlural(locale, entry, (rule, text) => report(rule, `${key}: ${text}`));
  }
  return catalog;
}

/** Keys and parameters must match between the two languages and the code. */
export function compare(catalogs: Catalog[], isUsed: (key: string) => boolean): Finding[] {
  const findings: Finding[] = [];
  for (const { locale, file, entries } of catalogs) {
    for (const [key, entry] of entries) {
      const report = (rule: string, text = key) =>
        findings.push({ rule, file, line: entry.line, text });
      const missing = catalogs.filter((other) => !other.entries.has(key));
      if (missing.length > 0) {
        if (!isUsed(key)) report(`extra-${locale}-key`);
        else for (const other of missing) report(`missing-${other.locale}-key`);
      } else if (!isUsed(key)) report("unused-key");
      for (const other of catalogs) {
        const match = other.entries.get(key);
        const readable = match && match.forms.size > 0 && entry.forms.size > 0;
        if (readable && String(parametersOf(match)) !== String(parametersOf(entry))) {
          report("other-parameters", `${key}: ${parametersOf(entry).join(", ")}`);
        }
      }
    }
  }
  return findings;
}

export function parametersOf({ forms }: Entry): string[] {
  const names = [...forms.values()].flatMap((text) =>
    [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name ?? ""),
  );
  return [...new Set(names)].sort();
}

function checkPlural(locale: Locale, entry: Entry, report: (rule: string, text: string) => void) {
  const needed = new Intl.PluralRules(locale).resolvedOptions().pluralCategories as string[];
  if (!entry.isPlural) {
    if (parametersOf(entry).includes("count")) report("missing-plural-form", needed.join(", "));
    return;
  }
  for (const form of needed) if (!entry.forms.has(form)) report("missing-plural-form", form);
  for (const form of entry.forms.keys()) {
    if (!needed.includes(form)) report("extra-plural-form", form);
  }
}

/** The object of `export const <locale> = { … }`. */
function exported(module: Module, locale: Locale): Node | undefined {
  let found: Node | undefined;
  walk(module.program, (node) => {
    if (node.type !== "VariableDeclarator" || nameOf(node.id) !== locale) return true;
    for (const init of nodes(node.init).map(bare))
      if (init.type === "ObjectExpression") found = init;
    return true;
  });
  return found;
}

/** A text has one form, named "". */
function formsOf(value: unknown): Map<string, string> | undefined {
  const [node] = nodes(value).map(bare);
  const text = node && textOf(node);
  if (text !== undefined) return new Map([["", text]]);
  if (node?.type !== "ObjectExpression") return undefined;
  const forms = new Map<string, string>();
  for (const property of nodes(node.properties)) {
    const name = property.computed === true ? undefined : nameOf(property.key);
    const [form] = nodes(property.value).map(bare);
    const formText = form && textOf(form);
    if (!name || formText === undefined) return undefined;
    forms.set(name, formText);
  }
  return forms.size > 0 ? forms : undefined;
}

function textOf(node: Node): string | undefined {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type !== "TemplateLiteral" || nodes(node.expressions).length > 0) return undefined;
  return (nodes(node.quasis)[0]?.value as { cooked: string } | undefined)?.cooked;
}
