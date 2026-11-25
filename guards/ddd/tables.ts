import { type Node, specifierOf, walk } from "./ast.ts";
import contexts from "./contexts.json" with { type: "json" };
import type { Violation } from "./guard.ts";

const prefixed = new RegExp(`\\b(${Object.keys(contexts).join("|")})_\\w*`, "gi");
const sql = /\b(?:from|join|into|update|table|index|view|trigger)\b/i;
const creates =
  /\b(?:create\s+(?:(?:temp|temporary|virtual)\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?|alter\s+table\s+\S+\s+rename\s+to\s+)["'`[]?([^\s"'`\](]*)/gi;

/** The tables and views the module creates, in lower case. */
export function createdTables(ast: Node): string[] {
  return [...texts(ast)].flatMap((text) =>
    [...text.matchAll(creates)].map(([, name = ""]) => name.toLowerCase()),
  );
}

/**
 * A table is named after the context that owns it, as in kinship_person, and no other code names
 * it. SQL may not use a foreign prefix at all; outside SQL, where access_denied is an ordinary
 * word, only the name of an existing foreign table is refused.
 */
export function checkTables(file: string, ast: Node, tables: Set<string>): Violation[] {
  const owner = /^src\/contexts\/([^/]+)\//.exec(file)?.[1];
  const violations: Violation[] = [];
  for (const text of texts(ast)) {
    const isSql = sql.test(text);
    for (const [name, context] of text.matchAll(prefixed)) {
      if (context?.toLowerCase() !== owner && (isSql || tables.has(name.toLowerCase()))) {
        violations.push({ rule: "foreign-table", from: file, to: name });
      }
    }
  }
  for (const name of createdTables(ast)) {
    if (!owner || !name.startsWith(`${owner}_`)) {
      violations.push({ rule: "table-without-owner", from: file, to: name });
    }
  }
  return violations;
}

/** Every string in the module except comments and module specifiers. */
function* texts(ast: Node): Generator<string> {
  const specifiers = new Set<Node>();
  for (const node of walk(ast)) {
    const specifier = specifierOf(node);
    if (specifier) specifiers.add(specifier);
    if (node.type === "StringLiteral" && !specifiers.has(node)) yield String(node.value);
    if (node.type === "TemplateLiteral") {
      // An interpolated value is unknown, so a table created from one has no valid name.
      yield (node.quasis as { cooked?: string; raw: string }[])
        .map(({ cooked, raw }) => cooked ?? raw)
        .join("?");
    }
  }
}
