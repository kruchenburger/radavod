import { DEFAULT_THEME } from "@mantine/core";
import { describe, expect, it } from "vitest";
import design from "../../docs/design.md?raw";
import { cssVariables, theme } from "../../web/app/theme";
import { tokens } from "../../web/app/tokens";
import { contrast, distance, visions } from "./colors";

/** What each colour is for. A colour that is nowhere here has no test. */
const backgrounds = ["paper", "surface", "hover"] as const;
const texts = ["ink", "muted", "action", "warning", "noBranch"] as const;
const lines = ["rule"] as const;
const decoration = ["edge"] as const;
const pairs = [
  ["onAction", "action"],
  // The chosen person on the map: the two colours change places.
  ["paper", "ink"],
] as const;

describe.each(Object.entries(tokens))("the %s theme", (_, { branches, ...colors }) => {
  it.each(texts.flatMap((text) => backgrounds.map((background) => [text, background] as const)))(
    "%s reads on %s",
    (text, background) => {
      expect(contrast(colors[text], colors[background])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(pairs)("%s reads on %s", (text, background) => {
    expect(contrast(colors[text], colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(lines.flatMap((line) => backgrounds.map((background) => [line, background] as const)))(
    "%s is seen on %s",
    (line, background) => {
      expect(contrast(colors[line], colors[background])).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(
    branches.flatMap((ink, i) =>
      (["paper", "surface"] as const).map((background) => [i + 1, background, ink] as const),
    ),
  )("branch ink %i reads on %s", (_number, background, ink) => {
    expect(contrast(ink, colors[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("has a test for every colour", () => {
    const tested = [...backgrounds, ...texts, ...lines, ...decoration, ...pairs.flat()];
    expect(Object.keys(colors).filter((name) => !tested.includes(name as "ink"))).toEqual([]);
  });

  it("has twelve branch inks", () => {
    expect(new Set(branches).size).toBe(12);
  });

  it.each(Object.keys(visions) as (keyof typeof visions)[])(
    "keeps branch inks apart from each other and from the text, vision %s",
    (vision) => {
      const all = branches.flatMap((a, i) => branches.slice(i + 1).map((b) => [a, b] as const));
      expect(Math.min(...all.map(([a, b]) => distance(a, b, vision)))).toBeGreaterThan(3.7);
      expect(Math.min(...branches.map((a) => distance(a, colors.ink, vision)))).toBeGreaterThan(11);
    },
  );
});

it("gives every colour to the styles in both themes", () => {
  const { light, dark } = cssVariables(theme as never);
  expect(Object.keys(light)).toEqual(Object.keys(dark));
  expect(light["--ink"]).toBe(tokens.light.ink);
  expect(dark["--on-action"]).toBe(tokens.dark.onAction);
  expect(light["--branch-1"]).toBe(tokens.light.branches[0]);
  expect(dark["--branch-12"]).toBe(tokens.dark.branches[11]);
});

it("sets names in one family and the interface in the other", () => {
  expect(theme.headings?.fontFamily).toContain('"Alegreya Variable"');
  expect(theme.fontFamily).toContain('"Alegreya Sans"');
});

it("writes readable text on the main button in both themes", () => {
  const colors = (variant: string, color = "action") =>
    theme.variantColorResolver?.({ variant, color, theme: DEFAULT_THEME });
  expect(colors("filled")).toMatchObject({
    background: "var(--action)",
    color: "var(--on-action)",
  });
  expect(colors("filled", "red")?.color).not.toBe("var(--on-action)");
  expect(colors("outline")?.background).toBe("transparent");
});

it("is the same in the design document", () => {
  const { light, dark } = tokens;
  for (const [i, ink] of light.branches.entries()) {
    const night = dark.branches[i] ?? "";
    const ratios = (color: string, { paper, surface }: typeof light) =>
      [paper, surface].map((background) => contrast(color, background).toFixed(2));
    expect(rows(design)).toContainEqual([
      String(i + 1),
      `\`${ink}\``,
      ...ratios(ink, light),
      `\`${night}\``,
      ...ratios(night, dark),
    ]);
  }
  const { branches: _, ...colors } = light;
  for (const name of Object.keys(colors) as (keyof typeof colors)[]) {
    expect(rows(design).map((row) => row.slice(0, 3))).toContainEqual([
      `\`${name}\``,
      `\`${light[name]}\``,
      `\`${dark[name]}\``,
    ]);
  }
});

function rows(markdown: string): string[][] {
  return markdown
    .split("\n")
    .filter((line) => line.startsWith("|"))
    .map((line) =>
      line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
}
