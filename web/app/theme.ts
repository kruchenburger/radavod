import {
  colorsTuple,
  createTheme,
  type CSSVariablesResolver,
  localStorageColorSchemeManager,
  virtualColor,
} from "@mantine/core";
import { THEME_KEY } from "./memory";
import { type Tokens, tokens } from "./tokens";

const slab = '"Roboto Slab Variable", Georgia, serif';

export const theme = createTheme({
  fontFamily: slab,
  headings: { fontFamily: slab, fontWeight: "500" },
  black: tokens.light.ink,
  white: tokens.light.surface,
  colors: {
    actionLight: colorsTuple(tokens.light.action),
    actionDark: colorsTuple(tokens.dark.action),
    action: virtualColor({ name: "action", light: "actionLight", dark: "actionDark" }),
  },
  primaryColor: "action",
});

export const cssVariables: CSSVariablesResolver = () => ({
  variables: {},
  light: variablesOf(tokens.light),
  dark: variablesOf(tokens.dark),
});

/** Keeps the choice in this browser, and forgives a browser that forbids it. */
export const colorSchemeManager = localStorageColorSchemeManager({ key: THEME_KEY });

function variablesOf(colors: Tokens): Record<string, string> {
  return {
    ...Object.fromEntries(Object.entries(colors).map(([name, value]) => [`--${name}`, value])),
    "--mantine-color-body": colors.paper,
    "--mantine-color-text": colors.ink,
    "--mantine-color-dimmed": colors.muted,
  };
}
