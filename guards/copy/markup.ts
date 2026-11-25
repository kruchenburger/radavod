import { type Finding, hasLetter } from "./code.ts";

const spoken =
  /^(?:title|alt|placeholder|label|aria-(?:label|description|placeholder|roledescription|valuetext))$/i;
const spokenMeta = /^(?:description|application-name|apple-mobile-web-app-title|og:|twitter:)/i;

/**
 * HTML and SVG cannot ask the catalog, so a text there must read the same in every language.
 * Returns the inline scripts too, to be checked as code.
 */
export function checkMarkup(file: string, source: string, shared: Set<string>) {
  const findings: Finding[] = [];
  const scripts: string[] = [];
  const report = (text: string) => {
    if (!hasLetter(text) || shared.has(text.trim())) return;
    const line = source.slice(0, source.indexOf(text)).split("\n").length;
    findings.push({ rule: "markup-text", file, line, text: text.trim().replace(/\s+/g, " ") });
  };

  const rest = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi, (_, css: string) => {
      findings.push(...checkStyles(file, css));
      return "";
    })
    .replace(/(<script\b[^>]*>)([\s\S]*?)<\/script\s*>/gi, (_, tag: string, code: string) => {
      const type = /\btype\s*=\s*["']?([^"'\s>]*)/i.exec(tag)?.[1] ?? "";
      if (code.trim() === "") return tag;
      if (/^(?:module|text\/javascript)?$/.test(type)) scripts.push(code);
      else findings.push({ rule: "unread-file", file, line: 1, text: `a script of type ${type}` });
      return tag;
    })
    .replace(/<![^>]*>/g, "")
    .replace(
      /<\/?([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^"'>])*)>/gi,
      (_, tag: string, list: string) => {
        const attributes = [
          ...list.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g),
        ];
        const values = new Map(
          attributes.map(([, name = "", a, b, c]) => [name, a ?? b ?? c ?? ""]),
        );
        for (const [name, value] of values) if (spoken.test(name)) report(value);
        const meta = values.get("name") ?? values.get("property") ?? "";
        if (/^meta$/i.test(tag) && spokenMeta.test(meta)) report(values.get("content") ?? "");
        return "\0";
      },
    );
  for (const text of rest.split("\0")) report(text);
  return { findings, scripts };
}

/** A stylesheet shows text through content, and through a variable given to it. */
export function checkStyles(file: string, source: string): Finding[] {
  const plain = source.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
  return [...plain.matchAll(/(?:^|[\s;{])(?:content|--[\w-]+)\s*:([^;}]*)/g)].flatMap((match) => {
    if (/\b(?:serif|monospace|system-ui)\b/.test(match[1] ?? "")) return [];
    const text = [...(match[1] ?? "").matchAll(/"([^"]*)"|'([^']*)'/g)]
      .map(([, a, b]) => a ?? b ?? "")
      .join(" ");
    if (!hasLetter(text.replace(/\\[\da-f]{1,6}/gi, ""))) return [];
    const line = plain.slice(0, match.index).split("\n").length;
    return [{ rule: "css-text", file, line, text }];
  });
}
