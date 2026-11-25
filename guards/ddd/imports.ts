import { isNode, type Node, specifierOf, walk } from "./ast.ts";
import type { Violation } from "./guard.ts";

/**
 * Imports that dependency-cruiser did not see, so no rule judged them: import("…") in a type, a
 * path computed at run time, and what import.meta loads (glob, new URL, resolve). Import a Web
 * Worker as "./layout.worker?worker" instead: that is an import statement.
 */
export function checkImports(file: string, ast: Node, seen: Set<string>): Violation[] {
  const violations: Violation[] = [];
  const harmless = new Set<Node>();
  for (const node of walk(ast)) {
    if (isSettingsOfMeta(node)) harmless.add(node.object);
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
    if (node.type === "MetaProperty" && node.kind === "import.meta" && !harmless.has(node)) {
      violations.push({ rule: "every-import-is-seen", from: file, to: "import.meta" });
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
  const imports =
    callee.type === "Import" || (callee.type === "Identifier" && callee.value === "require");
  return imports ? [asNode((node.arguments as { expression: unknown }[])[0]?.expression)] : [];
}

/** import.meta.env and import.meta.hot, which load nothing. */
function isSettingsOfMeta(node: Node): node is Node & { object: Node } {
  return (
    node.type === "MemberExpression" &&
    isNode(node.object) &&
    isNode(node.property) &&
    ["env", "hot"].includes(String(node.property.value))
  );
}

function asNode(value: unknown): Node | undefined {
  return isNode(value) ? value : undefined;
}
