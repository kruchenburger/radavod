import { bare, isFunction, isNode, type Module, nameOf, type Node, nodes, walk } from "./ast.ts";
import { isTranslation, type Origin, Origins } from "./origins.ts";

export type Finding = { rule: string; file: string; line: number; text: string };
type Test = (text: string) => boolean;

/** Properties and attributes a person reads or hears. */
const shown =
  /^(?:alt|aria-(?:label|description|placeholder|roledescription|valuetext)|children|__html)$|^(?:label|title|subtitle|text|message|description|placeholder|caption|legend|hint|tooltip|heading|summary|ariaLabel|ariaDescription)$|[a-z](?:Label|Title|Text|Message|Description|Placeholder|Caption|Legend|Hint|Tooltip|Heading)$/;
/** Of these, the names that mean nothing but text. */
const alwaysText = /^(?:alt|aria-.*|children|__html|placeholder)$/;
/** Lists and maps of texts, mixed with codes. */
const listAttribute = /^(?:error|data|options|items|leftSection|rightSection)$/;
const listProperty = /^(?:labels|validate)$/;
const codeProperty = /^(?:value|key|id|type|icon|color)$/;
/** Attributes of a component that name things for the code. */
const codeAttribute =
  /^(?:ff|key|value|defaultValue|name|id|type|component|c|bg|timeZone|locale|lang|code|hotkey|as|to|path|href|src|autoComplete)$|^(?:on[A-Z]|data-|aria-)/;
const technical = /^(?:classNames?|styles?|vars)$/;

const shownByElement = /^(?:textContent|innerText|innerHTML|outerHTML)$/;
const shownByMethod =
  /^(?:createTextNode|insertAdjacentText|insertAdjacentHTML|fillText|strokeText|text|html)$/;
const dialogs = /^(?:alert|confirm|prompt)$/;
const notifiers = /^(?:notifications?|notify|toast|toaster|modals?|snackbar|Notification)$/;
const notifies =
  /^(?:show\w*|open\w*|update|success|error|info|warn\w*|loading|message|add|custom)$/;
const formChecks =
  /^(?:setCustomValidity|set(?:Field)?Errors?|isNotEmpty\w*|isEmail|hasLength|isInRange|isOneOf)$/;
const schemaMessage = /^(?:error|message|required_error|invalid_type_error)$/;
const schemaValues =
  /^(?:literal|enum|startsWith|endsWith|includes|default|catch|describe|brand|record)$/;
const errors = /(?:Error|Exception)$/;
const responses = /^(?:json|text|html|body)$/;
const answer = /^(?:error|message|title|detail|description|reason)$/;

/** Finds text a person would see that does not come from a catalog. */
export function checkCode(module: Module, origins: Origins, keys: Set<string>): Finding[] {
  const inBrowser = /^(?:web|src\/shared)\//.test(module.file);
  // On the server an English message is for the log, any other is for a person.
  const errorTest = inBrowser ? isProse : hasCyrillic;
  // A key of the catalog may travel under any name until t gets it.
  const isLabel: Test = (text) => startsAsLabel(text) && !keys.has(text);
  const findings = new Map<string, Finding>();

  const report = (rule: string, { node, module: at }: Origin, text: string) => {
    const place = `${at.file}:${node.start}`;
    // The first rule that sees a text names it.
    if (findings.has(place)) return;
    const line = at.source.slice(0, node.start).split("\n").length;
    findings.set(place, { rule, file: at.file, line, text: text.trim().replace(/\s+/g, " ") });
  };

  const reportTexts = (rule: string, origin: Origin, is: Test) => {
    // What an error says is for developers. Another error and a log may repeat it.
    if (
      origin.node.type === "ErrorText" &&
      is !== never &&
      rule !== "error-text" &&
      rule !== "property-text"
    ) {
      report("error-message-shown", origin, "the message of an error");
    }
    for (const text of textsOf(origin.node)) if (is(text)) report(rule, origin, text);
  };

  const collect = (rule: string, value: unknown, is: Test = hasLetter) => {
    for (const root of nodes(value)) {
      for (const origin of origins.of(root, module)) {
        // A function given to show something is asked for its result.
        for (const found of [origin, ...origins.returned(origin)]) reportTexts(rule, found, is);
      }
    }
  };

  /** Texts of the value and, in its objects at any depth, of the properties picked by name. */
  const collectDeep = (rule: string, value: unknown, is: Test, picked: (name: string) => Test) => {
    const seen = new Set<Node>();
    const visit = ({ node, module: at }: Origin, test: Test) => {
      if (seen.has(node)) return;
      seen.add(node);
      const origin = { node, module: at };
      reportTexts(rule, origin, test);
      for (const result of origins.returned(origin)) visit(result, test);
      if (node.type !== "ObjectExpression") return;
      for (const property of nodes(node.properties)) {
        const name = nameOf(property.key) ?? "";
        if (technical.test(name)) continue;
        for (const part of nodes(property.value)) {
          for (const next of origins.of(part, at)) visit(next, picked(name));
        }
      }
    };
    for (const root of nodes(value)) {
      for (const origin of origins.of(root, module)) visit(origin, is);
    }
  };
  const only =
    (names: RegExp, is: Test) =>
    (name: string): Test =>
      names.test(name) ? is : never;
  const allBut =
    (names: RegExp, is: Test) =>
    (name: string): Test =>
      names.test(name) ? never : is;

  const checkCall = (node: Node) => {
    const callee = isNode(node.callee) ? bare(node.callee) : undefined;
    if (!callee) return;
    const name = nameOf(callee) ?? "";
    const isMethod = callee.type === "MemberExpression";
    const owner = isMethod ? (nameOf(callee.object) ?? "") : "";
    const args = nodes(node.arguments);

    if (name === "HTTPException") {
      collectDeep("response-text", args, isProse, only(answer, isProse));
    } else if (errors.test(name) || name === "reject") collect("error-text", args[0], errorTest);
    else if (callee.type === "Super") collect("error-text", args, errorTest);
    else if (!inBrowser && isMethod && name === "html") {
      collect("response-text", args, (text) => hasLetter(text.replace(/<[^>]*>/g, "")));
    } else if (!inBrowser && (name === "Response" || (isMethod && responses.test(name)))) {
      collectDeep("response-text", args, isProse, only(answer, isProse));
    }
    if (!inBrowser) return;

    if (/^(?:createElement|cloneElement|jsxs?)$/.test(name)) collect("jsx-text", args.slice(1));
    else if (isMethod && /^(?:setAttribute|attr)$/.test(name)) {
      if (shown.test(String(args[0]?.value))) collect("dom-text", args[1]);
    } else if (isMethod && name.startsWith("insertAdjacent")) collect("dom-text", args.slice(-1));
    else if (isMethod && shownByMethod.test(name)) collect("dom-text", args[0]);
    else if (name === "write" && owner === "document") collect("dom-text", args);
    else if (name === "Option") collect("dom-text", args[0]);
    else if (name === "useDocumentTitle") collect("document-title", args);
    else if (dialogs.test(name) && (!isMethod || /^(?:window|globalThis|self)$/.test(owner))) {
      collect("dialog-text", args, isLabel);
    } else if (
      (!isMethod && notifiers.test(name)) ||
      (notifiers.test(owner) && notifies.test(name)) ||
      name === "showNotification"
    ) {
      collectDeep("notification-text", args, isLabel, (property) =>
        shown.test(property) ? hasLetter : listProperty.test(property) ? isLabel : never,
      );
    } else if (formChecks.test(name) || (!isMethod && /^matches(?:Field)?$/.test(name))) {
      collectDeep("form-text", args, isLabel, allBut(codeProperty, isLabel));
    } else if (isMethod && rootOf(callee) === "z" && !schemaValues.test(name)) {
      collectDeep("form-text", args, isLabel, only(schemaMessage, isLabel));
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
        collect("error-text", node.argument, errorTest);
        break;
      case "Property":
      case "PropertyDefinition": {
        const name = nameOf(node.key) ?? "";
        if (technical.test(name)) return false;
        if (node.computed === true) break;
        if (shown.test(name)) {
          const test = alwaysText.test(name) ? (text: string) => hasLetter(text) : isLabel;
          collect("property-text", node.value, inBrowser ? test : hasCyrillic);
        } else if (inBrowser && listProperty.test(name)) {
          collectDeep("property-text", node.value, isLabel, allBut(codeProperty, isLabel));
        }
        break;
      }
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
      case "JSXAttribute":
        if (technical.test(nameOf(node.name) ?? "")) return false;
        break;
      case "JSXOpeningElement":
        checkAttributes(node);
        break;
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
        } else if (shownByElement.test(name)) collect("dom-text", node.right);
        else if (shown.test(name)) collect("dom-text", node.right, isLabel);
        break;
      }
    }
    return true;
  });

  function checkAttributes(element: Node) {
    const isComponent = /^[A-Z]/.test(nameOf(element.name) ?? "");
    const isButton = nodes(element.attributes).some(
      (a) =>
        nameOf(a.name) === "type" &&
        /^(?:submit|button|reset)$/.test(String(nodes(a.value)[0]?.value)),
    );
    for (const attribute of nodes(element.attributes)) {
      const name = nameOf(attribute.name) ?? "";
      const value = nodes(attribute.value).map((v) =>
        v.type === "JSXExpressionContainer" && isNode(v.expression) ? v.expression : v,
      );
      if (technical.test(name)) continue;
      if (shown.test(name) || (isButton && name === "value")) {
        collect("attribute-text", value, (text) =>
          isComponent ? hasLetter(text) && !keys.has(text) : hasLetter(text),
        );
      } else if (name.startsWith("render")) collect("attribute-text", value);
      else if (listAttribute.test(name)) {
        collectDeep("attribute-text", value, isLabel, (property) => {
          if (shown.test(property)) return (text) => hasLetter(text) && !keys.has(text);
          return codeProperty.test(property) ? never : isLabel;
        });
      } else if (isComponent && !codeAttribute.test(name)) {
        // A component may show any of its attributes.
        for (const root of value) {
          for (const origin of origins.of(root, module)) {
            reportTexts("attribute-text", origin, (text) => startsWithCapital(text));
          }
        }
      }
    }
  }

  // The net under the rules above. Letters on their own are data; longer Cyrillic data belongs
  // to src, where lower-case words are data too, as the months a date is parsed by.
  walk(module.program, (node) => {
    if (node.type === "TSLiteralType" || (node.type === "CallExpression" && isLog(node))) {
      return false;
    }
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
    const args = nodes(node.arguments);
    // t(locale, key, parameters), or t(key, parameters) bound to a locale.
    const [key, parameters] = args[0] && isLocale(args[0], module, origins) ? args.slice(1) : args;
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

/** The identifier a chain of calls and members starts from. */
function rootOf(node: Node): string | undefined {
  const inner = bare(node);
  const next = inner.type === "CallExpression" ? inner.callee : inner.object;
  return isNode(next) ? rootOf(next) : nameOf(inner);
}

function isLocale(node: Node, module: Module, origins: Origins): boolean {
  if (/locale$/i.test(nameOf(node) ?? "")) return true;
  const texts = origins.of(node, module).flatMap((origin) => textsOf(origin.node));
  return texts.length > 0 && texts.every((text) => text === "ru" || text === "en");
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
    /^\s*\p{Lu}[\p{L}'’-]*[,:]?\s(?:.*\s)?\p{Ll}{2,}/su.test(text) &&
    !/\b(?:serif|monospace|system-ui)\b/.test(text)
  );
}

/** «Имя», "Name", "Add a person", " people" after a number; a code is written otherwise. */
function startsAsLabel(text: string): boolean {
  return startsWithCapital(text) || isProse(text) || /^\s+\p{L}{2}|\p{L}{2}\s+$/u.test(text);
}

function startsWithCapital(text: string): boolean {
  return /^[\s\d+]*\p{Lu}\p{Ll}/u.test(text);
}

function never(): boolean {
  return false;
}

/** More than a code: words apart from each other, or anything a code is not written in. */
function isProse(text: string): boolean {
  return /\p{L}\S*\s+\S*\p{L}/u.test(text) || hasCyrillic(text);
}
