import {
  Button,
  colorsTuple,
  createTheme,
  type CSSVariablesResolver,
  defaultVariantColorsResolver,
  localStorageColorSchemeManager,
  virtualColor,
} from "@mantine/core";
import { THEME_KEY } from "./memory";
import { fonts, type Tokens, tokens } from "./tokens";

export const theme = createTheme({
  fontFamily: fonts.sans,
  fontSizes: {
    xs: "0.875rem",
    sm: "0.9375rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
  },
  headings: {
    fontFamily: fonts.serif,
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "2.875rem", lineHeight: "1.1" },
      h2: { fontSize: "1.375rem", lineHeight: "1.2" },
      h3: { fontSize: "1.25rem", lineHeight: "1.25" },
    },
  },
  spacing: { xs: "0.25rem", sm: "0.5rem", md: "0.75rem", lg: "1.25rem", xl: "2rem" },
  defaultRadius: "3px",
  breakpoints: { sm: "45em", lg: "87.5em" },
  black: tokens.light.ink,
  white: tokens.light.surface,
  colors: {
    actionLight: colorsTuple(tokens.light.action),
    actionDark: colorsTuple(tokens.dark.action),
    action: virtualColor({ name: "action", light: "actionLight", dark: "actionDark" }),
  },
  primaryColor: "action",
  // The interface has no heavier weight, and a browser would make one up.
  components: {
    Button: Button.extend({ styles: { root: { fontWeight: 500, minHeight: "2.75rem" } } }),
  },
  // Mantine writes white on the main colour in both themes.
  variantColorResolver: (input) => ({
    ...defaultVariantColorsResolver(input),
    ...(input.variant === "filled" && input.color === "action"
      ? { background: "var(--action)", hover: "var(--action)", color: "var(--on-action)" }
      : {}),
  }),
});

export const cssVariables: CSSVariablesResolver = () => ({
  variables: { "--serif": fonts.serif, "--sans": fonts.sans },
  light: variablesOf(tokens.light),
  dark: variablesOf(tokens.dark),
});

/** Keeps the choice in this browser, and forgives a browser that forbids it. */
export const colorSchemeManager = localStorageColorSchemeManager({ key: THEME_KEY });

function variablesOf({ branches, ...colors }: Tokens): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(colors).map(([name, value]) => [
        `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        value,
      ]),
    ),
    ...Object.fromEntries(branches.map((ink, i) => [`--branch-${i + 1}`, ink])),
    "--mantine-color-body": colors.paper,
    "--mantine-color-text": colors.ink,
    "--mantine-color-dimmed": colors.muted,
  };
}
