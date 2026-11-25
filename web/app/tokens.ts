export type Tokens = {
  /** The page. */
  paper: string;
  /** A page of the map, the strip of the chosen person, an input. */
  surface: string;
  hover: string;
  ink: string;
  muted: string;
  action: string;
  onAction: string;
  warning: string;
  /** Lines that mean something: kinship, the border of an input. */
  rule: string;
  /** Lines that only divide. */
  edge: string;
  /** A person without a branch. */
  noBranch: string;
  /** Twelve inks, in the same order in both themes: a branch keeps its number. */
  branches: readonly string[];
};

/** docs/design.md says what each one is for. */
export const tokens: Record<"light" | "dark", Tokens> = {
  light: {
    paper: "#faf8f1",
    surface: "#f2eee3",
    hover: "#e9e4d6",
    ink: "#211d18",
    muted: "#615a4e",
    action: "#2c5a48",
    onAction: "#fdfcf8",
    warning: "#8f3a20",
    rule: "#8a8172",
    edge: "#cdc5b5",
    noBranch: "#696156",
    branches: [
      "#8f3f33",
      "#7f6247",
      "#634b00",
      "#885a00",
      "#455d3e",
      "#4a7361",
      "#216761",
      "#335266",
      "#3d69b0",
      "#573e8b",
      "#925494",
      "#89417e",
    ],
  },
  dark: {
    paper: "#201b16",
    surface: "#29231c",
    hover: "#302c25",
    ink: "#ece5d8",
    muted: "#aca293",
    action: "#9fcab2",
    onAction: "#14231b",
    warning: "#e8a98a",
    rule: "#80776a",
    edge: "#403a31",
    noBranch: "#a0978a",
    branches: [
      "#ecaea3",
      "#ae8663",
      "#ccad61",
      "#ba985b",
      "#8ba981",
      "#679782",
      "#4eb0a6",
      "#78c1ef",
      "#7fa9eb",
      "#9a8cc4",
      "#c993cb",
      "#dab3d2",
    ],
  },
};

export const fonts = {
  /** Names and headings. */
  serif: '"Alegreya Variable", Georgia, serif',
  /** The interface. */
  sans: '"Alegreya Sans", Verdana, sans-serif',
};
