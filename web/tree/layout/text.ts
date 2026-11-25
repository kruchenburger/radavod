import type { Line, Measure, Part, TextStyle } from "./types";

export type Run = { text: string; part: Part; style: TextStyle };

type FlowOptions = {
  measure: Measure;
  width: number;
  /** The most lines there may be. */
  lines: number;
  lineHeight: number;
  x?: number;
  y?: number;
  /** Room left before the first line. */
  indent?: number;
};

const ellipsis = "…";

/** The longest beginning that fits, with an ellipsis when something is left out. */
export function cut(text: string, style: TextStyle, width: number, measure: Measure): string {
  if (measure(text, style) <= width) return text;
  const letters = [...text];
  const isMark = (i: number): boolean => /^\p{M}/u.test(letters[i] ?? "");
  let [fits, over] = [-1, letters.length];
  while (over - fits > 1) {
    const middle = (fits + over) >> 1;
    let end = middle;
    while (end > 0 && isMark(end)) end -= 1;
    const part = letters.slice(0, end).join("") + ellipsis;
    if (measure(part, style) <= width) fits = middle;
    else over = middle;
  }
  if (fits < 0) return "";
  while (fits > 0 && isMark(fits)) fits -= 1;
  return letters.slice(0, fits).join("").trimEnd() + ellipsis;
}

/** Sets runs one after another, going on to the next line between words. */
export function flow(runs: Run[], options: FlowOptions): Line[] {
  const { measure, width, lines: most, lineHeight, x: left = 0, y: top = 0, indent = 0 } = options;
  const set: Line[] = [];
  let line: Line | undefined;
  let row = 0;
  let end = indent;
  for (const { text, part, style } of runs) {
    for (const { word, isApart } of wordsOf(text)) {
      const space = measure(" ", style);
      const joins = line !== undefined && line.part === part && line.style === style;
      if (line !== undefined && joins) {
        const longer = line.text + (isApart ? " " : "") + word;
        const w = measure(longer, style);
        if (line.x - left + w <= width) {
          end = line.x - left + w;
          Object.assign(line, { text: longer, w });
          continue;
        }
      }
      let start = line === undefined ? indent : end + (isApart ? space : 0);
      let w = measure(word, style);
      if (start + w > width && (line !== undefined || start > 0)) {
        if (row + 1 >= most) return endWithEllipsis(set, { ...options, word, part, style, end });
        row += 1;
        start = 0;
      }
      let shown = word;
      if (start + w > width) {
        shown = cut(word, style, width - start, measure);
        w = measure(shown, style);
        if (shown === "" || w > width) return set;
      }
      line = { text: shown, part, style, x: left + start, y: top + row * lineHeight, w, h: lineHeight };
      end = start + w;
      set.push(line);
    }
  }
  return set;
}

function endWithEllipsis(
  set: Line[],
  rest: FlowOptions & { word: string; part: Part; style: TextStyle; end: number },
): Line[] {
  const { measure, width, x = 0, word, part, style, end } = rest;
  const last = set.at(-1);
  if (last === undefined) return set;
  if (last.part !== part) {
    // The next run begins after a space and may have room for a few letters.
    const start = end + measure(" ", style);
    const shown = cut(word, style, width - start, measure);
    const w = measure(shown, style);
    if (shown !== "" && start + w <= width) {
      return [...set, { text: shown, part, style, x: x + start, y: last.y, w, h: last.h }];
    }
  }
  const text = cut(`${last.text}${ellipsis}`, last.style, width - last.x + x, measure).replace(
    /…+$/u,
    ellipsis,
  );
  return [...set.slice(0, -1), { ...last, text, w: measure(text, last.style) }];
}

/** A name on one line, or the given name and the surname on lines of their own. */
export function nameLines(given: Run, surname: Run, options: FlowOptions): Line[] {
  const { width, lineHeight, y = 0 } = options;
  const together = flow([given, surname], { ...options, lines: 1, width: Infinity });
  const last = together.at(-1);
  if (last === undefined || last.x - (options.x ?? 0) + last.w <= width) return together;
  const first = flow([given], options);
  const rows = new Set(first.map((line) => line.y)).size;
  const rest = { ...options, y: y + rows * lineHeight };
  return [...first, ...flow([surname], rows === 0 ? rest : { ...rest, indent: 0 })];
}

/**
 * Words, and the parts of one with a hyphen. Very long texts are never shown whole, so the rest is
 * not worth looking at.
 */
function wordsOf(text: string): { word: string; isApart: boolean }[] {
  const words = text.slice(0, 2000).split(/\s+/u);
  return words.flatMap((word) =>
    word
      .split(/(?<=\p{L}-)(?=\p{L})/u)
      .filter((part) => part !== "")
      .map((part, i) => ({ word: part, isApart: i === 0 })),
  );
}
