import {
  type CSSProperties,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useArrival } from "../app/arrival";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { isPhone, usePage } from "../app/use-page";
import { CardLines } from "../tree/card-lines";
import {
  type GenerationsCard,
  type GenerationsLayout,
  generations,
  generationsMetrics,
} from "../tree/layout/generations";
import { kinOf } from "../tree/layout/kin";
import { generationsKeys } from "../tree/layout/keys";
import { Legend, Lines } from "../tree/lines";
import { measure, rem } from "../tree/type";
import { type Words, wordsOf } from "../tree/words";
import { ApartLinks, useCardLabel } from "./card-parts";
import { holdCentre, useArrowKeys } from "./centre";
import { useData } from "./data";
import classes from "./generations-screen.module.css";
import { rememberTree } from "./last-tree";
import { hrefOf, treePlace } from "./places";

/** On the phone the cards are narrower, and so are the gaps between them. */
const narrowMetrics = { card: 148, gapX: 20, gapY: 48, padX: 8 };
const corners = { across: 0, down: 0 };

/**
 * The tree by generations: ancestors above the chosen person, descendants below, siblings and
 * partners in the row of the person. The chosen person stands in the middle of the tree's window.
 */
export function GenerationsScreen({ person }: { person: string }) {
  const { t, locale } = useLanguage();
  const { snapshot, line } = useData();
  const page = usePage();
  const hint = useId();
  const heading = useId();
  const isNarrow = isPhone(page);
  useArrival(() => document.querySelector<HTMLElement>("[data-focus] > [data-press]"));
  useEffect(() => rememberTree(hrefOf({ screen: "generations", person })), [person]);
  const words = useMemo(() => wordsOf(snapshot, locale), [snapshot, locale]);
  const layout = useMemo(
    () =>
      generations(snapshot, person, {
        measure,
        wording: words,
        lineOf: line,
        metrics: isNarrow ? narrowMetrics : {},
      }),
    [snapshot, person, words, line, isNarrow],
  );
  useEffect(() => holdCentre(), [person]);
  const one = kinOf(snapshot).person(person);
  const name = one === undefined ? "" : words.name(one);
  return (
    <section className={classes.screen} aria-labelledby={heading}>
      <h1 id={heading} className={classes.said}>
        {t("generations.name", { name })}
      </h1>
      <Window layout={layout} hint={hint} words={words} />
      <div className={classes.legend}>
        <Legend links={layout.links} />
        <Link href={hrefOf(treePlace(person))}>{t("view.around")}</Link>
        <Link href={hrefOf({ screen: "list", person })}>{t("view.branches")}</Link>
        <span id={hint} className={classes.hint}>
          {t("generations.keys")}
        </span>
      </div>
    </section>
  );
}

type Size = { width: number; height: number };

/**
 * The window of the tree scrolls by itself, the page does not. Room is left around the drawing so
 * that the chosen person can stand in the middle however far the family reaches to one side.
 */
type WindowProps = { layout: GenerationsLayout; hint: string; words: Words };

function Window({ layout, hint, words }: WindowProps) {
  const { t } = useLanguage();
  const scroller = useRef<HTMLDivElement>(null);
  const size = useSize(scroller);
  const focus = layout.cards.find(({ key }) => key === layout.focus);
  const room = roomAround(layout, focus, size);
  const move = useMemo(() => generationsKeys(layout), [layout]);

  // The chosen person comes to the middle; a new window keeps them there.
  useLayoutEffect(() => {
    const element = scroller.current;
    if (element === null || focus === undefined) return;
    const unit = Number.parseFloat(getComputedStyle(element).fontSize) / 16 || 1;
    element.scrollLeft = (room.left + focus.x + focus.w / 2) * unit - element.clientWidth / 2;
    element.scrollTop = (room.top + focus.y + focus.h / 2) * unit - element.clientHeight / 2;
  }, [layout, focus, room.left, room.top, room.right, room.bottom]);

  const onKeyDown = useArrowKeys(move, scroller);
  // The room is a box of its own: a margin beside a width is dropped on the right.
  const spread: CSSProperties = {
    width: rem(room.left + layout.width + room.right),
    height: rem(room.top + layout.height + room.bottom),
  };
  const style: CSSProperties = {
    left: rem(room.left),
    top: rem(room.top),
    width: rem(layout.width),
    height: rem(layout.height),
  };
  return (
    <div
      ref={scroller}
      className={classes.window}
      role="group"
      aria-label={t("view.generations")}
      aria-describedby={hint}
    >
      <div className={classes.spread} style={spread}>
        <div className={classes.canvas} style={style} onKeyDown={onKeyDown}>
          <Lines
            links={layout.links}
            width={layout.width}
            height={layout.height}
            corners={corners}
          />
          {layout.order.map((key) => {
            const card = layout.cards.find((one) => one.key === key);
            return (
              card && (
                <PersonCard key={key} card={card} words={words} isFocus={key === layout.focus} />
              )
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Room on each side, in units of the layout, for the person to stand in the middle. */
function roomAround(
  layout: GenerationsLayout,
  focus: GenerationsCard | undefined,
  { width, height }: Size,
): { left: number; right: number; top: number; bottom: number } {
  const margin = generationsMetrics.gapX;
  if (focus === undefined) return { left: margin, right: margin, top: margin, bottom: margin };
  const [x, y] = [focus.x + focus.w / 2, focus.y + focus.h / 2];
  return {
    left: Math.max(margin, width / 2 - x),
    right: Math.max(margin, width / 2 - (layout.width - x)),
    top: Math.max(0, height / 2 - y),
    bottom: Math.max(0, height / 2 - (layout.height - y)),
  };
}

/** The size of an element in units of the layout, which are pixels of a page whose text is 16 px. */
function useSize(ref: React.RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return undefined;
    const read = (): void => {
      const unit = Number.parseFloat(getComputedStyle(element).fontSize) / 16 || 1;
      const width = Math.round(element.clientWidth / unit);
      const height = Math.round(element.clientHeight / unit);
      setSize((last) =>
        last.width === width && last.height === height ? last : { width, height },
      );
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

type PersonCardProps = { card: GenerationsCard; words: Words; isFocus: boolean };

function PersonCard({ card, words, isFocus }: PersonCardProps) {
  const { snapshot } = useData();
  const labelOf = useCardLabel();
  const person = kinOf(snapshot).person(card.person);
  if (person === undefined) return null;
  const { key, x, y, w, h, direct, lines } = card;
  const style = {
    transform: `translate(${rem(x)}, ${rem(y)})`,
    width: rem(w),
    height: rem(h),
    "--branch": words.ink(person.branch),
  } as CSSProperties;
  const label = labelOf(person, words, { direct });
  const href = isFocus
    ? hrefOf({ screen: "person", person: person.id })
    : hrefOf({ screen: "generations", person: person.id });
  return (
    <div
      className={classes.card}
      data-key={key}
      data-direct={direct || undefined}
      data-focus={isFocus || undefined}
      style={style}
    >
      <Link
        className={classes.name}
        href={href}
        data-press={key}
        aria-current={isFocus ? "true" : undefined}
      >
        <CardLines label={label} lines={lines} words={words} person={person} />
      </Link>
      <ApartLinks
        lines={lines}
        className={classes.apart}
        hrefOf={(other) => hrefOf({ screen: "generations", person: other.id })}
      />
    </div>
  );
}
