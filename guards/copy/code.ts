import { bare, isNode, type Module, nameOf, type Node, nodes, walk } from "./ast.ts";
import { isFunction, isTranslation, type Origin, Origins } from "./origins.ts";

export type Finding = { rule: string; file: string; line: number; text: string };

/** Properties and attributes a person reads or hears. */
const shown =
  /^(?:alt|aria-(?:label|description|placeholder|roledescription|valuetext)|children|__html)$|^(?:label|title|subtitle|text|message|description|placeholder|caption|legend|hint|tooltip|heading|summary|ariaLabel|ariaDescription)$|[a-z](?:Label|Title|Text|Message|Description|Placeholder|Caption|Legend|Hint|Tooltip|Heading)$/;
/** Shown as attributes only: as properties they mean other things. */
const shownAttribute = /^(?:error|data|options|leftSection|rightSection)$/;
const technical = /^(?:classNames?|styles?|vars)$/;
const shownByElement = /^(?:textContent|innerText|innerHTML|outerHTML)$/;
const shownByCall = /^(?:createTextNode|insertAdjacentText|insertAdjacentHTML|write)$/;
const dialogs = /^(?:alert|confirm|prompt)$/;
const notifiers = /^(?:notifications?|notify|toast|toaster|modals?|snackbar|Notification)$/;
const errors = /(?:Error|Exception)$/;
const responses = /^(?:json|text|html|body)$/;
const answer = /^(?:error|message|title|detail|description|reason)$/;

/** Finds text a person would see that does not come from a catalog. */
export function checkCode(module: Module, origins: Origins, keys: Set<string>): Finding[] {
  const inBrowser = /^(?:web|src\/shared)\//.test(module.file);
  const findings = new Map<string, Finding>();

  const report = (rule: string, { node, module: at }: Origin, text: string) => {
    const place = `${at.file}:${node.start}`;
    // The first rule that sees a text names it.
    if (findings.has(place)) return;
    const line = at.source.slice(0, node.start).split("\n").length;
    findings.set(place, { rule, file: at.file, line, text: text.trim().replace(/\s+/g, " ") });
  };

  const collect = (rule: string, value: unknown, is: (text: string) => boolean = hasLetter) => {
    for (const root of nodes(value)) {
      for (const origin of origins.of(root, module)) {
        // A function given to show something is asked for its result.
        for (const found of [origin, ...origins.returned(origin)]) {
          for (const text of textsOf(found.node)) if (is(text)) report(rule, found, text);
        }
      }
      showsError(root, (node) =>
        report("error-message-shown", { node, module }, "the message of an error"),
      );
    }
  };

  /** Texts of the arguments and of the shown properties of their objects. */
  const collectArguments = (
    rule: string,
    value: unknown,
    is: (text: string) => boolean,
    names: RegExp,
  ) => {
    collect(rule, value, is);
    for (const argument of nodes(value)) {
      for (const origin of origins.of(argument, module)) {
        if (origin.node.type !== "ObjectExpression") continue;
        for (const property of nodes(origin.node.properties)) {
          if (names.test(nameOf(property.key) ?? "")) collect(rule, property.value, is);
        }
      }
    }
  };

  const checkCall = (node: Node) => {
    const callee = isNode(node.callee) ? bare(node.callee) : undefined;
    if (!callee) return;
    const name = nameOf(callee) ?? "";
    const isMethod = callee.type === "MemberExpression";
    const owner = isMethod ? (nameOf(callee.object) ?? "") : "";
    const args = nodes(node.arguments);

    if (errors.test(name)) {
      // On the server an English message is for the log, any other is for a person.
      collect("error-text", args[0], inBrowser ? isProse : hasCyrillic);
    } else if (/^reject$/.test(name)) {
      collect("error-text", args[0], inBrowser ? isProse : hasCyrillic);
    } else if (callee.type === "Super") {
      collect("error-text", args, inBrowser ? isProse : hasCyrillic);
    } else if (!inBrowser && (name === "Response" || (isMethod && responses.test(name)))) {
      collectArguments("response-text", args, isProse, answer);
    }
    if (!inBrowser) return;

    if (/^(?:createElement|cloneElement|jsxs?)$/.test(name)) collect("jsx-text", args.slice(1));
    else if (isMethod && name === "setAttribute") {
      if (shown.test(String(args[0]?.value))) collect("dom-text", args[1]);
    } else if (isMethod && shownByCall.test(name)) collect("dom-text", args.slice(-1));
    else if (dialogs.test(name) && (!isMethod || /^(?:window|globalThis|self)$/.test(owner))) {
      collect("dialog-text", args);
    } else if (notifiers.test(name) || notifiers.test(owner)) {
      collectArguments("notification-text", args, hasLetter, shown);
    }
  };

  walk(module.program, (node) => {
    switch (node.type) {
      case "CallExpression":
      case "NewExpression":
        // Logs are for developers, and what t is given is a key.
        if (isLog(node)) return false;
        checkCall(node);
        break;
      case "ThrowStatement":
        collect("error-text", node.argument, inBrowser ? isProse : hasCyrillic);
        break;
      case "Property":
      case "PropertyDefinition":
        if (technical.test(nameOf(node.key) ?? "")) return false;
        if (shown.test(nameOf(node.key) ?? "") && node.computed !== true) {
          // A key of the catalog may travel under such a name until t gets it.
          collect("property-text", node.value, (text) =>
            inBrowser ? hasLetter(text) && !keys.has(text) : hasCyrillic(text),
          );
        }
        break;
    }
    if (!inBrowser) return true;

    switch (node.type) {
      case "JSXElement":
      case "JSXFragment":
        for (const child of nodes(node.children)) {
          if (child.type === "JSXText") collect("jsx-text", child);
          if (child.type === "JSXExpressionContainer") collect("jsx-text", child.expression);
        }
        break;
      case "JSXAttribute": {
        const name = nameOf(node.name) ?? "";
        if (technical.test(name)) return false;
        if (shown.test(name) || shownAttribute.test(name) || name.startsWith("render")) {
          for (const value of nodes(node.value)) {
            collect(
              "attribute-text",
              value.type === "JSXExpressionContainer" ? value.expression : value,
            );
          }
        }
        break;
      }
      case "JSXOpeningElement": {
        // A button made of an input shows its value.
        const values = new Map(
          nodes(node.attributes).map((a) => [nameOf(a.name), nodes(a.value)[0]]),
        );
        if (/^(?:submit|button|reset)$/.test(String(values.get("type")?.value))) {
          const value = values.get("value");
          collect(
            "attribute-text",
            value?.type === "JSXExpressionContainer" ? value.expression : value,
          );
        }
        break;
      }
      case "FunctionDeclaration":
      case "VariableDeclarator":
        // A component may return text as it is.
        if (module.file.endsWith("x") && /^[A-Z][a-z]/.test(nameOf(node.id) ?? "")) {
          const component = node.type === "VariableDeclarator" ? node.init : node;
          if (isNode(component) && isFunction(component)) collect("jsx-text", component);
        }
        break;
      case "AssignmentExpression": {
        const left = isNode(node.left) ? node.left : undefined;
        const name = nameOf(left) ?? "";
        if (left?.type !== "MemberExpression") break;
        if (name === "title" && nameOf(left.object) === "document") {
          collect("document-title", node.right);
        } else if (shownByElement.test(name) || shown.test(name)) collect("dom-text", node.right);
        break;
      }
    }
    return true;
  });

  // The net under the rules above. Letters on their own are data, as a table that folds ё into е;
  // on the server lower-case words are too, as the months a date is parsed by.
  walk(module.program, (node) => {
    if (node.type === "CallExpression" && isLog(node)) return false;
    for (const text of textsOf(node)) {
      const isText = inBrowser
        ? /\p{Script=Cyrillic}{2}/u.test(text) || isSentence(text)
        : hasCyrillic(text) && isSentence(text);
      if (isText) report("text-outside-catalog", { node, module }, text);
    }
    return true;
  });
  return [...findings.values()];
}

export type Use = { line: number; keys: string[]; parameters: string[] | undefined };

/** Every string and template a module holds, and what each call of t is given. */
export function usesOf(module: Module, origins: Origins) {
  const strings = new Set<string>();
  const patterns: RegExp[] = [];
  const calls: Use[] = [];
  walk(module.program, (node) => {
    if (node.type === "Literal" && typeof node.value === "string") strings.add(node.value);
    if (!isTranslation(node)) return true;
    const [key, parameters] = nodes(node.arguments);
    if (!key) return true;
    const found = origins.of(key, module).map((origin) => origin.node);
    const templates = found.filter((n) => n.type === "TemplateLiteral");
    for (const template of templates) {
      const parts = textsOf(template).map((text) => text.replace(/[^\w]/g, "\\$&"));
      // Without a fixed part it could be any key, so it proves the use of none.
      if (parts[0]) patterns.push(new RegExp(`^${parts.join(".+")}$`));
    }
    calls.push({
      line: module.source.slice(0, node.start).split("\n").length,
      // What a template is filled with is a part of a key.
      keys: templates.length > 0 ? [] : found.flatMap(textsOf),
      parameters: parametersOf(parameters),
    });
    return true;
  });
  return { strings, patterns, calls };
}

/** The names given to t, or undefined when they are not written out in the call. */
function parametersOf(node: Node | undefined): string[] | undefined {
  if (!node) return [];
  if (node.type !== "ObjectExpression") return undefined;
  const names = nodes(node.properties).map((p) =>
    p.type === "Property" && p.computed !== true ? nameOf(p.key) : undefined,
  );
  return names.includes(undefined) ? undefined : (names as string[]);
}

/** The text of a literal; the fixed parts of a template. */
function textsOf(node: Node): string[] {
  if (node.type === "Literal") return typeof node.value === "string" ? [node.value] : [];
  if (node.type === "JSXText") return [String(node.value)];
  if (node.type !== "TemplateLiteral") return [];
  return nodes(node.quasis).map((quasi) => (quasi.value as { cooked: string }).cooked ?? "");
}

/** error.message and String(error): what an error says is for developers. */
function showsError(root: Node, found: (node: Node) => void): void {
  walk(root, (node) => {
    if (isFunction(node) || node.type.startsWith("JSX")) return false;
    const isMessage = node.type === "MemberExpression" && nameOf(node) === "message";
    const subject = isMessage
      ? node.object
      : node.type === "CallExpression" && nameOf(node.callee) === "String"
        ? nodes(node.arguments)[0]
        : undefined;
    if (/^(?:e|err|cause|reason)$|error$/i.test(nameOf(subject) ?? "")) found(node);
    return true;
  });
}

function isLog(node: Node): boolean {
  const callee = isNode(node.callee) ? node.callee : undefined;
  return callee?.type === "MemberExpression" && nameOf(callee.object) === "console";
}

export function hasLetter(text: string): boolean {
  return /\p{L}/u.test(text.replace(/&#?\w+;/g, ""));
}

function hasCyrillic(text: string): boolean {
  return /\p{Script=Cyrillic}/u.test(text);
}

/** Starts as a sentence does and goes on; a list of fonts does too. */
function isSentence(text: string): boolean {
  return (
    /^\s*\p{Lu}[\p{L}'’-]*[,:]?\s(?:.*\s)?\p{L}{2,}/u.test(text) &&
    !/\b(?:serif|monospace|system-ui)\b/.test(text)
  );
}

/** More than a code: words apart from each other, or anything a code is not written in. */
function isProse(text: string): boolean {
  return /\p{L}\S*\s+\S*\p{L}/u.test(text) || hasCyrillic(text);
}
