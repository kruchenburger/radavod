import { type KeyboardEvent, useEffect, useId, useMemo, useRef } from "react";
import { useArrival } from "../app/arrival";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { isPhone, isSpread, usePage } from "../app/use-page";
import { CardLines } from "../tree/card-lines";
import { around, type AroundCard, type AroundLayout } from "../tree/layout/around";
import { type AroundMetrics, aroundMetrics } from "../tree/layout/around-text";
import { aroundNarrow, type NarrowLayout } from "../tree/layout/around-narrow";
import { kinOf } from "../tree/layout/kin";
import { aroundKeys, type Arrow, listKeys } from "../tree/layout/keys";
import { relativesOf } from "../tree/layout/relatives";
import { personKey } from "../tree/layout/types";
import { Legend, Lines } from "../tree/lines";
import { Moving } from "../tree/moving";
import { cssFont, measure, rem } from "../tree/type";
import { wordsOf } from "../tree/words";
import { useData } from "./data";
import { rememberTree } from "./last-tree";
import { type Half, hrefOf, type TreePlace, treePlace } from "./places";
import classes from "./tree-screen.module.css";

type Centred = TreePlace & { person: string };
type Layout = { as: "wide"; tree: AroundLayout } | { as: "narrow"; tree: NarrowLayout };

const corners = { across: 17, down: 11 };
const narrowCorners = { across: 3, down: 3 };
/** A line stops this far before the name it leads to. */
const beforeText = 5;
/** Every row of the list on the phone is as high as a finger needs. */
const narrowMetrics = { padY: 11.5 };
/** Around the list on the phone. */
const gutter = 16;
const margin = 28;

export function TreeScreen({ place }: { place: Centred }) {
  const { t, locale } = useLanguage();
  const { snapshot, line, words } = useData();
  const page = usePage();
  const hint = useId();
  const heading = useId();
  const { person: focus, siblings, open, half } = place;
  useArrival(() => document.querySelector<HTMLElement>("[data-focus] > a"));
  useEffect(() => rememberTree(hrefOf(place)), [place]);
  const isNarrow = isPhone(page);
  const isWhole = isSpread(page);
  const cardWords = useMemo(() => wordsOf(snapshot, locale, focus), [snapshot, locale, focus]);
  const relatives = useMemo(() => relativesOf(snapshot, focus), [snapshot, focus]);
  const layout = useMemo((): Layout => {
    const options = {
      measure,
      wording: cardWords,
      lineOf: line,
      siblings,
      open: open === null ? null : keyOf(open, kinOf(snapshot).person(open) !== undefined),
    };
    if (isNarrow) {
      const width = page.width - 2 * gutter;
      const narrow = { ...options, width, metrics: narrowMetrics };
      return { as: "narrow", tree: aroundNarrow(snapshot, focus, narrow) };
    }
    const reach = isWhole ? {} : half === "ancestors" ? { down: 0 } : { up: 0 };
    const metrics = metricsFor(page.width, isWhole ? 6 : 3);
    return { as: "wide", tree: around(snapshot, focus, { ...options, ...reach, metrics }) };
  }, [snapshot, focus, cardWords, line, siblings, open, half, isNarrow, isWhole, page.width]);

  const one = kinOf(snapshot).person(focus);
  const name = one === undefined ? "" : words.name(one);
  // Not the width: a window that changes moves nothing.
  const centre = [focus, siblings, layout.tree.open, half].join(" ");
  useEffect(() => holdCentre(), [centre]);
  return (
    <section className={classes.screen} data-as={layout.as} aria-labelledby={heading}>
      <h1 id={heading} className={classes.said}>
        {t("tree.name", { name })}
      </h1>
      {!isWhole && !isNarrow && <Halves place={place} />}
      <div className={classes.scroller} aria-describedby={hint} role="group">
        <Moving centre={centre} className={classes.sheet} onArrive={bringIntoView}>
          <Sheet
            layout={layout}
            isWhole={isWhole}
            place={place}
            words={cardWords}
            relatives={relatives}
          />
        </Moving>
      </div>
      <div className={classes.legend}>
        <Legend links={layout.tree.links} />
        <Link href={hrefOf({ screen: "list", person: focus })}>{t("view.list")}</Link>
        <span id={hint} className={classes.hint}>
          {t("tree.keys")}
        </span>
      </div>
    </section>
  );
}

/**
 * The keys work at once: the person in the centre takes the focus when the tree opens and after
 * every move, unless the visitor has put it somewhere else (the search, a link of the page).
 */
function holdCentre(): void {
  const active = document.activeElement;
  const isFree =
    active === null ||
    active === document.body ||
    (active instanceof HTMLElement && active.closest("[data-press]") !== null);
  if (!isFree) return;
  const centre = document.querySelector<HTMLElement>("[data-focus] > [data-press]");
  if (centre === null || centre === active) return;
  // No mark until a key is pressed, and none after a press of the mouse.
  centre.focus({ preventScroll: true, focusVisible: isByKeys });
}

/** Whether the visitor last used the keys, not the mouse or a finger. */
let isByKeys = false;
window.addEventListener("keydown", () => (isByKeys = true), { capture: true });
window.addEventListener("pointerdown", () => (isByKeys = false), { capture: true });

/** An address names the partner, or the union of one nobody knows. */
const keyOf = (id: string, isPerson: boolean): string =>
  isPerson ? personKey(id) : `?:partner ${id}`;

/** Columns get narrower where the screen has less room than the book, and never wider. */
function metricsFor(width: number, columns: number): Partial<AroundMetrics> {
  const { column, strip, gap } = aroundMetrics;
  const room = width - 2 * margin - strip - columns * gap;
  return { column: Math.min(column, Math.max(112, Math.floor(room / columns))), actions: 68 };
}

/** The chosen person stands in the middle of the window. */
function bringIntoView(root: HTMLElement): void {
  const card = root.querySelector("[data-focus]")?.getBoundingClientRect();
  if (card === undefined) return;
  const by = card.top + card.height / 2 - window.innerHeight / 2;
  window.scrollTo({ top: Math.max(0, window.scrollY + by), behavior: "instant" });
  const scroller = root.parentElement;
  if (scroller !== null && scroller.scrollWidth > scroller.clientWidth) {
    scroller.scrollLeft += card.left + card.width / 2 - window.innerWidth / 2;
  }
}

function Halves({ place }: { place: Centred }) {
  const { t } = useLanguage();
  const halves: Half[] = ["ancestors", "descendants"];
  return (
    <nav className={classes.halves} aria-label={t("tree.half")}>
      {halves.map((half) => (
        <Link
          key={half}
          href={hrefOf({
            ...place,
            half,
            // Siblings stand beside the parents.
            siblings: place.siblings && half === "ancestors",
          })}
          aria-current={half === place.half ? "true" : undefined}
        >
          {t(`tree.${half}`)}
        </Link>
      ))}
    </nav>
  );
}

type SheetProps = {
  layout: Layout;
  isWhole: boolean;
  place: Centred;
  words: ReturnType<typeof wordsOf>;
  relatives: ReturnType<typeof relativesOf>;
};

function Sheet({ layout, isWhole, place, words, relatives }: SheetProps) {
  const { as, tree } = layout;
  const root = useRef<HTMLDivElement>(null);
  const move = useMemo(() => {
    if (layout.as === "wide") return aroundKeys(layout.tree);
    return listKeys(layout.tree.order);
  }, [layout]);
  const cameFrom = useRef<string | null>(null);

  const onKeyDown = (event: KeyboardEvent): void => {
    const arrow = arrows[event.key];
    const key = (event.target as HTMLElement).dataset["press"];
    if (arrow === undefined || key === undefined) return;
    const next = move(key, arrow, cameFrom.current);
    if (next === null) return;
    event.preventDefault();
    cameFrom.current = key;
    const card = root.current?.querySelector<HTMLElement>(`[data-press="${CSS.escape(next)}"]`);
    card?.focus();
    card?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  };
  const byKey = new Map(tree.cards.map((card) => [card.key, card]));
  return (
    <div className={classes.body} style={as === "wide" ? balance(layout.tree) : undefined}>
      {layout.as === "wide" && <Columns tree={layout.tree} />}
      <div
        ref={root}
        className={classes.canvas}
        style={{ width: rem(tree.width), height: rem(tree.height) }}
        onKeyDown={onKeyDown}
      >
        <Lines
          key={`${place.person} ${place.siblings}`}
          links={tree.links}
          width={tree.width}
          height={tree.height}
          corners={as === "wide" ? corners : narrowCorners}
          reach={(key) => {
            const card = byKey.get(key);
            // The partners named under a card stand at its edge, not where the name begins.
            const own = (card?.lines ?? []).filter(({ part }) => part !== "apart");
            const text = Math.min(...own.map(({ x }) => x));
            const ring = card?.isSpouse === true ? aroundMetrics.ring : 0;
            return Number.isFinite(text) ? text - ring - beforeText : 0;
          }}
        />
        {tree.order.map((key) => {
          const card = byKey.get(key);
          return (
            card && (
              <PersonCard
                key={key}
                card={card}
                as={as}
                open={tree.open}
                place={place}
                words={words}
                relatives={relatives}
              />
            )
          );
        })}
      </div>
    </div>
  );

  /** In the whole spread the strip stays in the middle, whoever stands beside it. */
  function balance({ columns, width }: AroundLayout): React.CSSProperties {
    const strip = columns.find(({ generation }) => generation === 0);
    if (!isWhole || strip === undefined) return {};
    const { column, gap } = aroundMetrics;
    const half = 3 * (column + gap);
    return {
      paddingLeft: rem(Math.max(0, half - strip.x)),
      paddingRight: rem(Math.max(0, half - (width - strip.x - strip.w))),
    };
  }
}

const arrows: Partial<Record<string, Arrow>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const columnHeads = {
  "-3": "tree.greatGrandparents",
  "-2": "tree.grandparents",
  "-1": "kin.parents",
  "1": "kin.children",
  "2": "tree.grandchildren",
  "3": "tree.greatGrandchildren",
} as const;

/** The heads of the columns, and the strip of the chosen person from top to bottom. */
function Columns({ tree: { columns, width } }: { tree: AroundLayout }) {
  const { t } = useLanguage();
  return (
    <div className={classes.columns} style={{ width: rem(width) }}>
      {columns.map(({ generation, x, w }) => {
        const head = columnHeads[String(generation) as keyof typeof columnHeads];
        const style = { left: rem(x), width: rem(w) };
        if (head === undefined)
          return <div key={generation} className={classes.strip} style={style} />;
        return (
          <h2 key={generation} style={style}>
            {t(head)}
          </h2>
        );
      })}
    </div>
  );
}

type PersonCardProps = Omit<SheetProps, "layout" | "isWhole"> & {
  card: AroundCard;
  as: Layout["as"];
  open: string | null;
};

function PersonCard({ card, as, open, place, words, relatives }: PersonCardProps) {
  const { t } = useLanguage();
  const { snapshot } = useData();
  const { key, x, y, w, h, role, isSpouse, folded, direct } = card;
  const style = { transform: `translate(${rem(x)}, ${rem(y)})`, width: rem(w), height: rem(h) };
  const person = card.person === null ? undefined : kinOf(snapshot).person(card.person);
  if (person === undefined) {
    return <Place card={card} place={place} words={words} style={style} />;
  }

  const isFocus = role === "focus";
  const href = isFocus
    ? hrefOf({ screen: "person", person: person.id })
    : hrefOf({ ...treePlace(person.id), half: place.half });
  const name = words.name(person);
  const label = [
    isSpouse ? t("tree.partner", { name }) : name,
    words.person(person).years,
    words.branch(person.branch),
    ...(direct ? [t("tree.direct")] : []),
    ...(folded === undefined ? [] : [t("tree.folded", { number: folded })]),
  ].join(", ");
  const isInStrip = as === "wide" && card.generation === 0;
  const isPartner = (isInStrip || as === "narrow") && role === "partner" && open !== null;
  return (
    <div
      className={classes.card}
      data-key={key}
      data-role={role}
      data-families={isPartner || undefined}
      data-focus={isFocus || undefined}
      style={style}
    >
      <Link
        className={classes.name}
        href={href}
        data-press={key}
        aria-current={isFocus ? "true" : undefined}
      >
        <CardLines
          label={label}
          lines={card.lines}
          words={words}
          person={person}
          isSpouse={isSpouse}
        />
        {folded !== undefined && folded > 0 && (
          <span className={classes.folded} aria-hidden="true">
            {folded}
          </span>
        )}
      </Link>
      {card.lines.map((line) => {
        const other = line.to === undefined ? undefined : kinOf(snapshot).person(line.to);
        if (line.part !== "apart" || other === undefined) return null;
        return (
          <Link
            key={`apart ${other.id}`}
            className={classes.apart}
            href={hrefOf({ ...treePlace(other.id), half: place.half })}
            aria-label={words.apart(other)}
            style={{ left: rem(line.x), top: rem(line.y), font: cssFont(line.style, line.h) }}
          >
            {line.text}
          </Link>
        );
      })}
      {isFocus && <Actions as={as} place={place} relatives={relatives} />}
      {isPartner && (
        <Children card={card} as={as} open={open} place={place} relatives={relatives} />
      )}
    </div>
  );
}

type PlaceProps = Pick<PersonCardProps, "card" | "place" | "words"> & {
  style: React.CSSProperties;
};

/** Somebody nobody knows, or people who stand elsewhere on this page. */
function Place({ card, place, words, style }: PlaceProps) {
  const { key, reference, unknown, lines, isSpouse } = card;
  const label =
    reference === undefined
      ? unknown === undefined
        ? ""
        : words.unknown(unknown)
      : Object.values(words.reference(reference)).join(": ");
  const text = (
    <CardLines label={label} lines={lines} words={words} person={null} isSpouse={isSpouse} />
  );
  const [first] = reference?.people ?? [];
  if (reference !== undefined && first !== undefined) {
    return (
      <div className={classes.card} data-key={key} data-role="reference" style={style}>
        <Link
          className={classes.name}
          href={hrefOf({ ...treePlace(first), half: place.half })}
          data-press={key}
        >
          {text}
        </Link>
      </div>
    );
  }
  return (
    <div className={classes.card} data-key={key} data-role="unknown" style={style}>
      <span className={classes.name} data-press={key} tabIndex={-1}>
        {text}
      </span>
    </div>
  );
}

type ActionsProps = Pick<PersonCardProps, "as" | "place" | "relatives">;

function Actions({ as, place, relatives }: ActionsProps) {
  const { t } = useLanguage();
  const number = relatives?.siblings.length ?? 0;
  // Siblings stand beside the parents, so they open in the half of the ancestors.
  const half = "ancestors" as const;
  return (
    <div className={classes.actions} data-as={as}>
      {number > 0 && (
        <Link
          href={hrefOf({ ...place, half, siblings: !place.siblings })}
          aria-expanded={place.siblings}
        >
          {t("tree.siblings", { number })}
        </Link>
      )}
      <Link href={hrefOf({ screen: "person", person: place.person })}>{t("tree.about")}</Link>
    </div>
  );
}

type ChildrenProps = ActionsProps & { card: AroundCard; open: string };

/** With three unions and more one is open, and the rest wait to be. */
function Children({ card, as, open, place, relatives }: ChildrenProps) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const { person, unknown } = card;
  const union = unknown?.of === "partner" ? unknown.union : null;
  const number =
    relatives?.unions.find((one) =>
      person === null ? one.union === union : one.partner === person,
    )?.children.length ?? 0;
  const id = person ?? union;
  const partner = person === null ? undefined : kinOf(snapshot).person(person);
  const name = partner === undefined ? t("person.unnamed") : words.name(partner);
  if (number === 0 || id === null) return null;
  const text = t("tree.children", { number });
  return (
    <Link
      className={classes.children}
      data-as={as}
      // The family opens on the side of the descendants.
      href={hrefOf({ ...place, open: id, half: "descendants" })}
      aria-expanded={card.key === open}
      aria-label={`${text}. ${name}`}
    >
      {text}
    </Link>
  );
}
