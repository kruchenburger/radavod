import type { ReactNode } from "react";
import { brace } from "./brace";
import classes from "./halves.module.css";

type HalvesProps = {
  children: ReactNode;
  /** What the family is called, written where the direct line ends, once a link has said it. */
  family?: string | null;
};

/**
 * The start page and the pages of signing in: on the left the blank pedigree, on the right the words
 * and one main button. Nothing of the family is shown here but what a link itself says.
 */
export function Halves({ children, family = null }: HalvesProps) {
  return (
    <main className={classes.page}>
      <div className={classes.left}>
        <Blank family={family} />
      </div>
      <div className={classes.right}>{children}</div>
    </main>
  );
}

/** A family nobody has written down yet: blank lines for the names, braces, the direct line. */
function Blank({ family }: { family: string | null }) {
  return (
    // A name needs room after the tip of the direct line; the blank stays where it was.
    <svg
      className={classes.blank}
      viewBox={family === null ? "0 0 520 600" : "0 0 780 600"}
      aria-hidden="true"
    >
      {generations.map(({ x, width, first, step, count }) =>
        Array.from({ length: count }, (_, i) => (
          <path key={`${x} ${i}`} d={`M${x} ${first + i * step}h${width}`} />
        )),
      )}
      {generations.slice(0, -1).map(({ x, width, first, step, count }) =>
        Array.from({ length: count / 2 }, (_, i) => {
          const top = first + i * 2 * step;
          const end = x + width + 4;
          return (
            <path
              key={`${x} ${i}`}
              d={brace(
                { x: end, y: top },
                { x: end, y: top + step },
                { x: end + 36, y: top + step / 2 },
              )}
            />
          );
        }),
      )}
      <path
        className={classes.direct}
        d={brace({ x: 426, y: 158 }, { x: 426, y: 442 }, { x: 488, y: 300 })}
      />
      {family !== null && (
        <text
          className={classes.family}
          x={500}
          y={308}
          // A long name is set smaller, so it ends inside the drawing.
          fontSize={Math.min(30, Math.floor(520 / Math.max(family.length, 1)))}
        >
          {family}
        </text>
      )}
    </svg>
  );
}

const generations = [
  { x: 0, width: 116, first: 51.5, step: 71, count: 8 },
  { x: 160, width: 108, first: 87, step: 142, count: 4 },
  { x: 312, width: 108, first: 158, step: 284, count: 2 },
];
