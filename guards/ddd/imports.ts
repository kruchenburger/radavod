import { isNode, type Node, specifierOf, walk } from "./ast.ts";
import type { Violation } from "./guard.ts";

/**
 * Imports that dependency-cruiser did not see, so no rule judged them: import("…") in a type,
 * import.meta.glob, a path computed at run time.
 */
export function checkImports(file: string, ast: Node, seen: Set<string>): Violation[] {
  const violations: Violation[] = [];
  for (const node of walk(ast)) {
    for (const specifier of specifiers(node)) {
      const path = specifier?.type === "StringLiteral" ? String(specifier.value) : undefined;
      // dependency-cruiser names node:fs as fs.
      if (path === undefined || !seen.has(path.replace("node:", ""))) {
        violations.push({
          rule: "every-import-is-seen",
          from: file,
          to: path ?? "a computed path",
        });
      }
    }
  }
  return violations;
}

/** What the node imports; undefined stands for a path that is not a plain string. */
function specifiers(node: Node): (Node | undefined)[] {
  const declared = specifierOf(node);
  if (declared) return [declared];
  if (node.type === "TsImportType") return [asNode(node.argument)];
  if (node.type === "TsExternalModuleReference") return [asNode(node.expression)];
  if (node.type !== "CallExpression" || !isNode(node.callee)) return [];

  const { callee } = node;
  if (callee.type === "Import" || (callee.type === "Identifier" && callee.value === "require")) {
    return [asNode((node.arguments as { expression: unknown }[])[0]?.expression)];
  }
  const isGlob =
    callee.type === "MemberExpression" &&
    isNode(callee.object) &&
    callee.object.type === "MetaProperty" &&
    isNode(callee.property) &&
    String(callee.property.value).startsWith("glob");
  return isGlob ? [undefined] : [];
}

function asNode(value: unknown): Node | undefined {
  return isNode(value) ? value : undefined;
}
