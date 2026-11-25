import { parseSync } from "@swc/core";

export type Node = { type: string; [key: string]: unknown };

export function parse(file: string, source: string): Node {
  try {
    return parseSync(source, {
      syntax: "typescript",
      tsx: file.endsWith("x"),
      decorators: true,
    }) as unknown as Node;
  } catch (cause) {
    throw new Error(`cannot parse ${file}`, { cause });
  }
}

/** The node and everything below it. */
export function* walk(value: unknown): Generator<Node> {
  if (Array.isArray(value)) {
    for (const child of value) yield* walk(child);
  } else if (typeof value === "object" && value !== null) {
    if (isNode(value)) yield value;
    yield* walk(Object.values(value));
  }
}

export function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && "type" in value;
}

/** The module specifier of an import or export declaration. */
export function specifierOf(node: Node): Node | undefined {
  return /^(?:Import|Export)\w*Declaration$/.test(node.type) && isNode(node.source)
    ? node.source
    : undefined;
}
