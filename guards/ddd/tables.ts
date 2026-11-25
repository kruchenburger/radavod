import { type Node, specifierOf, walk } from "./ast.ts";
import contexts from "./contexts.json" with { type: "json" };
import type { Violation } from "./guard.ts";

const prefixed = new RegExp(`\\b(${Object.keys(contexts).join("|")})_\\w*`, "gi");
const creates =
  /\b(?:create\s+(?:(?:temp|temporary|virtual)\s+)?(?:table|view)\s+(?:if\s+not\s+exists\s+)?|rename\s+to\s+)["'`[]?([^\s"'`\](]*)/gi;

/**
 * A table is named after the context that owns it, as in kinship_person. Comments are ignored;
 * every other text is checked, so a table name cannot hide in a constant.
 */
export function checkTables(file: string, ast: Node): Violation[] {
  const owner = /^src\/contexts\/([^/]+)\//.exec(file)?.[1];
  const violations: Violation[] = [];
  for (const text of texts(ast)) {
    for (const [name, context] of text.matchAll(prefixed)) {
      if (context?.toLowerCase() !== owner) {
        violations.push({ rule: "foreign-table", from: file, to: name });
      }
    }
    for (const [, name = ""] of text.matchAll(creates)) {
      if (!owner || !name.toLowerCase().startsWith(`${owner}_`)) {
        violations.push({ rule: "table-without-owner", from: file, to: name });
      }
    }
  }
  return violations;
}

function* texts(ast: Node): Generator<string> {
  // A module specifier is a path, not a table.
  const specifiers = new Set<Node>();
  for (const node of walk(ast)) {
    const specifier = specifierOf(node);
    if (specifier) specifiers.add(specifier);
    if (node.type === "StringLiteral" && !specifiers.has(node)) yield String(node.value);
    if (node.type === "TemplateLiteral") {
      // An interpolated value is unknown, and no table name may be.
      yield (node.quasis as { cooked?: string; raw: string }[])
        .map(({ cooked, raw }) => cooked ?? raw)
        .join("?");
    }
  }
}
