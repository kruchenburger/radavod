import { useMemo } from "react";
import type { TreeSnapshot } from "../../../src/shared/tree";
import { useLanguage } from "../../app/language";
import { isPhone, usePage } from "../../app/use-page";
import { kinOf } from "../layout/kin";
import { measure, rem } from "../type";
import type { Words } from "../words";
import { type Life, lifeStrip, type LifeStrip } from "./life-strip";
import classes from "./life-strip.module.css";

type LifeStripViewProps = {
  snapshot: TreeSnapshot;
  person: string;
  words: Words;
  /** Whose ancestors are the direct line. */
  line: string;
};

const scaleHeight = 24;
const selfHeight = 44;
const rowHeight = 36;
/** Headings stand before the scale. */
const headWidth = 112;
const headHeight = 26;
const groupGap = 8;
const signRoom = 14;
/** The last year stands by the end of the scale and not past it. */
const tickRoom = 30;

/** The years of a person and of the nearest kin, as docs/design.md draws them. */
export function LifeStripView({ snapshot, person, words, line }: LifeStripViewProps) {
  const { t } = useLanguage();
  const page = usePage();
  // The card of a person: as wide as the page up to a point, its margins left out.
  const width = Math.min(page.width, 1392) - 2 * (isPhone(page) ? 16 : 28);
  const isNarrow = width < 640;
  const strip = useMemo(() => {
    const today = new Date().getFullYear();
    return lifeStrip(snapshot, person, { today, before: isNarrow ? 20 : 45 });
  }, [snapshot, person, isNarrow]);
  if (strip === null) return null;

  const rows = rowsOf(strip, isNarrow);
  const height = (rows.at(-1)?.bottom ?? 0) + 8;
  const first = isNarrow ? 0 : headWidth;
  // Room for the "?" at either end. The line of today is the edge itself.
  const left = first + signRoom;
  const right = strip.today === null ? width - signRoom : width - 1;
  const place = (year: number): number =>
    left +
    ((Math.min(Math.max(year, strip.from), strip.to) - strip.from) / (strip.to - strip.from)) *
      (right - left);
  const own = strip.groups[0]?.lives[0]?.bar ?? null;
  return (
    <section className={classes.years}>
      <h2>{t("card.years")}</h2>
      <div className={classes.strip} style={{ height: rem(height) }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: rem(width), height: rem(height) }}
          aria-hidden="true"
        >
          {strip.span !== null && (
            <rect
              className={classes.span}
              x={place(strip.span.from)}
              y={scaleHeight}
              width={Math.max(2, place(strip.span.to) - place(strip.span.from))}
              height={height - scaleHeight}
            />
          )}
          {ticksOf(strip, isNarrow).map((year) => (
            <path
              key={year}
              className={classes.tick}
              d={`M${place(year)} ${scaleHeight}V${height}`}
            />
          ))}
          {strip.today !== null && (
            <path className={classes.today} d={`M${width - 1} ${scaleHeight}V${height}`} />
          )}
          {rows.map(({ life, y, isSelf }) => {
            const events = isSelf ? strip.events : [];
            if (life === null || life.bar === null) return null;
            const branch = kinOf(snapshot).person(life.person)?.branch ?? null;
            return (
              <g key={`${life.person} ${y}`} style={{ color: words.ink(branch) }}>
                <Bar bar={life.bar} y={y} thick={isSelf ? 9 : 4.5} place={place} strip={strip} />
                {events.map((year, i) => (
                  <circle key={i} className={classes.event} cx={place(year)} cy={y} r={2.6} />
                ))}
              </g>
            );
          })}
        </svg>
        {ticksOf(strip, isNarrow)
          .filter((year) => strip.today === null || width - place(year) > 2 * tickRoom + 8)
          .map((year) => (
            <span
              key={year}
              className={classes.year}
              style={{ left: rem(Math.min(Math.max(place(year), 16), width - 16)) }}
              aria-hidden="true"
            >
              {year}
            </span>
          ))}
        {strip.today !== null && (
          <span className={classes.now} aria-hidden="true">
            {t("card.today")}
          </span>
        )}
        {rows.map((row) => (
          <Label
            key={row.life === null ? row.as : `${row.life.person} ${row.y}`}
            row={row}
            snapshot={snapshot}
            words={words}
            line={line}
            at={{ first, width, place, middle: own === null ? first : place(own.start.outer) }}
          />
        ))}
      </div>
      <Legend strip={strip} />
    </section>
  );
}

type Row = {
  as: LifeStrip["groups"][number]["as"];
  /** Null for a heading. */
  life: Life | null;
  isSelf: boolean;
  /** The middle of the bar, or of the line of the heading. */
  y: number;
  bottom: number;
};

/** Headings stand at the left of the first row, or over it where there is no room. */
function rowsOf({ groups }: LifeStrip, isNarrow: boolean): Row[] {
  const rows: Row[] = [];
  let y = scaleHeight;
  for (const { as, lives } of groups) {
    if (as === "self") {
      for (const life of lives) {
        rows.push({ as, life, isSelf: true, y: y + 25, bottom: y + selfHeight });
        y += selfHeight;
      }
      continue;
    }
    y += groupGap;
    rows.push({
      as,
      life: null,
      isSelf: false,
      y: y + 11,
      bottom: y + (isNarrow ? headHeight : 0),
    });
    if (isNarrow) y += headHeight;
    for (const life of lives) {
      rows.push({ as, life, isSelf: false, y: y + 28, bottom: y + rowHeight });
      y += rowHeight;
    }
  }
  return rows;
}

type Places = { first: number; width: number; place: (year: number) => number; middle: number };
type LabelProps = Omit<LifeStripViewProps, "person"> & { row: Row; at: Places };

function Label({ row: { as, life, isSelf, y }, snapshot, words, line, at }: LabelProps) {
  const { t } = useLanguage();
  if (life === null) {
    if (as === "self") return null;
    return (
      <h3 className={classes.head} style={{ top: rem(y - 11) }}>
        {t(`kin.${as}`)}
      </h3>
    );
  }
  const person = kinOf(snapshot).person(life.person);
  if (person === undefined) return null;
  const { bar } = life;
  if (isSelf) {
    if (bar === null) {
      return (
        <span className={classes.words} style={{ top: rem(y - 11), left: 0 }}>
          {words.years(person)}
        </span>
      );
    }
    const [start, end] = words.ends(person);
    const [from, to] = [at.place(bar.start.outer), at.place(bar.end.outer)];
    const size = (text: string): number => measure(text, "nameDirect");
    const isRoomy = to - from > size(start) + size(end) + 16;
    // Two years by the two ends of the bar, or one after another where it is short.
    const left = isRoomy ? start : words.years(person);
    const style = { top: rem(y - 25) };
    return (
      <>
        <span
          className={classes.end}
          style={{ ...style, left: rem(Math.min(from, at.width - size(left))) }}
        >
          {left}
        </span>
        {isRoomy && end !== "" && (
          <span className={classes.end} style={{ ...style, left: rem(to - size(end)) }}>
            {end}
          </span>
        )}
      </>
    );
  }
  const { given, surname } = words.fullName(person.name && { ...person.name, patronymic: null });
  const isDirect = kinOf(snapshot).lineOf(line).has(person.id);
  const style = isDirect ? "nameDirect" : "name";
  const years = `${words.years(person)} `;
  const widthOf = (details: string): number =>
    measure(`${given} ${surname} `, style) + measure(details, "detail") * 1.05;
  // Where there is no room the branch stays, since the bar only has its ink. The years are below.
  const isRoomy =
    bar === null || widthOf(years + words.branch(person.branch)) <= at.width - at.first;
  const wide = widthOf((isRoomy ? years : "") + words.branch(person.branch));
  const from = bar === null ? at.middle : at.place(bar.start.outer);
  const left = Math.max(at.first, Math.min(from, at.width - wide));
  return (
    <p className={classes.label} style={{ top: rem(y - 26), left: rem(left) }}>
      <span
        className={classes.name}
        data-direct={isDirect || undefined}
        data-unnamed={!words.isNamed(person) || undefined}
      >
        {given} <span style={{ color: words.ink(person.branch) }}>{surname}</span>
      </span>{" "}
      <span className={classes.detail}>
        {isRoomy && years}
        <b style={{ color: words.ink(person.branch) }}>{words.branch(person.branch)}</b>
      </span>
    </p>
  );
}

type BarProps = {
  bar: NonNullable<Life["bar"]>;
  y: number;
  thick: number;
  place: (year: number) => number;
  strip: LifeStrip;
};

function Bar({ bar: { start, end }, y, thick, place, strip }: BarProps) {
  const [a, b] = [place(start.inner), place(end.inner)];
  const isCut = start.outer < strip.from;
  const edge = place(strip.from);
  const isPast = end.outer < strip.from;
  const caps = [
    ...(start.has === "cap" && !isCut ? [a] : []),
    ...(end.has === "cap" && !isPast ? [b] : []),
  ];
  const reach = thick / 2 + 3;
  return (
    <>
      {!isPast && (
        <path
          className={classes.bar}
          strokeWidth={thick}
          d={`M${a} ${y}H${Math.max(b, a + 1.5)}`}
        />
      )}
      {start.outer !== start.inner && !isCut && (
        <path
          className={classes.about}
          strokeWidth={thick}
          d={`M${a} ${y}H${place(start.outer)}`}
        />
      )}
      {end.outer !== end.inner && !isPast && (
        <path className={classes.about} strokeWidth={thick} d={`M${b} ${y}H${place(end.outer)}`} />
      )}
      {caps.map((x, i) => (
        <path key={i} className={classes.cap} d={`M${x} ${y - reach}V${y + reach}`} />
      ))}
      {start.has === "question" && !isCut && <Question x={a - 9} y={y} />}
      {end.has === "question" && !isPast && <Question x={Math.max(b, a) + 5} y={y} />}
      {isCut && (
        <path
          className={classes.cut}
          d={`M${edge + 9} ${y - 5}L${edge + 3} ${y}L${edge + 9} ${y + 5}`}
        />
      )}
    </>
  );
}

const Question = ({ x, y }: { x: number; y: number }) => (
  <text className={classes.question} x={x} y={y + 4.5}>
    ?
  </text>
);

/** Round years, as many as have room. */
function ticksOf({ from, to }: LifeStrip, isNarrow: boolean): number[] {
  const most = isNarrow ? 4 : 8;
  const step = [10, 25, 50, 100, 200].find((years) => (to - from) / years <= most) ?? 500;
  const ticks: number[] = [];
  for (let year = Math.ceil(from / step) * step; year <= to; year += step) ticks.push(year);
  return ticks;
}

function Legend({ strip }: { strip: LifeStrip }) {
  const { t } = useLanguage();
  const ends = strip.groups
    .flatMap(({ lives }) => lives)
    .flatMap(({ bar }) => (bar === null ? [] : [bar.start, bar.end]));
  const marks = [
    { is: ends.some(({ has }) => has === "cap"), as: "known", text: t("card.yearKnown") },
    {
      is: ends.some(({ inner, outer }) => inner !== outer),
      as: "about",
      text: t("card.yearAbout"),
    },
    { is: ends.some(({ has }) => has === "question"), as: "unknown", text: t("card.yearUnknown") },
  ];
  return (
    <p className={classes.legend}>
      {marks
        .filter(({ is }) => is)
        .map(({ as, text }) => (
          <span key={as}>
            <svg width="32" height="12" viewBox="0 0 32 12" aria-hidden="true">
              {as === "known" && (
                <>
                  <path className={classes.bar} strokeWidth="4.5" d="M1 6H32" />
                  <path className={classes.cap} d="M1 0V12" />
                </>
              )}
              {as === "about" && (
                <>
                  <path className={classes.about} strokeWidth="4.5" d="M0 6H14" />
                  <path className={classes.bar} strokeWidth="4.5" d="M14 6H32" />
                </>
              )}
              {as === "unknown" && (
                <>
                  <path className={classes.bar} strokeWidth="4.5" d="M0 6H20" />
                  <Question x={24} y={6} />
                </>
              )}
            </svg>
            {text}
          </span>
        ))}
    </p>
  );
}
