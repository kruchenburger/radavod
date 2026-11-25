import type { CSSProperties } from "react";
import type { TreePerson } from "../../src/shared/tree";
import { UnionIcon } from "../app/icons";
import classes from "./card-lines.module.css";
import type { Line } from "./layout/types";
import { cssFont, rem } from "./type";
import type { Words } from "./words";

type CardLinesProps = {
  /** All of it in words, for whoever does not see where the pieces stand. */
  label: string;
  lines: Line[];
  words: Words;
  /** Null for a place and for a reference, which have no ink of their own. */
  person: TreePerson | null;
  /** The ink of the branch a reference leads to. */
  ink?: string | undefined;
  isSpouse?: boolean;
  /** How far before the name the sign of a union stands. */
  ring?: number;
};

/**
 * The texts of a card where the layout put them. Pieces without a space between them are no words to
 * a screen reader, so it gets a sentence.
 */
export function CardLines(props: CardLinesProps) {
  const { label, lines, words, person, ink, isSpouse = false, ring = 18 } = props;
  const own = person === null ? ink : words.ink(person.branch);
  const isUnnamed = person !== null && !words.isNamed(person);
  const first = lines[0];
  return (
    <>
      <span className={classes.said}>{label}</span>
      <span aria-hidden="true" className={classes.lines}>
        {isSpouse && first !== undefined && (
          <span className={classes.sign} style={boxOf({ ...first, x: first.x - ring })}>
            <UnionIcon />
          </span>
        )}
        {lines.map((line, i) => (
          <span
            key={i}
            className={classes[line.part]}
            data-chosen={line.style === "focusDetail" || undefined}
            data-unnamed={(isUnnamed && line.part === "given") || undefined}
            style={{
              ...boxOf(line),
              font: cssFont(line.style, line.h),
              ...(isInked(line) && own !== undefined ? { color: own } : {}),
            }}
          >
            {line.text}
          </span>
        ))}
      </span>
    </>
  );
}

const isInked = ({ part, style }: Line): boolean =>
  part === "surname" || part === "branch" || (part === "detail" && style !== "detail");

const boxOf = ({ x, y, h }: Pick<Line, "x" | "y" | "h">): CSSProperties => ({
  left: rem(x),
  top: rem(y),
  height: rem(h),
});
