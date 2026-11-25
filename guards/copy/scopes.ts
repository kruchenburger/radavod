import { bare, isFunction, isNode, type Module, nameOf, type Node, nodes } from "./ast.ts";

/** The names of a function or of a module. Blocks share the scope of their function. */
export class Scope {
  readonly #names = new Map<string, Node[]>();
  readonly #parent: Scope | undefined;

  constructor(parent?: Scope) {
    this.#parent = parent;
  }

  /** A name without a value is known to be a name: it hides the same one outside. */
  declare(name: string, value: Node | undefined): void {
    const values = this.#names.get(name) ?? [];
    this.#names.set(name, value ? [...values, value] : values);
  }

  /** Everything the name is given, where it is declared. */
  find(name: string): Node[] {
    return this.#names.get(name) ?? this.#parent?.find(name) ?? [];
  }

  /** A later value of a name declared here or outside. */
  assign(name: string, value: Node): void {
    if (this.#names.has(name) || !this.#parent) this.declare(name, value);
    else this.#parent.assign(name, value);
  }
}

type Export = { source?: string; local?: string; node?: Node };
export type Scopes = {
  root: Scope;
  /** The scope each identifier stands in. */
  of: Map<Node, Scope>;
  exports: Map<string, Export>;
  stars: string[];
};

export function read(module: Module): Scopes {
  const root = new Scope();
  const scopes: Scopes = { root, of: new Map(), exports: new Map(), stars: [] };
  // What a callback is given by its caller, and values that come after the declaration.
  const given = new Map<Node, Node>();
  const later: (() => void)[] = [];

  const bind = (pattern: Node, value: Node | undefined, put: Put): void => {
    switch (pattern.type) {
      case "Identifier":
        put(String(pattern.name), value);
        break;
      case "AssignmentPattern":
        for (const left of nodes(pattern.left)) {
          bind(left, value, put);
          for (const right of nodes(pattern.right)) bind(left, right, put);
        }
        break;
      case "ArrayPattern": {
        const [first, second] = nodes(pattern.elements);
        const isState = /^use(?:State|Reducer)$/.test(nameOf(value?.callee) ?? "");
        for (const element of nodes(pattern.elements)) {
          if (isState && element === second && first) {
            bind(element, { type: "Setter", start: element.start, state: first }, put);
          } else bind(element, value, put);
        }
        break;
      }
      case "RestElement":
        for (const argument of nodes(pattern.argument)) bind(argument, value, put);
        break;
      case "ObjectPattern":
        for (const rest of nodes(pattern.properties)) {
          if (rest.type === "RestElement") bind(rest, undefined, put);
        }
        for (const { key, value: part, start } of nodes(pattern.properties)) {
          const member: Node = { type: "MemberExpression", object: value, property: key, start };
          if (isNode(part)) bind(part, value && isNode(key) ? member : undefined, put);
        }
        break;
    }
  };

  const element = (list: Node): Node => ({
    type: "MemberExpression",
    object: list,
    element: true,
    start: list.start,
  });
  const caught = ({ start }: Node): Node => ({ type: "CaughtError", start });
  const give = (callback: unknown, value: Node) => {
    if (isNode(callback) && isFunction(callback)) given.set(callback, value);
  };

  const visit = (node: Node, outer: Scope): void => {
    let scope = outer;
    const declare: Put = (name, value) => scope.declare(name, value);
    const assign = (name: string, value: Node) => later.push(() => outer.assign(name, value));

    switch (node.type) {
      case "Identifier":
        scopes.of.set(node, scope);
        break;
      case "VariableDeclarator":
        for (const id of nodes(node.id)) bind(id, nodes(node.init)[0], declare);
        break;
      case "AssignmentExpression":
        for (const right of nodes(node.right)) {
          for (const left of nodes(node.left)) {
            bind(left, right, (name, value) => value && assign(name, value));
          }
        }
        break;
      case "ForOfStatement": {
        const [list] = nodes(node.right);
        const [declaration] = nodes(node.left).flatMap((left) => nodes(left.declarations));
        if (list && isNode(declaration?.id)) bind(declaration.id, element(list), declare);
        break;
      }
      case "CatchClause":
        for (const parameter of nodes(node.param)) bind(parameter, caught(parameter), declare);
        break;
      case "Property":
      case "JSXAttribute":
        if (nameOf(node.key ?? node.name) === "onError") {
          const [value] = nodes(node.value);
          give(value?.type === "JSXExpressionContainer" ? value.expression : value, caught(node));
        }
        break;
      case "CallExpression":
        readCall(node, assign, later, outer, give, element, caught);
        break;
      case "ImportDeclaration":
        for (const specifier of nodes(node.specifiers)) {
          const local = nameOf(specifier.local);
          const imported =
            specifier.type === "ImportNamespaceSpecifier"
              ? "*"
              : (nameOf(specifier.imported) ?? "default");
          const source = isNode(node.source) ? node.source.value : undefined;
          if (local) root.declare(local, { type: "Import", source, imported, start: node.start });
        }
        break;
      case "ExportNamedDeclaration":
        for (const specifier of nodes(node.specifiers)) {
          const local = nameOf(specifier.local);
          const exported = nameOf(specifier.exported);
          if (!local || !exported) continue;
          const source = isNode(node.source) ? { source: String(node.source.value) } : {};
          scopes.exports.set(exported, { local, ...source });
        }
        break;
      case "ExportDefaultDeclaration":
        for (const declaration of nodes(node.declaration)) {
          scopes.exports.set("default", { node: declaration });
        }
        break;
      case "ExportAllDeclaration":
        if (isNode(node.source)) scopes.stars.push(String(node.source.value));
        break;
    }

    if (isFunction(node)) {
      const name = nameOf(node.id);
      if (name) outer.declare(name, node);
      scope = new Scope(outer);
      for (const [i, parameter] of nodes(node.params).entries()) {
        bind(parameter, i === 0 ? given.get(node) : undefined, declare);
      }
    }
    for (const child of Object.values(node).flatMap(nodes)) visit(child, scope);
  };
  visit(module.program, root);
  for (const run of later) run();
  return scopes;
}

type Put = (name: string, value: Node | undefined) => void;

function readCall(
  node: Node,
  assign: (name: string, value: Node) => void,
  later: (() => void)[],
  scope: Scope,
  give: (callback: unknown, value: Node) => void,
  element: (list: Node) => Node,
  caught: (node: Node) => Node,
): void {
  const callee = isNode(node.callee) ? bare(node.callee) : undefined;
  const args = nodes(node.arguments);
  const name = nameOf(callee) ?? "";
  if (callee?.type === "MemberExpression" && isNode(callee.object)) {
    const owner = bare(callee.object);
    if (/^(?:map|flatMap|forEach|filter|find)$/.test(name)) give(args[0], element(owner));
    if (name === "catch") give(args[0], caught(node));
    if (/^(?:push|unshift)$/.test(name) && owner.type === "Identifier") {
      for (const value of args) assign(String(owner.name), value);
    }
  } else if (callee?.type === "Identifier") {
    // A call of setState gives the state a value.
    later.push(() => {
      for (const { type, state } of scope.find(name)) {
        const [value] = args;
        if (type === "Setter" && value) scope.assign(nameOf(state) ?? "", value);
      }
    });
  }
}
