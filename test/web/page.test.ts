import { describe, expect, it, vi } from "vitest";
import serif from "@fontsource-variable/alegreya/index.css?raw";
import serifItalic from "@fontsource-variable/alegreya/wght-italic.css?raw";
import sans from "@fontsource/alegreya-sans/400.css?raw";
import sansMedium from "@fontsource/alegreya-sans/500.css?raw";
import main from "../../web/main.tsx?raw";
import packageJson from "../../package.json?raw";
import page from "../../web/index.html?raw";
import config from "../../vite.config.ts?raw";
import wrangler from "../../wrangler.jsonc?raw";
import { THEME_KEY } from "../../web/app/memory";
import { fonts } from "../../web/app/tokens";

const styles = import.meta.glob<string>("../../web/**/*.css", {
  query: "?raw",
  import: "default",
  eager: true,
});

const faces = [
  ["serif", serif],
  ["serif italic", serifItalic],
  ["sans", sans],
  ["sans medium", sansMedium],
] as const;

it("has styles to look through", () => {
  expect(Object.keys(styles).length).toBeGreaterThan(5);
});

it.each([["the page", page] as const, ...Object.entries(styles), ...faces])(
  "asks no other site for anything: %s",
  (_, source) => {
    expect(source).not.toMatch(/(?:https?:)?\/\/\w/);
  },
);

it("is built where the Worker looks for it", () => {
  const { assets } = JSON.parse(wrangler) as { assets: { directory: string } };
  expect(config).toContain('root: "web"');
  expect(config).toContain(`outDir: ".${assets.directory}"`);
});

it.each([
  ["dark", false, "dark"],
  ["light", false, null],
  [null, false, null],
  // Until the visitor picks, the browser's theme holds.
  [null, true, "dark"],
  ["auto", true, "dark"],
  ["light", true, null],
])(
  "starts with the theme %s, a dark browser %s, before the app does",
  (remembered, isDark, attribute) => {
    const [, script = ""] = /<script>([\s\S]*?)<\/script>/.exec(page) ?? [];
    document.documentElement.removeAttribute("data-mantine-color-scheme");
    vi.spyOn(window, "matchMedia").mockImplementation(
      (query) =>
        ({ matches: isDark && query === "(prefers-color-scheme: dark)" }) as MediaQueryList,
    );
    if (remembered) localStorage.setItem(THEME_KEY, remembered);
    // oxlint-disable-next-line no-new-func -- the script stands in the page, not in a module
    new Function(script)();
    expect(document.documentElement.getAttribute("data-mantine-color-scheme")).toBe(attribute);
  },
);

describe.each(faces)("the %s face", (_, face) => {
  it.each([
    ["Russian", "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"],
    ["Belarusian", "абвгдеёжзійклмнопрстуўфхцчшыьэюя’"],
    ["Polish", "aąbcćdeęfghijklłmnńoóprsśtuwyzźż"],
    ["Lithuanian", "aąbcčdeęėfghiįyjklmnoprsštuųūvzž"],
    ["old Russian spelling", "ѣіѳѵ"],
  ])("has letters for %s", (_, alphabet) => {
    const ranges = [...face.matchAll(/unicode-range: ([^;]+);/g)].flatMap(([, list = ""]) =>
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

  it("is loaded and asked for by its name", () => {
    const [, family] = /font-family: '([^']+)'/.exec(face) ?? [];
    expect(Object.values(fonts).some((stack) => stack.startsWith(`"${family}"`))).toBe(true);
  });
});

it("loads every font it ships and ships every font it loads", () => {
  const { dependencies } = JSON.parse(packageJson) as { dependencies: Record<string, string> };
  const loaded = [...main.matchAll(/import "(@fontsource[\w-]*.[\w-]+)/g)].map(([, name]) => name);
  const shipped = Object.keys(dependencies).filter((name) => name.startsWith("@fontsource"));
  expect([...new Set(loaded)].sort()).toEqual(shipped.sort());
});
