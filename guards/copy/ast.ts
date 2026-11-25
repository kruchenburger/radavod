import { parseSync } from "oxc-parser";

export type Node = { type: string; start: number; [key: string]: unknown };
export type Module = { file: string; source: string; program: Node };

export function parse(file: string, source: string, name = file): Module {
  const { program, errors } = parseSync(name, source);
  // oxc recovers from errors: what it could not read is missing from the tree.
  if (errors.length > 0) throw new Error(`cannot parse ${file}: ${errors[0]?.message}`);
  return { file, source, program: program as unknown as Node };
}

export function isNode(value: unknown): value is Node {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

export function nodes(value: unknown): Node[] {
  return (Array.isArray(value) ? value : [value]).filter(isNode);
}

/** Visits the node and everything below it, unless visit answers false. */
export function walk(node: Node, visit: (node: Node) => unknown): void {
  if (visit(node) === false) return;
  for (const child of Object.values(node).flatMap(nodes)) walk(child, visit);
}

export function isFunction(node: Node): boolean {
  return /Function(?:Expression|Declaration)$/.test(node.type);
}

/** The name of an identifier, of a property or of a dotted path's last part. */
export function nameOf(value: unknown): string | undefined {
  if (!isNode(value)) return undefined;
  const node = bare(value);
  if (node.type === "Identifier" || node.type === "JSXIdentifier") return String(node.name);
  if (node.type === "Literal") return String(node.value);
  if (node.type === "MemberExpression") {
    const { property } = node;
    const named = node.computed !== true || (isNode(property) && property.type === "Literal");
    return named ? nameOf(property) : undefined;
  }
  return undefined;
}

/** The expression without the wrappers that do not change its value. */
export function bare(node: Node): Node {
  const wrapper =
    /^(?:TSAs|TSSatisfies|TSNonNull|Parenthesized|Chain|Await)Expression$|^TSTypeAssertion$/;
  const inner = node.type === "AwaitExpression" ? node.argument : node.expression;
  return wrapper.test(node.type) && isNode(inner) ? bare(inner) : node;
}
