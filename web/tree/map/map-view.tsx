import { useComputedColorScheme } from "@mantine/core";
import {
  type KeyboardEvent,
  memo,
  type PointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { TreeSnapshot } from "../../../src/shared/tree";
import { useLanguage } from "../../app/language";
import { Link } from "../../app/router";
import { CardLines } from "../card-lines";
import type { BranchMap, MapCard } from "../layout/branch-map";
import { cardIndex } from "../layout/hit";
import { type Arrow, mapKeys } from "../layout/keys";
import { kinOf } from "../layout/kin";
import { barOf, mapText } from "../layout/map-text";
import { personKey } from "../layout/types";
import { prefersStill } from "../moving";
import { measure, rem } from "../type";
import type { Words } from "../words";
import { listen } from "./gestures";
import classes from "./map-view.module.css";
import { type Drawing, drawingOf, type Paint, paint, paintWhole } from "./paint";
import { between, hold, pan, reveal, type Size, type View, windowOnWhole, zoom } from "./view";

type Goal = (map: BranchMap, window: Size) => View;

/** A view to go to. The same object is gone to once. */
export type Target = { view: Goal; isSmooth: boolean };

export type MapViewProps = {
  snapshot: TreeSnapshot;
  map: BranchMap;
  words: Words;
  chosen: string | null;
  target: Target;
  label: string;
  describedBy: string;
  /** Where a page of the strip leads, and the people a reference stands for, and a person. */
  hrefOfPage: (branch: string | null) => string;
  hrefOfReference: (person: string) => string;
  hrefOfPerson: (person: string) => string;
  /** The view has come to rest. */
  onRest: (view: View, window: Size) => void;
};

const moveTime = 200;
/** Cards this far outside the window are there already. */
const ahead = 240;

/**
 * The canvas of all branches: names as real links over lines painted on a canvas, the heads of the
 * pages kept to the top of the window, and above it the strip of the whole family with the window
 * marked on it. Nothing goes through React while the canvas moves.
 */
export function MapView(props: MapViewProps) {
  const { snapshot, map, words, chosen, target, label, describedBy, onRest } = props;
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const heads = useRef<HTMLDivElement>(null);
  const mark = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [seen, setSeen] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const colorScheme = useComputedColorScheme("light");
  const colors = useColors(root, words, chosen, snapshot, colorScheme);
  const drawing = useMemo(
    () => (colors === null || typeof Path2D === "undefined" ? null : drawingOf(map, colors, null)),
    [map, colors],
  );

  // From the thirteenth branch on the inks repeat, and the head gets a double rule.
  const double = useMemo(
    () => new Set(snapshot.branches.slice(12).map(({ id }) => id)),
    [snapshot],
  );
  const view = useRef<View | null>(null);
  const state = useRef({ map, size, drawing, colors, onRest });
  state.current = { map, size, drawing, colors, onRest };

  const show = useCallback((next: View): void => {
    const { map: own, size: window, drawing: drawn, colors: inks } = state.current;
    if (window === null) return;
    const held = hold(next, own, window);
    view.current = held;
    placeWorld(world.current, held, window);
    placeHeads(heads.current, own, held, window);
    placeMark(mark.current, own, held, window);
    const left = window.w / 2 - held.x * held.k;
    const top = window.h / 2 - held.y * held.k;
    setSeen((old) => {
      const here = {
        x: -left / held.k,
        y: -top / held.k,
        w: window.w / held.k,
        h: window.h / held.k,
      };
      const isInside =
        old !== null &&
        here.x >= old.x &&
        here.y >= old.y &&
        here.x + here.w <= old.x + old.w &&
        here.y + here.h <= old.y + old.h &&
        old.w <= here.w + 6 * ahead;
      if (isInside) return old;
      return { x: here.x - ahead, y: here.y - ahead, w: here.w + 2 * ahead, h: here.h + 2 * ahead };
    });
    const brush = canvas.current?.getContext("2d");
    if (brush && drawn !== null && inks !== null && canvas.current !== null) {
      const unit = canvas.current.width / window.w;
      paint(brush, drawn, { view: held, window, unit, colors: inks });
    }
  }, []);

  const frame = useRef(0);
  const request = useCallback(
    (next: View): void => {
      view.current = next;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => show(next));
    },
    [show],
  );
  const stop = useCallback((): void => cancelAnimationFrame(frame.current), []);
  const rest = useCallback((at: View): void => {
    const { size: window, onRest: told } = state.current;
    if (window !== null) told(at, window);
  }, []);
  const goTo = useCallback(
    (goal: View | Goal, isSmooth: boolean): void => {
      cancelAnimationFrame(frame.current);
      const { map: own, size: window } = state.current;
      if (window === null) return;
      const from = view.current;
      const to = hold(typeof goal === "function" ? goal(own, window) : goal, own, window);
      if (from === null || !isSmooth || prefersStill()) {
        show(to);
        rest(to);
        return;
      }
      const begun = performance.now();
      const step = (): void => {
        const share = Math.min(1, (performance.now() - begun) / moveTime);
        show(between(from, to, 1 - (1 - share) ** 3));
        if (share < 1) frame.current = requestAnimationFrame(step);
        else rest(to);
      };
      frame.current = requestAnimationFrame(step);
    },
    [show, rest],
  );

  // The window of the canvas, in units of the text.
  useLayoutEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    const read = (): void => {
      const unit = unitOf();
      const { clientWidth, clientHeight } = element;
      const next = { w: (clientWidth || 1000) / unit, h: (clientHeight || 600) / unit };
      const dots = Math.min(window.devicePixelRatio || 1, 2);
      const [width, height] = [next.w, next.h].map((side) => Math.round(side * unit * dots));
      // A canvas given a size loses its picture, the same size too.
      if (
        canvas.current !== null &&
        (canvas.current.width !== width || canvas.current.height !== height)
      ) {
        canvas.current.width = width ?? 0;
        canvas.current.height = height ?? 0;
      }
      setSize((old) => (old?.w === next.w && old.h === next.h ? old : next));
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const shown = useRef<{ target: Target; map: BranchMap; size: Size } | null>(null);
  useLayoutEffect(() => {
    if (size === null) return;
    const before = shown.current;
    shown.current = { target, map, size };
    const now = view.current;
    if (before === null || now === null) goTo(target.view, false);
    else if (before.target !== target) goTo(target.view, target.isSmooth);
    else show(now);
  }, [target, map, size, drawing, goTo, show]);

  // What React has just put on the page has no place yet.
  useLayoutEffect(() => {
    if (view.current === null || size === null) return;
    placeWorld(world.current, view.current, size);
    placeHeads(heads.current, map, view.current, size);
    placeMark(mark.current, map, view.current, size);
  });

  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    return listen(element, {
      begin: stop,
      release: () => undefined,
      pan: (dx, dy) => {
        const unit = unitOf();
        if (view.current !== null) request(pan(view.current, dx / unit, dy / unit));
      },
      zoom: (factor, px, py) => {
        const { size: window } = state.current;
        const unit = unitOf();
        if (view.current === null || window === null) return;
        request(zoom(view.current, factor, window, px / unit, py / unit));
      },
      rest: () => {
        if (view.current !== null) rest(view.current);
      },
    });
  }, [request, stop, rest]);
  useEffect(() => stop, [stop]);

  return (
    <div className={classes.frame}>
      <Whole
        {...props}
        ref={mark}
        goTo={goTo}
        view={view}
        size={size}
        glide={request}
        settle={() => {
          if (view.current !== null) rest(view.current);
        }}
      />
      <div
        ref={root}
        className={classes.window}
        data-canvas
        role="group"
        aria-label={label}
        aria-describedby={describedBy}
        onScroll={({ currentTarget }) => {
          // A browser scrolls to what has the focus; the view moves there itself.
          currentTarget.scrollTop = 0;
          currentTarget.scrollLeft = 0;
        }}
      >
        <canvas ref={canvas} className={classes.canvas} aria-hidden="true" />
        {seen !== null && (
          <div ref={world} className={classes.world}>
            <People {...props} seen={seen} view={view} goTo={goTo} size={size} />
          </div>
        )}
        <div ref={heads} className={classes.heads} aria-hidden="true">
          {map.pages.map(({ branch, people }) => (
            <div
              key={branch ?? "none"}
              className={classes.page}
              style={{ color: words.ink(branch) }}
            >
              <span className={classes.title} data-double={double.has(branch ?? "") || undefined}>
                <span>
                  <b>{words.page(branch)}</b> <i>{people}</i>
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const unitOf = (): number =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;

type MovingProps = {
  view: React.RefObject<View | null>;
  goTo: (view: View | Goal, isSmooth: boolean) => void;
  size: Size | null;
};

/**
 * The strip of the whole family over the canvas: every page in proportion, every person a bar in
 * the ink of the branch, the direct line, and a frame where the window is. A press or a drag moves
 * the window there; the names of the branches are links to their pages.
 */
function Whole(
  props: MapViewProps &
    MovingProps & {
      ref: React.Ref<HTMLDivElement>;
      /** Moves the window and leaves the address alone, while a finger drags. */
      glide: (view: View) => void;
      /** The drag is over: the address follows. */
      settle: () => void;
    },
) {
  const { ref, map, words, snapshot, chosen, hrefOfPage, view, size, glide, settle } = props;
  const { t } = useLanguage();
  const box = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const colorScheme = useComputedColorScheme("light");
  const colors = useColors(box, words, chosen, snapshot, colorScheme);
  const drawing = useMemo((): Drawing | null => {
    if (colors === null || typeof Path2D === "undefined") return null;
    const kin = kinOf(snapshot);
    const lengthOf = (card: MapCard): number => {
      const ids = card.person === null ? (card.reference?.people ?? []) : [card.person];
      const person = kin.person(ids[0] ?? "");
      return person === undefined ? card.w : barOf(words.person(person), map, measure);
    };
    return drawingOf(map, colors, lengthOf);
  }, [map, colors, words, snapshot]);

  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return undefined;
    const read = (): void => setWidth(element.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    const element = canvas.current;
    const brush = element?.getContext("2d");
    if (!brush || element == null || drawing === null || colors === null || width === 0) return;
    const dots = Math.min(window.devicePixelRatio || 1, 2);
    const height = element.clientHeight;
    element.width = Math.round(width * dots);
    element.height = Math.round(height * dots);
    const scale: [number, number] = [
      (width * dots) / Math.max(1, map.width),
      (height * dots) / Math.max(1, map.height),
    ];
    paintWhole(brush, drawing, {
      size: { w: element.width, h: element.height, dots },
      scale,
      colors,
    });
  }, [drawing, colors, width, map]);

  // A place on the picture of the strip is a place on the canvas.
  const to = (event: PointerEvent<HTMLElement>): void => {
    const element = picture.current;
    if (element === null || size === null) return;
    const { left, top, width: across, height: down } = element.getBoundingClientRect();
    const share = (value: number) => Math.min(1, Math.max(0, value));
    const x = share((event.clientX - left) / across) * map.width;
    const y = share((event.clientY - top) / down) * map.height;
    glide({ x, y, k: view.current?.k ?? 1 });
  };
  return (
    <div className={classes.whole}>
      <div
        ref={box}
        className={classes.strip}
        data-whole
        onPointerDown={(event) => {
          if (event.button !== 0 || (event.target as Element).closest("a") !== null) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          to(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) to(event);
        }}
        onLostPointerCapture={settle}
      >
        <div ref={picture} className={classes.picture}>
          <canvas ref={canvas} className={classes.stripCanvas} aria-hidden="true" />
          <div ref={ref} className={classes.mark} aria-hidden="true" data-mark />
        </div>
        <nav className={classes.branches} aria-label={t("map.whole")}>
          {map.pages.map(({ branch, people, x, w }) => (
            <Link
              key={branch ?? "none"}
              href={hrefOfPage(branch)}
              className={classes.branch}
              style={{
                left: `${(x / Math.max(1, map.width)) * 100}%`,
                width: `${(w / Math.max(1, map.width)) * 100}%`,
                color: words.ink(branch),
              }}
            >
              <span>{words.page(branch)}</span> <i>{people}</i>
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

const arrows: Partial<Record<string, Arrow>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Names as real links, those near the window and the one with the focus. */
function People(
  props: MapViewProps & MovingProps & { seen: { x: number; y: number; w: number; h: number } },
) {
  const { map, words, snapshot, chosen, seen, view, goTo, size } = props;
  const { hrefOfPerson, hrefOfReference } = props;
  const box = useRef<HTMLDivElement>(null);
  const index = useMemo(() => cardIndex(map.cards), [map]);
  const byKey = useMemo(() => new Map(map.cards.map((card) => [card.key, card])), [map]);
  const move = useMemo(() => mapKeys(map), [map]);
  const cameFrom = useRef<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [isAsked, setAsked] = useState(false);

  // One of the links is in the order of the keys: where one was, the chosen person, or the middle.
  const own = chosen === null ? undefined : byKey.get(personKey(chosen));
  const at = view.current ?? { x: seen.x + seen.w / 2, y: seen.y + seen.h / 2 };
  const middle = index.at(at.x, at.y, 600);
  const isNear = (card: MapCard | undefined): card is MapCard =>
    card !== undefined &&
    card.x < seen.x + seen.w &&
    card.x + card.w > seen.x &&
    card.y < seen.y + seen.h &&
    card.y + card.h > seen.y;
  const remembered = byKey.get(current ?? "");
  const stop =
    remembered ??
    (isNear(own) ? own : middle?.person === null ? undefined : middle) ??
    own ??
    map.cards.find(({ person }) => person !== null);

  const shown = index.within(seen);
  if (stop !== undefined && !shown.includes(stop)) shown.push(stop);
  shown.sort((a, b) => a.page - b.page || a.row - b.row || a.x - b.x || a.y - b.y);

  const bring = (card: MapCard): void => {
    if (view.current === null || size === null) return;
    const next = reveal(view.current, card, size, map.metrics.head);
    if (next.x !== view.current.x || next.y !== view.current.y) goTo(next, true);
  };
  useEffect(() => {
    if (!isAsked || current === null) return;
    setAsked(false);
    box.current
      ?.querySelector<HTMLElement>(`[data-press="${CSS.escape(current)}"]`)
      ?.focus({ preventScroll: true });
  }, [isAsked, current]);

  // A card that stays as it was must not bring itself into a window that was.
  const focused = useRef<((card: MapCard) => void) | null>(null);
  focused.current = (card) => {
    setCurrent(card.key);
    bring(card);
  };
  const onFocus = useCallback((card: MapCard): void => focused.current?.(card), []);

  const onKeyDown = (event: KeyboardEvent): void => {
    const arrow = arrows[event.key];
    const key = (event.target as HTMLElement).dataset["press"];
    if (arrow === undefined || key === undefined) return;
    event.preventDefault();
    const next = byKey.get(move(key, arrow, cameFrom.current) ?? "");
    if (next === undefined) return;
    cameFrom.current = key;
    setCurrent(next.key);
    setAsked(true);
    bring(next);
  };

  return (
    <div ref={box} onKeyDown={onKeyDown}>
      {shown.map((card) => (
        <PersonOnMap
          key={card.key}
          card={card}
          map={map}
          words={words}
          snapshot={snapshot}
          isChosen={card.person !== null && card.person === chosen}
          isStop={card === stop}
          hrefOfPerson={hrefOfPerson}
          hrefOfReference={hrefOfReference}
          onFocus={onFocus}
        />
      ))}
    </div>
  );
}

type PersonOnMapProps = Pick<
  MapViewProps,
  "words" | "snapshot" | "hrefOfPerson" | "hrefOfReference"
> & {
  card: MapCard;
  map: BranchMap;
  isChosen: boolean;
  isStop: boolean;
  onFocus: (card: MapCard) => void;
};

const PersonOnMap = memo(
  function PersonOnMap({
    card,
    map,
    words,
    snapshot,
    isChosen,
    isStop,
    ...rest
  }: PersonOnMapProps) {
    const { t } = useLanguage();
    const { key, reference, isSpouse, direct } = card;
    const person = card.person === null ? undefined : kinOf(snapshot).person(card.person);
    const lines = useMemo(
      () => mapText(card, { map, measure, wording: words.onMap, person: kinOf(snapshot).person }),
      [card, map, words, snapshot],
    );
    const end = Math.max(...lines.map(({ x, w }) => x + w), 0);
    const style = {
      left: rem(card.x),
      top: rem(card.y),
      width: rem(isChosen ? Math.min(card.w, end) : card.w),
      height: rem(card.h),
    };
    const [first] = reference?.people ?? [];
    if (reference !== undefined && first !== undefined) {
      const { title, detail } = words.onMap.reference(reference);
      return (
        <Link
          className={classes.person}
          href={rest.hrefOfReference(first)}
          tabIndex={-1}
          style={style}
        >
          <CardLines
            label={`${title} ${detail}`}
            lines={lines}
            words={words}
            person={null}
            ink={words.ink(reference.page)}
          />
        </Link>
      );
    }
    if (person === undefined) return null;
    const name = words.name(person);
    const label = [
      isSpouse ? t("tree.partner", { name }) : name,
      words.years(person),
      words.branch(person.branch),
      ...(direct ? [t("tree.direct")] : []),
    ].join(", ");
    return (
      <Link
        className={classes.person}
        href={rest.hrefOfPerson(person.id)}
        data-press={key}
        data-chosen={isChosen || undefined}
        tabIndex={isStop ? 0 : -1}
        aria-current={isChosen ? "true" : undefined}
        style={style}
        onFocus={({ target }) => {
          if (target.matches(":focus-visible")) rest.onFocus(card);
        }}
      >
        <CardLines
          label={label}
          lines={lines}
          words={words}
          person={person}
          isSpouse={isSpouse}
          ring={lines[0]?.x ?? 0}
        />
      </Link>
    );
  },
  (a, b) =>
    a.card === b.card &&
    a.words === b.words &&
    a.isChosen === b.isChosen &&
    a.isStop === b.isStop &&
    a.hrefOfReference === b.hrefOfReference,
);

function placeWorld(world: HTMLElement | null, { x, y, k }: View, window: Size): void {
  if (world === null) return;
  const [left, top] = [window.w / 2 - x * k, window.h / 2 - y * k];
  world.style.transform = `translate(${rem(left)}, ${rem(top)}) scale(${k})`;
}

/** The head of a page keeps to the top of the window, and to its left edge while the page is in it. */
function placeHeads(box: HTMLElement | null, map: BranchMap, view: View, window: Size): void {
  if (box === null) return;
  const { k } = view;
  const left = window.w / 2 - view.x * k;
  map.pages.forEach((page, i) => {
    const element = box.children[i] as HTMLElement | undefined;
    const title = element?.firstElementChild as HTMLElement | null | undefined;
    if (element === undefined || !title) return;
    const [x, w] = [left + page.x * k, page.w * k];
    const isSeen = x < window.w && x + w > 0;
    element.style.visibility = isSeen ? "" : "hidden";
    element.style.transform = `translate(${rem(x)}, 0)`;
    element.style.width = rem(w);
    const aside = Math.min(Math.max(0, -x), Math.max(0, w - 160));
    title.style.paddingLeft = rem(aside);
  });
}

/** The frame of the window on the strip of the whole. */
function placeMark(mark: HTMLElement | null, map: BranchMap, view: View, window: Size): void {
  if (mark === null) return;
  const { x, y, w, h } = windowOnWhole(view, map, window);
  mark.style.left = `${x * 100}%`;
  mark.style.top = `${y * 100}%`;
  mark.style.width = `${w * 100}%`;
  mark.style.height = `${h * 100}%`;
}

/** The inks of the theme as the canvas needs them. */
function useColors(
  root: React.RefObject<HTMLElement | null>,
  words: Words,
  chosen: string | null,
  snapshot: TreeSnapshot,
  colorScheme: string,
): Paint | null {
  const [colors, setColors] = useState<Paint | null>(null);
  useLayoutEffect(() => {
    if (root.current === null) return;
    const style = getComputedStyle(root.current);
    const values = new Map<string, string>();
    const valueOf = (variable: string): string => {
      const name = variable.replace(/^var\((.*)\)$/, "$1");
      let value = values.get(name);
      if (value === undefined) values.set(name, (value = style.getPropertyValue(name).trim()));
      return value;
    };
    const kin = kinOf(snapshot);
    const ink = valueOf("--ink");
    const rule = valueOf("--rule");
    setColors({
      surface: valueOf("--surface"),
      ink,
      rule,
      inkOf: ({ person, reference }) => {
        if (person !== null && person === chosen) return ink;
        if (reference !== undefined) return valueOf(words.ink(reference.page));
        const branch = person === null ? null : (kin.person(person)?.branch ?? null);
        return branch === null ? rule : valueOf(words.ink(branch));
      },
    });
  }, [root, words, chosen, snapshot, colorScheme]);
  return colors;
}
