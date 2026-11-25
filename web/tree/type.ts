import { fonts } from "../app/tokens";
import type { Measure, TextStyle } from "./layout/types";

type Face = { family: "serif" | "sans"; size: number; weight: number; isItalic?: boolean };

const serif = (size: number, weight = 400, isItalic = false): Face => ({
  family: "serif",
  size,
  weight,
  isItalic,
});
/** The branch is set in 500, so the years beside it are measured as if they were. */
const sans = (size: number): Face => ({ family: "sans", size, weight: 500 });

/** Sizes of docs/design.md, in pixels of a page whose text is 16 px. */
const faces: Record<TextStyle, Face> = {
  name: serif(17),
  nameDirect: serif(17, 700),
  detail: sans(14),
  reference: serif(17, 400, true),
  focusName: serif(37, 700),
  focusNameDouble: serif(30, 700),
  focusNameNarrow: serif(30, 700),
  focusDetail: sans(16),
  head: serif(17, 700),
  closerName: serif(15.5),
  closerNameDirect: serif(15.5, 700),
  closerReference: serif(14.5, 400, true),
  nearName: serif(19),
  nearNameDirect: serif(19, 700),
  nearReference: serif(16, 400, true),
  nearDetail: sans(14.5),
};

/** A length of the layout, which grows with the text of the page. */
export const rem = (pixels: number): string => `${pixels / 16}rem`;

const shorthand = (face: Face, size: string): string =>
  `${face.isItalic === true ? "italic " : ""}${face.weight} ${size} ${fonts[face.family]}`;

export const cssFont = (style: TextStyle, lineHeight: number): string =>
  shorthand(faces[style], `${rem(faces[style].size)}/${rem(lineHeight)}`);

let canvas: CanvasRenderingContext2D | null | undefined;
const widths = new Map<string, number>();

/** How wide a text is in the fonts of the page. Ask after `loadFonts`. */
export const measure: Measure = (text, style) => {
  const name = `${style} ${text}`;
  let width = widths.get(name);
  if (width === undefined) widths.set(name, (width = widthOf(text, faces[style])));
  return width;
};

function widthOf(text: string, face: Face): number {
  canvas ??= document.createElement("canvas").getContext("2d");
  // A browser without a canvas gets a guess.
  if (canvas === null) return [...text].length * face.size * 0.5;
  canvas.font = shorthand(face, `${face.size}px`);
  return canvas.measureText(text).width;
}

/** Waits for the fonts of these letters, but not forever: another font is better than no tree. */
export async function loadFonts(text: string): Promise<void> {
  const set = document.fonts as FontFaceSet | undefined;
  if (set === undefined) return;
  const names = new Set(Object.values(faces).map((face) => shorthand(face, "16px")));
  const letters = [...new Set(text)].join("");
  const all = Promise.allSettled([...names].map((name) => set.load(name, letters)));
  await Promise.race([all, new Promise((resolve) => setTimeout(resolve, 5000))]);
  widths.clear();
}
