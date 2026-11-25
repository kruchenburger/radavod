export type Tokens = {
  paper: string;
  surface: string;
  ink: string;
  muted: string;
  action: string;
  warning: string;
};

/** Provisional, until the look of the site is chosen. */
export const tokens: Record<"light" | "dark", Tokens> = {
  light: {
    paper: "#efe8da",
    surface: "#f8f4ea",
    ink: "#2b2320",
    muted: "#655a50",
    action: "#2c5a4c",
    warning: "#8a3324",
  },
  dark: {
    paper: "#231c18",
    surface: "#2f2721",
    ink: "#eee4d4",
    muted: "#b9aa98",
    action: "#92c3ae",
    warning: "#f0a488",
  },
};
