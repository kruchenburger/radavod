import { posix } from "node:path";
import { bare, isFunction, isNode, type Module, nameOf, type Node, nodes, walk } from "./ast.ts";
import { read, type Scopes } from "./scopes.ts";

/** Where an expression comes from: the module it stands in matters for its names. */
export type Origin = { node: Node; module: Module };

/** One question to Origins: every node is followed once, and a circle adds nothing. */
type Answers = Map<Node, Origin[]>;

/**
 * Follows an expression to the literals it can be: through conditions, concatenation, constants,
 * state, maps, functions and relative imports. The text of an error ends as "ErrorText".
 */
export class Origins {
  readonly #modules: Map<string, Module>;
  readonly #scopes = new Map<Module, Scopes>();

  constructor(modules: Map<string, Module>) {
    this.#modules = modules;
  }

  of(node: Node, module: Module): Origin[] {
    return this.#of(node, module, new Map());
  }

  /** What a function returns; nothing for anything else. */
  returned(origin: Origin): Origin[] {
    return this.#returned(origin, new Map());
  }

  #of(node: Node, module: Module, answers: Answers): Origin[] {
    const expression = bare(node);
    const known = answers.get(expression);
    if (known) return known;
    answers.set(expression, []);
    const found = unique(this.#follow(expression, module, answers));
    answers.set(expression, found);
    return found;
  }

  #follow(expression: Node, module: Module, answers: Answers): Origin[] {
    const follow = (value: unknown) =>
      nodes(value).flatMap((next) => this.#of(next, module, answers));

    switch (expression.type) {
      case "ConditionalExpression":
        return follow([expression.consequent, expression.alternate]);
      case "LogicalExpression":
        return follow(
          expression.operator === "&&" ? expression.right : [expression.left, expression.right],
        );
      case "BinaryExpression":
        return expression.operator === "+"
          ? this.#spell([expression.left, expression.right], module, answers)
          : [];
      case "AssignmentExpression":
        return follow(expression.right);
      case "SequenceExpression":
        return follow(nodes(expression.expressions).slice(-1));
      case "TemplateLiteral":
        return [
          { node: expression, module },
          ...(isCode(expression)
            ? follow(expression.expressions)
            : this.#spell(expression.expressions, module, answers)),
        ];
      case "TaggedTemplateExpression":
        return follow(expression.quasi);
      case "ArrayExpression":
        return follow(
          nodes(expression.elements).map((e) => (e.type === "SpreadElement" ? e.argument : e)),
        );
      case "Identifier":
        return this.#named(expression, module).flatMap((o) => this.#of(o.node, o.module, answers));
      case "MemberExpression":
        return this.#property(expression, module, answers);
      case "CallExpression":
        return this.#call(expression, module, answers);
      case "NewExpression":
        if (nameOf(expression.callee) === "Map") {
          const [entries] = nodes(expression.arguments).map(bare);
          return follow(
            nodes(entries?.elements).flatMap((entry) => nodes(entry.elements).slice(1, 2)),
          );
        }
        return [{ node: expression, module }];
      default:
        return [{ node: expression, module }];
    }
  }

  /** Follows what becomes a text by being put into one, which an error can. */
  #spell(value: unknown, module: Module, answers: Answers): Origin[] {
    return nodes(value).flatMap((next) =>
      this.#isError(next, module) ? [errorText(next, module)] : this.#of(next, module, answers),
    );
  }

  #scopesOf(module: Module): Scopes {
    let scopes = this.#scopes.get(module);
    if (!scopes) this.#scopes.set(module, (scopes = read(module)));
    return scopes;
  }

  /** What an identifier stands for. */
  #named(identifier: Node, module: Module): Origin[] {
    const { root, of } = this.#scopesOf(module);
    const scope = of.get(identifier) ?? root;
    return this.#values(scope.find(String(identifier.name)), module, new Set());
  }

  /** The values of a name, those of other modules in place of its imports. */
  #values(found: Node[], module: Module, seen: Set<string>): Origin[] {
    return found.flatMap((node) => {
      if (node.type !== "Import") return [{ node, module }];
      const from = this.#resolve(String(node.source), module.file);
      if (!from) return [];
      if (node.imported === "*") return [{ node: { ...node, type: "Namespace" }, module: from }];
      return this.#exported(String(node.imported), from, seen);
    });
  }

  #exported(name: string, module: Module, seen: Set<string>): Origin[] {
    const question = `${module.file} ${name}`;
    if (seen.has(question)) return [];
    seen.add(question);
    const { root, exports, stars } = this.#scopesOf(module);
    const found = exports.get(name);
    if (found?.node) return [{ node: found.node, module }];
    const next: [source: string, name: string][] = found?.source
      ? [[found.source, found.local ?? name]]
      : stars.map((source) => [source, name]);
    if (!found?.source) {
      // An import is exported only where that is said.
      const own = root.find(found?.local ?? name).filter((n) => found || n.type !== "Import");
      if (own.length > 0) return this.#values(own, module, seen);
    }
    return next.flatMap(([source, imported]) => {
      const from = this.#resolve(source, module.file);
      return from ? this.#exported(imported, from, seen) : [];
    });
  }

  #resolve(source: string, from: string): Module | undefined {
    if (!source.startsWith(".")) return undefined;
    const path = posix.join(posix.dirname(from), source);
    return ["", ".ts", ".tsx", "/index.ts", "/index.tsx"]
      .map((end) => this.#modules.get(path + end))
      .find((module) => module !== undefined);
  }

  #property(member: Node, module: Module, answers: Answers): Origin[] {
    if (!isNode(member.object)) return [];
    const objects = this.#of(member.object, module, answers);
    if (member.element === true) return objects;
    const name = nameOf(member);
    if (/^(?:message|stack)$/.test(name ?? "")) {
      const isCaught = nameOf(member.object) === "e" || this.#isError(member.object, module);
      if (isCaught) return [errorText(member, module)];
    }
    const seen = new Set<Node>();
    const pick = (origin: Origin): Origin[] => {
      if (seen.has(origin.node)) return [];
      seen.add(origin.node);
      if (origin.node.type === "Namespace") {
        return this.#exported(name ?? "", origin.module, new Set()).flatMap((o) =>
          this.#of(o.node, o.module, answers),
        );
      }
      // names[0] of a list is one of its texts; "text".length is not a text.
      if (origin.node.type !== "ObjectExpression") return member.computed === true ? [origin] : [];
      return nodes(origin.node.properties).flatMap((p) => {
        if (p.type === "SpreadElement") {
          return nodes(p.argument)
            .flatMap((spread) => this.#of(spread, origin.module, answers))
            .filter((o) => o.node.type === "ObjectExpression")
            .flatMap(pick);
        }
        if (name !== undefined && nameOf(p.key) !== name) return [];
        return nodes(p.value).flatMap((value) => this.#of(value, origin.module, answers));
      });
    };
    return objects.flatMap(pick);
  }

  #call(call: Node, module: Module, answers: Answers): Origin[] {
    const callee = isNode(call.callee) ? bare(call.callee) : undefined;
    if (!callee || isTranslation(call)) return [];
    const args = nodes(call.arguments);
    const follow = (value: unknown) =>
      nodes(value).flatMap((next) => this.#of(next, module, answers));
    const results = (value: unknown) =>
      follow(value).flatMap((o) => [o, ...this.#returned(o, answers)]);

    if (callee.type === "MemberExpression") {
      const method = nameOf(callee) ?? "";
      const owner = nameOf(callee.object);
      if (owner === "JSON" && method === "stringify") return follow(args[0]);
      if (owner === "React" && wrappers.test(method)) return results(args);
      if (owner === "Object") {
        if (!/^(?:values|entries)$/.test(method)) return follow(args);
        return follow(args).flatMap((o) =>
          nodes(o.node.properties).flatMap((p) =>
            nodes(p.value).flatMap((value) => this.#of(value, o.module, answers)),
          ),
        );
      }
      if (/^(?:map|flatMap)$/.test(method)) return results(args[0]);
      if (method === "toString") return this.#spell(callee.object, module, answers);
      if (/^(?:join|concat)$/.test(method)) return follow([callee.object, ...args]);
      // What is replaced is gone; what it is replaced with is seen.
      if (/^(?:replace(?:All)?|pad(?:Start|End))$/.test(method)) {
        return follow([callee.object, ...args.slice(1)]);
      }
      if (parts.test(method)) return follow(callee.object);
    } else if (nameOf(callee) === "String") return this.#spell(args, module, answers);
    else if (wrappers.test(nameOf(callee) ?? "")) return results(args);
    return this.#of(callee, module, answers).flatMap((o) => this.#returned(o, answers));
  }

  #returned({ node, module }: Origin, answers: Answers): Origin[] {
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
    return results.flatMap((result) => this.#of(result, module, answers));
  }

  /** By its name, its cast, or because it was caught. */
  #isError(node: Node, module: Module, depth = 0): boolean {
    if (depth > 4) return false;
    if (node.type === "CaughtError") return true;
    if (node.type === "TSAsExpression" && isNode(node.typeAnnotation)) {
      if (nameOf(node.typeAnnotation.typeName)?.endsWith("Error")) return true;
    }
    const expression = bare(node);
    if (node.type === "ParenthesizedExpression" && isNode(node.expression)) {
      return this.#isError(node.expression, module, depth + 1);
    }
    if (expression !== node) return this.#isError(expression, module, depth + 1);
    if (node.type === "MemberExpression") return errorName.test(nameOf(node) ?? "");
    if (node.type !== "Identifier") return false;
    return (
      errorName.test(String(node.name)) ||
      this.#named(node, module).some((o) => this.#isError(o.node, o.module, depth + 1))
    );
  }
}

/** String and list methods whose result holds the text or a part of it. */
const parts =
  /^(?:trim\w*|to(?:Locale)?(?:Upper|Lower)Case|slice|substring|at|normalize|repeat|split|filter|find|reverse|sort|pop|shift|get)$/;
const wrappers = /^(?:useMemo|useState|useRef|useCallback|memo|forwardRef)$/;
const errorName = /^(?:err|error|ex|exception|failure)$|^(?!is|has)\w+Error$/;

/** A call of t: its result comes from the catalog. */
export function isTranslation(node: Node): boolean {
  return node.type === "CallExpression" && nameOf(node.callee) === "t";
}

/** A template as `error.${error}` makes a code, not a text. */
function isCode(template: Node): boolean {
  const fixed = nodes(template.quasis).map((q) => (q.value as { raw: string }).raw);
  return fixed.join("") !== "" && fixed.every((text) => /^[\w.:/-]*$/.test(text));
}

function errorText({ start }: Node, module: Module): Origin {
  return { node: { type: "ErrorText", start }, module };
}

function unique(origins: Origin[]): Origin[] {
  const seen = new Set<unknown>();
  return origins.filter(({ node, module }) => {
    const key = node.type === "ErrorText" ? `${module.file}:${node.start}` : node;
    return !seen.has(key) && seen.add(key);
  });
}
