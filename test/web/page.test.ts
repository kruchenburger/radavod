import { describe, expect, it } from "vitest";
import font from "@fontsource-variable/roboto-slab/index.css?raw";
import page from "../../web/index.html?raw";
import styles from "../../web/app/home.module.css?raw";
import config from "../../vite.config.ts?raw";
import wrangler from "../../wrangler.jsonc?raw";
import { THEME_KEY } from "../../web/app/memory";
import { tokens } from "../../web/app/tokens";

it.each([
  ["the page", page],
  ["the styles", styles],
  ["the font", font],
])("asks no other site for anything: %s", (_, source) => {
  expect(source).not.toMatch(/(?:https?:)?\/\/\w/);
});

it("is built where the Worker looks for it", () => {
  const { assets } = JSON.parse(wrangler) as { assets: { directory: string } };
  expect(config).toContain('root: "web"');
  expect(config).toContain(`outDir: ".${assets.directory}"`);
});

it("applies the remembered theme before the first paint", () => {
  expect(page).toContain(`"${THEME_KEY}"`);
});

it.each([
  ["Russian", "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"],
  ["Belarusian", "абвгдеёжзійклмнопрстуўфхцчшыьэюя’"],
  ["Polish", "aąbcćdeęfghijklłmnńoóprsśtuwyzźż"],
  ["Lithuanian", "aąbcčdeęėfghiįyjklmnoprsštuųūvzž"],
])("has a font for %s", (_, alphabet) => {
  const ranges = [...font.matchAll(/unicode-range: ([^;]+);/g)].flatMap(([, list = ""]) =>
    list.split(",").map((range) => {
      const [first = "", last = first] = range.trim().replace("U+", "").split("-");
      return [parseInt(first, 16), parseInt(last, 16)] as const;
    }),
  );
  const missing = [...alphabet, ...alphabet.toUpperCase()].filter((letter) => {
    const code = letter.codePointAt(0) ?? 0;
    return !ranges.some(([first, last]) => first <= code && code <= last);
  });
  expect(missing).toEqual([]);
});

describe.each(Object.entries(tokens))("the %s theme", (_, { paper, surface, ...colors }) => {
  it.each([
    ["ink", paper],
    ["ink", surface],
    ["muted", paper],
    ["muted", surface],
    ["action", paper],
    ["warning", paper],
    ["warning", surface],
  ] as const)("%s reads on %s", (name, background) => {
    expect(contrast(colors[name], background)).toBeGreaterThanOrEqual(4.5);
  });
});

/** WCAG 2.1 contrast ratio. */
function contrast(a: string, b: string): number {
  const [dark = 0, light = 0] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
}

function luminance(color: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5].map((i) => {
    const value = parseInt(color.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
