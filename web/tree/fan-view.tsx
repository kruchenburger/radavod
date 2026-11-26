import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import type { TreeSnapshot } from "../../src/shared/tree";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import {
  type Fan,
  type FanArrow,
  type FanCell,
  type FanLine,
  fanKeys,
  fanText,
  firstCell,
} from "./layout/fan";
import { kinOf } from "./layout/kin";
import classes from "./fan-view.module.css";
import { measure, rem } from "./type";
import type { Words } from "./words";

type FanViewProps = {
  fan: Fan;
  snapshot: TreeSnapshot;
  words: Words;
  label: string;
  describedBy: string;
  /** Where a person on the fan leads: the fan around them. */
  hrefOfPerson: (person: string) => string;
  /** Where a person in the centre leads: their pedigree. */
  hrefOfCentre: (person: string) => string;
};

const arrows: Partial<Record<string, FanArrow>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Room around the fan for the names of the branches, and under it for the decades. */
const aside = 112;
const below = 34;

/**
 * The fan of ancestors: rings of generations around the centre, every person a link. Parents meet
 * over their child as a bracket, dark on the direct line; every branch is a spoke in its ink, named
 * beyond its founder. The keys walk it: up to a parent, down to the child, along the ring.
 */
export function FanView(props: FanViewProps) {
  const { fan, snapshot, words, label, describedBy, hrefOfPerson, hrefOfCentre } = props;
  const { t } = useLanguage();
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [isAsked, setAsked] = useState(false);
  const move = useMemo(() => fanKeys(fan), [fan]);
  const kin = kinOf(snapshot);
  const isQuarter = fan.sides.length === 1 && fan.sides[0]?.from === Math.PI / 2;

  useEffect(() => {
    const element = box.current;
    if (element === null || typeof ResizeObserver === "undefined") return undefined;
    const read = (): void => {
      const style = getComputedStyle(element);
      const across = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const w = element.clientWidth - across;
      // A hair less, so that rounding never brings a scroll bar.
      const h = element.clientHeight - 8;
      setSize((old) => (old?.w === w && old.h === h ? old : { w, h }));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A quarter larger than the window opens at its centre, the corner where the person stands.
  useEffect(() => {
    const element = box.current;
    if (element === null || !isQuarter) return;
    element.scrollTop = element.scrollHeight;
    element.scrollLeft = 0;
  }, [isQuarter, fan]);
  useEffect(() => {
    if (!isAsked || current === null) return;
    setAsked(false);
    box.current
      ?.querySelector<SVGAElement>(`[data-key="${CSS.escape(current)}"]`)
      ?.focus({ preventScroll: false });
  }, [isAsked, current]);

  const known = fan.cells.some(({ key }) => key === current) ? current : null;
  const stop = known ?? firstCell(fan)?.key ?? null;
  const outer = fan.radius + aside;
  const view = isQuarter
    ? { x: -8, y: -outer, w: outer + 8, h: outer + below }
    : { x: -outer, y: -outer, w: 2 * outer, h: outer + below };
  // Names stay as large as the tree has them, at least 14 px; the stage scrolls instead.
  const unit = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;
  // The whole fan where it fits; names never below 14 px, the stage scrolls instead.
  const fits = size === null ? 1 : Math.min(size.w / view.w, size.h > 0 ? size.h / view.h : 1);
  const scale = Math.max(14 / 17, Math.min(1, fits / unit));

  const onKeyDown = (event: KeyboardEvent): void => {
    const arrow = arrows[event.key];
    const key = (event.target as Element).closest("[data-key]")?.getAttribute("data-key");
    if (arrow === undefined || key == null) return;
    event.preventDefault();
    const next = move(key, arrow);
    if (next === null) return;
    setCurrent(next);
    setAsked(true);
  };

  const bySpoke = spokesOf(fan, (id) => kin.person(id)?.branch ?? null);
  return (
    <div ref={box} className={classes.stage} data-fan>
      <svg
        className={classes.fan}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        style={{ width: rem(view.w * scale), height: rem(view.h * scale) }}
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
      >
        {fan.cells.map((cell) => {
          const person = kin.person(cell.person);
          if (person === undefined) return null;
          const text = words.person(person);
          const lines = cell.repeat ? [] : fanText(cell, text, { measure, sets: fan.metrics.sets });
          const said = [
            words.name(person),
            words.years(person),
            words.branch(person.branch),
            ...(cell.direct ? [t("pages.direct")] : []),
            ...(cell.repeat ? [t("fan.repeat")] : []),
            ...(cell.further ? [t("fan.further")] : []),
          ].join(", ");
          return (
            <Link
              key={cell.key}
              className={classes.cell}
              href={hrefOfPerson(cell.person)}
              data-key={cell.key}
              data-direct={cell.direct || undefined}
              data-repeat={cell.repeat || undefined}
              tabIndex={cell.key === stop ? 0 : -1}
              aria-label={said}
              onFocus={() => setCurrent(cell.key)}
            >
              <path className={classes.ground} d={sector(cell)} />
              <path className={classes.bar} d={arc(cell.inner + 1.5, cell.from, cell.to)} />
              <CellText cell={cell} lines={lines} ink={words.ink(person.branch)} />
            </Link>
          );
        })}
        <Brackets fan={fan} />
        {bySpoke.map(({ branch, cells, founder }) => (
          <g key={branch} aria-hidden="true">
            {cells.map((cell) => (
              <path
                key={cell.key}
                className={classes.spoke}
                style={{ stroke: words.ink(branch) }}
                d={arc(cell.outer - 2.5, cell.from - nudge(cell), cell.to + nudge(cell))}
              />
            ))}
            <Spoke cell={founder} radius={fan.radius} ink={words.ink(branch)}>
              {words.page(branch)}
            </Spoke>
          </g>
        ))}
        <Decades fan={fan} snapshot={snapshot} isQuarter={isQuarter} />
        <Centre
          fan={fan}
          snapshot={snapshot}
          words={words}
          href={hrefOfCentre}
          isQuarter={isQuarter}
        />
      </svg>
    </div>
  );
}

/** A hair inside the cell, so the stripes of two neighbours do not meet. */
const nudge = (cell: FanCell): number => Math.min(0.004, (cell.from - cell.to) / 8);

const polar = (radius: number, angle: number): [number, number] => [
  radius * Math.cos(angle),
  -radius * Math.sin(angle),
];

function sector({ inner, outer, from, to }: FanCell): string {
  const [x0, y0] = polar(outer, from);
  const [x1, y1] = polar(outer, to);
  const [x2, y2] = polar(inner, to);
  const [x3, y3] = polar(inner, from);
  const large = from - to > Math.PI ? 1 : 0;
  return `M${x0},${y0}A${outer},${outer} 0 ${large} 1 ${x1},${y1}L${x2},${y2}A${inner},${inner} 0 ${large} 0 ${x3},${y3}Z`;
}

function arc(radius: number, from: number, to: number): string {
  const [x0, y0] = polar(radius, from);
  const [x1, y1] = polar(radius, to);
  return `M${x0},${y0}A${radius},${radius} 0 ${from - to > Math.PI ? 1 : 0} 1 ${x1},${y1}`;
}

const degrees = (angle: number): number => (angle * 180) / Math.PI;

/** Along the arc in the first ring; outward from the inner edge in the others. */
function CellText({ cell, lines, ink }: { cell: FanCell; lines: FanLine[]; ink: string }) {
  if (lines.length === 0) return null;
  const middle = (cell.from + cell.to) / 2;
  const isAlong = lines.length > 0 && cell.ring === 1 && cell.outer - cell.inner < 100;
  let transform: string;
  let anchor: "middle" | "start" | "end";
  if (isAlong) {
    const [x, y] = polar((cell.inner + cell.outer) / 2, middle);
    transform = `translate(${x} ${y}) rotate(${90 - degrees(middle)})`;
    anchor = "middle";
  } else {
    const isLeft = middle > Math.PI / 2;
    const [x, y] = polar(cell.inner + 10, middle);
    transform = `translate(${x} ${y}) rotate(${isLeft ? 180 - degrees(middle) : -degrees(middle)})`;
    anchor = isLeft ? "end" : "start";
  }
  return (
    <text className={classes.text} transform={transform} textAnchor={anchor} aria-hidden="true">
      {lines.map((line, i) => (
        <tspan
          key={i}
          x="0"
          y={line.dy}
          dominantBaseline="central"
          className={line.style === "detail" ? classes.years : undefined}
        >
          <Inked line={line} ink={ink} />
        </tspan>
      ))}
    </text>
  );
}

/** The surname in the ink of the branch, wherever it stands in the line. */
function Inked({ line, ink }: { line: FanLine; ink: string }) {
  if (line.part === "surname") return <tspan style={{ fill: ink }}>{line.text}</tspan>;
  if (line.part !== "given") return line.text;
  const space = line.text.indexOf(" ");
  if (space < 0) return line.text;
  return (
    <>
      {line.text.slice(0, space + 1)}
      <tspan style={{ fill: ink }}>{line.text.slice(space + 1)}</tspan>
    </>
  );
}

/** Parents meet over the outer edge of their child, as a bracket of the tree. */
function Brackets({ fan }: { fan: Fan }) {
  const groups = new Map<string, FanCell[]>();
  for (const cell of fan.cells) {
    const name =
      cell.child ??
      `centre ${fan.sides.findIndex((side) => cell.from <= side.from && cell.to >= side.to)}`;
    groups.set(name, [...(groups.get(name) ?? []), cell]);
  }
  return (
    <g aria-hidden="true">
      {[...groups.values()].map((cells) => {
        const from = Math.max(...cells.map((cell) => cell.from));
        const to = Math.min(...cells.map((cell) => cell.to));
        const isDirect = cells.some((cell) => cell.direct);
        const radius = (cells[0]?.inner ?? 0) - 0.5;
        return (
          <path
            key={cells[0]?.key}
            className={isDirect ? classes.direct : classes.bracket}
            d={arc(radius, from - 0.004, to + 0.004)}
          />
        );
      })}
    </g>
  );
}

type Spoke = { branch: string; cells: FanCell[]; founder: FanCell };

/** People of a branch on the fan, and the outermost of them, whose spoke bears the name. */
function spokesOf(fan: Fan, branchOf: (person: string) => string | null): Spoke[] {
  const spokes = new Map<string, Spoke>();
  for (const cell of fan.cells) {
    const branch = branchOf(cell.person);
    if (branch === null) continue;
    const spoke = spokes.get(branch);
    if (spoke === undefined) spokes.set(branch, { branch, cells: [cell], founder: cell });
    else {
      spoke.cells.push(cell);
      if (cell.ring > spoke.founder.ring) spoke.founder = cell;
    }
  }
  return [...spokes.values()];
}

function Spoke({
  cell,
  radius,
  ink,
  children,
}: {
  cell: FanCell;
  radius: number;
  ink: string;
  children: string;
}) {
  const middle = (cell.from + cell.to) / 2;
  const isLeft = middle > Math.PI / 2;
  const [x0, y0] = polar(cell.outer, middle);
  const [x1, y1] = polar(radius + 6, middle);
  const [x, y] = polar(radius + 10, middle);
  const turn = isLeft ? 180 - degrees(middle) : -degrees(middle);
  return (
    <>
      <path className={classes.leader} style={{ stroke: ink }} d={`M${x0},${y0}L${x1},${y1}`} />
      <text
        className={classes.branch}
        style={{ fill: ink }}
        transform={`translate(${x} ${y}) rotate(${turn})`}
        textAnchor={isLeft ? "end" : "start"}
        dominantBaseline="central"
      >
        {children}
      </text>
    </>
  );
}

/** Under every ring, the decade most of its people were born in. */
function Decades({
  fan,
  snapshot,
  isQuarter,
}: {
  fan: Fan;
  snapshot: TreeSnapshot;
  isQuarter: boolean;
}) {
  const { t } = useLanguage();
  const kin = kinOf(snapshot);
  const rings = [...new Set(fan.cells.map(({ ring }) => ring))];
  return (
    <g aria-hidden="true">
      {rings.map((ring) => {
        const cells = fan.cells.filter((cell) => cell.ring === ring);
        const years = cells
          .map(({ person }) => kin.person(person)?.birth?.text.match(/\d{4}/)?.[0])
          .filter((year): year is string => year !== undefined)
          .map(Number)
          .sort((a, b) => a - b);
        const year = years[years.length >> 1];
        if (year === undefined) return null;
        const decade = Math.floor(year / 10) * 10;
        const { inner, outer } = cells[0] as FanCell;
        const x = (inner + outer) / 2;
        return [isQuarter ? [x] : [-x, x]].flat().map((at) => (
          <text key={`${ring} ${at}`} className={classes.decade} x={at} y={22} textAnchor="middle">
            {t("fan.decade", { year: decade })}
          </text>
        ));
      })}
    </g>
  );
}

/** The centre: the person, or the two of the couple, each a link to their pedigree. */
function Centre({
  fan,
  snapshot,
  words,
  href,
  isQuarter,
}: {
  fan: Fan;
  snapshot: TreeSnapshot;
  words: Words;
  href: (person: string) => string;
  isQuarter: boolean;
}) {
  const kin = kinOf(snapshot);
  const radius = fan.metrics.inner - 1;
  const isPair = fan.sides.length === 2;
  return (
    <>
      {fan.sides.map((side, i) => {
        const one = kin.person(side.person);
        if (one === undefined) return null;
        const { given, surname } = words.person(one);
        const [x, anchor] = isQuarter
          ? [6, "start" as const]
          : !isPair
            ? [0, "middle" as const]
            : i === 0
              ? [-9, "end" as const]
              : [9, "start" as const];
        const [left, right] = [polar(radius, side.from)[0], polar(radius, side.to)[0]];
        return (
          <Link
            key={side.person}
            className={classes.centre}
            href={href(one.id)}
            aria-label={words.name(one)}
          >
            <path
              className={classes.ground}
              d={`M0,0L${polar(radius, side.from).join(",")}A${radius},${radius} 0 0 1 ${polar(radius, side.to).join(",")}Z`}
            />
            <path
              className={classes.bar}
              d={`M${Math.min(left, right)},-1.5H${Math.max(left, right)}`}
            />
            <text x={x} y={isQuarter ? -12 : -38} textAnchor={anchor}>
              {given}
            </text>
            {/* In the quarter of the phone the middle has room for the given name only. */}
            {!isQuarter && (
              <text x={x} y={-14} textAnchor={anchor} style={{ fill: words.ink(one.branch) }}>
                {surname}
              </text>
            )}
          </Link>
        );
      })}
      {isPair && !isQuarter && (
        <text className={classes.ring} x={0} y={-26} textAnchor="middle" aria-hidden="true">
          ⚭
        </text>
      )}
    </>
  );
}
