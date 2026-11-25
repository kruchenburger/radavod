import { posix } from "node:path";
import { bare, isNode, type Module, nameOf, type Node, nodes, walk } from "./ast.ts";

/** Where an expression comes from: the module it stands in matters for its names. */
export type Origin = { node: Node; module: Module };

type Names = Map<string, Origin[]>;

/**
 * Follows an expression to the literals it can be: through conditions, concatenation, constants,
 * maps, functions and relative imports. Scopes are not told apart: one name in a file is one thing.
 */
export class Origins {
  readonly #modules: Map<string, Module>;
  readonly #names = new Map<Module, Names>();

  constructor(modules: Map<string, Module>) {
    this.#modules = modules;
  }

  of(node: Node, module: Module, seen = new Set<Node>()): Origin[] {
    const expression = bare(node);
    if (seen.has(expression)) return [];
    seen = new Set(seen).add(expression);
    const follow = (value: unknown) => nodes(value).flatMap((next) => this.of(next, module, seen));

    switch (expression.type) {
      case "ConditionalExpression":
        return follow([expression.consequent, expression.alternate]);
      case "LogicalExpression":
        return follow(
          expression.operator === "&&" ? expression.right : [expression.left, expression.right],
        );
      case "BinaryExpression":
        return expression.operator === "+" ? follow([expression.left, expression.right]) : [];
      case "AssignmentExpression":
        return follow(expression.right);
      case "SequenceExpression":
        return follow(nodes(expression.expressions).slice(-1));
      case "TemplateLiteral":
        return [{ node: expression, module }, ...follow(expression.expressions)];
      case "TaggedTemplateExpression":
        return follow(expression.quasi);
      case "ArrayExpression":
        return follow(
          nodes(expression.elements).map((e) => (e.type === "SpreadElement" ? e.argument : e)),
        );
      case "Identifier":
        return this.named(String(expression.name), module).flatMap((o) =>
          this.of(o.node, o.module, seen),
        );
      case "MemberExpression":
        return this.#property(expression, module, seen);
      case "CallExpression":
        return this.#call(expression, module, seen);
      default:
        return [{ node: expression, module }];
    }
  }

  /** What a name of the module stands for. */
  named(name: string, module: Module): Origin[] {
    let names = this.#names.get(module);
    if (!names) this.#names.set(module, (names = declarations(module)));
    return (names.get(name) ?? []).flatMap((origin) => {
      const { source, imported } = origin.node;
      if (origin.node.type !== "Import" || typeof source !== "string") return [origin];
      const from = this.#resolve(source, module.file);
      return from && from !== module ? this.named(String(imported), from) : [];
    });
  }

  #property(member: Node, module: Module, seen: Set<Node>): Origin[] {
    if (!isNode(member.object)) return [];
    if (member.element === true) return this.of(member.object, module, seen);
    const name = nameOf(member);
    return this.of(member.object, module, seen).flatMap((origin) => {
      if (origin.node.type !== "ObjectExpression") {
        // names[0] of a list is one of its texts; "text".length is not a text.
        return member.computed === true ? [origin] : [];
      }
      return nodes(origin.node.properties)
        .filter((p) => p.type === "Property" && (name === undefined || nameOf(p.key) === name))
        .flatMap((p) => nodes(p.value))
        .flatMap((value) => this.of(value, origin.module, seen));
    });
  }

  #call(call: Node, module: Module, seen: Set<Node>): Origin[] {
    const callee = isNode(call.callee) ? bare(call.callee) : undefined;
    if (!callee || isTranslation(call)) return [];
    const follow = (value: unknown) => nodes(value).flatMap((next) => this.of(next, module, seen));
    if (callee.type === "MemberExpression") {
      const method = nameOf(callee) ?? "";
      if (/^(?:map|flatMap)$/.test(method)) {
        return nodes(call.arguments).flatMap((f) =>
          this.of(f, module, seen).flatMap((o) => this.#returned(o, seen)),
        );
      }
      if (nameOf(callee.object) === "Object") {
        return follow(call.arguments).flatMap((o) =>
          nodes(o.node.properties).flatMap((p) =>
            nodes(p.value).flatMap((value) => this.of(value, o.module, seen)),
          ),
        );
      }
      if (texts.test(method)) return follow([callee.object, ...nodes(call.arguments)]);
      if (parts.test(method)) return follow(callee.object);
    }
    if (callee.type === "Identifier" && wrappers.test(String(callee.name))) {
      return nodes(call.arguments).flatMap((argument) =>
        this.of(argument, module, seen).flatMap((o) => [o, ...this.#returned(o, seen)]),
      );
    }
    return this.of(callee, module, seen).flatMap((o) => this.#returned(o, seen));
  }

  /** What a function returns; nothing for anything else. */
  returned(origin: Origin): Origin[] {
    return this.#returned(origin, new Set());
  }

  #returned({ node, module }: Origin, seen: Set<Node>): Origin[] {
    if (!isFunction(node) || !isNode(node.body)) return [];
    const results: Node[] = [];
    if (node.body.type !== "BlockStatement") results.push(node.body);
    else {
      walk(node.body, (inner) => {
        if (isFunction(inner)) return false;
        if (inner.type === "ReturnStatement") results.push(...nodes(inner.argument));
        return true;
      });
    }
    return results.flatMap((result) => this.of(result, module, seen));
  }

  #resolve(source: string, from: string): Module | undefined {
    if (!source.startsWith(".")) return undefined;
    const path = posix.join(posix.dirname(from), source);
    return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((end) => this.#modules.get(path + end))
      .find((module) => module !== undefined);
  }
}

/** String methods whose result holds the text and the arguments, or a part of the text. */
const texts = /^(?:concat|join|replace|replaceAll|padStart|padEnd)$/;
const parts =
  /^(?:trim\w*|to(?:Locale)?(?:Upper|Lower)Case|toString|slice|substring|at|normalize|repeat|split|filter|find|reverse|sort|pop|shift|get)$/;
const wrappers = /^(?:String|useMemo|useState|useRef|useCallback|memo)$/;

export function isFunction(node: Node): boolean {
  return /Function(?:Expression|Declaration)$/.test(node.type);
}

/** A call of t: its result comes from the catalog. */
export function isTranslation(node: Node): boolean {
  return node.type === "CallExpression" && nameOf(node.callee) === "t";
}

function declarations(module: Module): Names {
  const names: Names = new Map();
  const declare = (name: string, node: Node) =>
    names.set(name, [...(names.get(name) ?? []), { node, module }]);

  const bind = (pattern: Node, value: Node | undefined): void => {
    switch (pattern.type) {
      case "Identifier":
        if (value) declare(String(pattern.name), value);
        break;
      case "AssignmentPattern":
        for (const left of nodes(pattern.left)) {
          bind(left, value);
          for (const right of nodes(pattern.right)) bind(left, right);
        }
        break;
      case "ArrayPattern":
        for (const element of nodes(pattern.elements)) bind(element, value);
        break;
      case "ObjectPattern":
        for (const property of nodes(pattern.properties)) {
          const { key, start } = property;
          if (!isNode(property.value)) continue;
          const part: Node = { type: "MemberExpression", object: value, property: key, start };
          bind(property.value, value && isNode(key) ? part : undefined);
        }
        break;
    }
  };

  const setters = new Map<string, Node>();
  walk(module.program, (node) => {
    if (node.type === "VariableDeclarator" && isNode(node.id)) {
      bind(node.id, isNode(node.init) ? node.init : undefined);
      const [state, setter] = node.id.type === "ArrayPattern" ? nodes(node.id.elements) : [];
      const name = nameOf(setter);
      if (state && name) setters.set(name, state);
    }
    if (node.type === "AssignmentExpression" && isNode(node.left) && isNode(node.right)) {
      bind(node.left, node.right);
    }
    if (node.type === "ImportDeclaration") {
      const { source, start } = node;
      for (const specifier of nodes(node.specifiers)) {
        const local = nameOf(specifier.local);
        const imported = nameOf(specifier.imported);
        if (!local || !imported || !isNode(source)) continue;
        declare(local, { type: "Import", source: source.value, imported, start });
      }
    }
    if (isFunction(node)) {
      const name = nameOf(node.id);
      if (name) declare(name, node);
      // Defaults of parameters.
      for (const parameter of nodes(node.params)) bind(parameter, undefined);
    }
    if (node.type === "CallExpression" && isNode(node.callee)) {
      const { callee } = node;
      const [first] = nodes(node.arguments);
      const state = setters.get(nameOf(callee) ?? "");
      if (state && first) bind(state, first);
      // The parameter of a callback is an element of the list.
      if (callee.type === "MemberExpression" && /^(?:map|flatMap)$/.test(nameOf(callee) ?? "")) {
        const [parameter] = first && isFunction(first) ? nodes(first.params) : [];
        if (parameter && isNode(callee.object)) {
          bind(parameter, { ...callee, element: true });
        }
      }
    }
    return true;
  });
  return names;
}
