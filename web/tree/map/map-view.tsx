import { useComputedColorScheme } from "@mantine/core";
import {
  type KeyboardEvent,
  memo,
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
import type { BranchMap, MapCard, MapLevel } from "../layout/branch-map";
import { cardIndex } from "../layout/hit";
import { type Arrow, mapKeys, pageKeys } from "../layout/keys";
import { kinOf } from "../layout/kin";
import { barOf, mapText } from "../layout/map-text";
import { personKey } from "../layout/types";
import { prefersStill } from "../moving";
import { measure, rem } from "../type";
import type { Words } from "../words";
import { listen } from "./gestures";
import classes from "./map-view.module.css";
import { type Drawing, drawingOf, type Paint, paint } from "./paint";
import {
  between,
  fit,
  hold,
  isNarrow,
  type Maps,
  pan,
  reveal,
  settle,
  type Size,
  spotOf,
  toLevel,
  type View,
  viewOfSpot,
  zoom,
} from "./view";

/** A view to go to. The same object is gone to once. */
export type Target = { view: (maps: Maps, window: Size) => View; isSmooth: boolean };

export type MapViewProps = {
  snapshot: TreeSnapshot;
  maps: Maps;
  words: Words;
  chosen: string | null;
  target: Target;
  label: string;
  describedBy: string;
  /** Where a page leads, and the people a reference stands for, and a person. */
  hrefOfPage: (branch: string | null) => string;
  hrefOfReference: (person: string, level: MapLevel) => string;
  hrefOfPerson: (person: string) => string;
  /** The view has come to rest. */
  onRest: (view: View, window: Size) => void;
  /** Esc: one step further away. */
  onAway: (view: View, window: Size) => void;
};

const zoomTime = 200;
/** Cards this far outside the window are there already. */
const ahead = 240;
const levels: MapLevel[] = ["far", "closer", "near"];

export function MapView(props: MapViewProps) {
  const { snapshot, maps, words, chosen, target, label, describedBy, onRest, onAway } = props;
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<HTMLDivElement>(null);
  const heads = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [level, setLevel] = useState<MapLevel>("far");
  const [seen, setSeen] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const colorScheme = useComputedColorScheme("light");
  const colors = useColors(root, words, chosen, snapshot, colorScheme);
  const drawings = useMemo(
    () => (colors === null ? null : drawingsOf(maps, words, snapshot, colors)),
    [maps, words, snapshot, colors],
  );

  const view = useRef<View | null>(null);
  const sameLevel = useRef<MapLevel | null>(null);
  /** The focus was on something that a change of the level took away. */
  const isFocusLost = useRef(false);
  const lastPage = useRef(0);
  const [rests, setRests] = useState(0);
  const state = useRef({ maps, size, drawings, colors, onRest });
  state.current = { maps, size, drawings, colors, onRest };

  /** Puts everything where the view says. Nothing here goes through React while the map moves. */
  const show = useCallback((next: View): void => {
    const { maps: own, size: window, drawings: drawn, colors: inks } = state.current;
    if (window === null) return;
    const map = own[next.level];
    const held = hold(next, map, window);
    view.current = held;
    if (sameLevel.current !== held.level && root.current?.contains(document.activeElement)) {
      isFocusLost.current = document.activeElement !== root.current;
    }
    setLevel(held.level);
    const left = window.w / 2 - held.x * held.k;
    const top = window.h / 2 - held.y * held.k;
    placeWorld(world.current, held, window);
    placeHeads(heads.current, map, held, window);
    // A window of cards is kept until the view comes to its edge.
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
      if (isInside && sameLevel.current === held.level) return old;
      sameLevel.current = held.level;
      return { x: here.x - ahead, y: here.y - ahead, w: here.w + 2 * ahead, h: here.h + 2 * ahead };
    });
    const brush = canvas.current?.getContext("2d");
    if (brush && drawn !== null && inks !== null && canvas.current !== null) {
      const unit = canvas.current.width / window.w;
      paint(brush, drawn[held.level], { view: held, window, unit, colors: inks });
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
  const goTo = useCallback(
    (end: View, isSmooth: boolean): void => {
      cancelAnimationFrame(frame.current);
      const { maps: own, size: window } = state.current;
      const from = view.current;
      if (window === null) return;
      const to = hold(end, own[end.level], window);
      const rest = (): void => {
        show(to);
        setRests((count) => count + 1);
        state.current.onRest(to, window);
      };
      if (from === null || !isSmooth || prefersStill()) {
        rest();
        return;
      }
      // On the level it ends on, beginning as large as it is.
      const ratio = own[from.level].metrics.w / own[to.level].metrics.w;
      const about = { maps: own, window, px: window.w / 2, py: window.h / 2 };
      const start = toLevel(from, to.level, from.k * ratio, about);
      const begun = performance.now();
      const step = (): void => {
        const share = Math.min(1, (performance.now() - begun) / zoomTime);
        if (share === 1) {
          rest();
          return;
        }
        show(between(start, to, 1 - (1 - share) ** 3));
        frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    },
    [show],
  );

  // The window of the map, in units of the text.
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

  const shown = useRef<{ target: Target; maps: Maps; size: Size } | null>(null);
  useLayoutEffect(() => {
    if (size === null) return;
    const before = shown.current;
    shown.current = { target, maps, size };
    const now = view.current;
    if (before === null || now === null) goTo(target.view(maps, size), false);
    else if (before.target !== target) goTo(target.view(maps, size), target.isSmooth);
    else if (before.maps !== maps || before.size !== size)
      goTo(kept(now, before, shown.current), false);
    else show(now);
  }, [target, maps, size, drawings, goTo, show]);

  // What React has just put on the page has no place yet.
  useLayoutEffect(() => {
    if (view.current === null || size === null || view.current.level !== level) return;
    placeWorld(world.current, view.current, size);
    placeHeads(heads.current, maps[level], view.current, size);
  });

  // Whoever walks by keys goes on from the place where the levels changed.
  useEffect(() => {
    if (!isFocusLost.current) return;
    isFocusLost.current = false;
    const all = root.current?.querySelectorAll<HTMLElement>("a[href]");
    const links = [...(all ?? [])];
    const next =
      view.current?.level === "far"
        ? links[lastPage.current]
        : links.find(({ tabIndex }) => tabIndex === 0);
    next?.focus({ preventScroll: true });
  }, [rests]);

  useEffect(() => {
    const element = root.current;
    if (element === null) return undefined;
    let direction: "in" | "out" = "in";
    const about = (px: number, py: number) => {
      const { maps: own, size: window } = state.current;
      const unit = unitOf();
      return window && { maps: own, window, px: px / unit, py: py / unit };
    };
    return listen(element, {
      begin: stop,
      pan: (dx, dy) => {
        const unit = unitOf();
        if (view.current !== null) request(pan(view.current, dx / unit, dy / unit));
      },
      zoom: (factor, px, py) => {
        const at = about(px, py);
        if (view.current === null || at === null) return;
        direction = factor > 1 ? "in" : "out";
        request(zoom(view.current, factor, at));
      },
      rest: (px, py) => {
        const at = about(px, py);
        if (view.current === null || at === null) return;
        const end = settle(view.current, direction, at);
        const isSmooth = end !== view.current;
        goTo(end, isSmooth);
      },
    });
  }, [goTo, request, stop]);
  useEffect(() => stop, [stop]);

  const map = maps[level];
  return (
    <div
      ref={root}
      className={classes.window}
      role="group"
      aria-label={label}
      aria-describedby={describedBy}
      data-level={level}
      onScroll={({ currentTarget }) => {
        // A browser scrolls to what has the focus; the view moves there itself.
        currentTarget.scrollTop = 0;
        currentTarget.scrollLeft = 0;
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || view.current === null || size === null) return;
        onAway(view.current, size);
      }}
    >
      <canvas ref={canvas} className={classes.canvas} aria-hidden="true" />
      {level !== "far" && seen !== null && (
        <div ref={world} className={classes.world}>
          <People
            {...props}
            key={level}
            map={map}
            seen={seen}
            view={view}
            goTo={goTo}
            size={size}
            lastPage={lastPage}
          />
        </div>
      )}
      <Pages {...props} map={map} ref={heads} view={view} goTo={goTo} size={size} />
    </div>
  );
}

/** The same place after the map or the window changed. */
function kept(
  view: View,
  before: { maps: Maps; size: Size },
  now: { maps: Maps; size: Size },
): View {
  if (view.level === "far") {
    const whole = fit(before.maps.far, before.size, isNarrow(before.size));
    if (Math.abs(whole.k / view.k - 1) < 0.01)
      return fit(now.maps.far, now.size, isNarrow(now.size));
  }
  const spot = spotOf(view, before.maps[view.level]);
  const same = spot && viewOfSpot(spot, view.level, view.k, now.maps[view.level]);
  return same ?? view;
}

const unitOf = (): number =>
  Number.parseFloat(getComputedStyle(document.documentElement).fontSize) / 16 || 1;

type MovingProps = {
  map: BranchMap;
  view: React.RefObject<View | null>;
  goTo: (view: View, isSmooth: boolean) => void;
  size: Size | null;
};

const arrows: Partial<Record<string, Arrow>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

/** Names as real links, those that are near the window and the one with the focus. */
function People(
  props: MapViewProps &
    MovingProps & {
      seen: { x: number; y: number; w: number; h: number };
      lastPage: React.RefObject<number>;
    },
) {
  const { map, words, snapshot, chosen, seen, view, goTo, size } = props;
  const { hrefOfPerson, hrefOfReference, lastPage } = props;
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
          onFocus={() => {
            lastPage.current = card.page;
            setCurrent(card.key);
            bring(card);
          }}
        />
      ))}
    </div>
  );
}

type PersonOnMapProps = Pick<
  MapViewProps,
  "words" | "snapshot" | "hrefOfPerson" | "hrefOfReference"
> & { card: MapCard; map: BranchMap; isChosen: boolean; isStop: boolean; onFocus: () => void };

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
          href={rest.hrefOfReference(first, map.level)}
          tabIndex={-1}
          aria-label={`${title} ${detail}`}
          style={style}
        >
          <CardLines lines={lines} words={words} person={null} ink={words.ink(reference.page)} />
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
        aria-label={label}
        aria-current={isChosen ? "true" : undefined}
        style={style}
        onFocus={({ target }) => {
          if (target.matches(":focus-visible")) rest.onFocus();
        }}
      >
        <CardLines
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
    a.card === b.card && a.words === b.words && a.isChosen === b.isChosen && a.isStop === b.isStop,
);

/** The heads of the pages stand over the drawing and do not shrink with it. */
function Pages(props: MapViewProps & MovingProps & { ref: React.Ref<HTMLDivElement> }) {
  const { ref, map, words, snapshot, hrefOfPage, view, goTo, size } = props;
  const [current, setCurrent] = useState(0);
  const move = useMemo(() => pageKeys(map), [map]);
  const links = useRef<(HTMLAnchorElement | null)[]>([]);
  const isFar = map.level === "far";
  const double = new Set(snapshot.branches.slice(12).map(({ id }) => id));
  const stop = current < map.pages.length ? current : 0;

  const onKeyDown = (event: KeyboardEvent): void => {
    const arrow = arrows[event.key];
    if (arrow === undefined || !isFar) return;
    event.preventDefault();
    const next = move(stop, arrow);
    if (next === null) return;
    setCurrent(next);
    links.current[next]?.focus({ preventScroll: true });
  };
  const bring = (page: number): void => {
    const box = map.pages[page];
    if (box === undefined || view.current === null || size === null) return;
    const next = reveal(view.current, { ...box.head, w: box.w }, size, 0);
    if (next.x !== view.current.x || next.y !== view.current.y) goTo(next, true);
  };
  return (
    <div ref={ref} className={classes.heads} onKeyDown={onKeyDown}>
      {map.pages.map(({ branch, people }, i) => {
        const text = (
          <span className={classes.title} data-double={double.has(branch ?? "") || undefined}>
            <span>
              <b>{words.page(branch)}</b> <i>{people}</i>
            </span>
          </span>
        );
        const style = { color: words.ink(branch) };
        return isFar ? (
          <Link
            key={branch ?? ""}
            ref={(link) => {
              links.current[i] = link;
            }}
            className={classes.page}
            href={hrefOfPage(branch)}
            tabIndex={i === stop ? 0 : -1}
            style={style}
            onFocus={({ target }) => {
              setCurrent(i);
              if (target.matches(":focus-visible")) bring(i);
            }}
          >
            {text}
          </Link>
        ) : (
          <div key={branch ?? ""} className={classes.page} style={style}>
            {text}
          </div>
        );
      })}
    </div>
  );
}

function placeWorld(world: HTMLElement | null, { x, y, k }: View, window: Size): void {
  if (world === null) return;
  const [left, top] = [window.w / 2 - x * k, window.h / 2 - y * k];
  world.style.transform = `translate(${rem(left)}, ${rem(top)}) scale(${k})`;
}

/** A head keeps to the edge of the window as long as its page is in it. */
function placeHeads(box: HTMLElement | null, map: BranchMap, view: View, window: Size): void {
  if (box === null) return;
  const { k } = view;
  const left = window.w / 2 - view.x * k;
  const top = window.h / 2 - view.y * k;
  map.pages.forEach((page, i) => {
    const element = box.children[i] as HTMLElement | undefined;
    const title = element?.firstElementChild as HTMLElement | null | undefined;
    if (element === undefined || !title) return;
    const [x, y, w, h] = [left + page.x * k, top + page.y * k, page.w * k, page.h * k];
    const isSeen = x < window.w && x + w > 0 && y < window.h && y + h > 0;
    element.style.visibility = isSeen || map.level === "far" ? "" : "hidden";
    element.style.transform = `translate(${rem(x)}, ${rem(y)})`;
    element.style.width = rem(w);
    element.style.height = rem(h);
    title.style.height = rem(page.head.h * k);
    if (map.level === "far") return;
    const stuck = Math.min(Math.max(0, -y), Math.max(0, h - page.head.h * k));
    const aside = Math.min(Math.max(0, -x), Math.max(0, w - 160));
    title.style.transform = stuck === 0 ? "" : `translateY(${rem(stuck)})`;
    title.style.paddingLeft = rem(aside);
    title.style.maxWidth = "";
  });
}

function drawingsOf(
  maps: Maps,
  words: Words,
  snapshot: TreeSnapshot,
  colors: Paint,
): Record<MapLevel, Drawing> | null {
  // A browser without a canvas still has the names and the list.
  if (typeof Path2D === "undefined") return null;
  const kin = kinOf(snapshot);
  const lengthOf = (card: MapCard): number => {
    const ids = card.person === null ? (card.reference?.people ?? []) : [card.person];
    const person = kin.person(ids[0] ?? "");
    return person === undefined ? card.w : barOf(words.person(person), maps.far, measure);
  };
  const [far, closer, near] = levels.map((level) =>
    drawingOf(maps[level], colors, level === "far" ? lengthOf : null),
  );
  return { far, closer, near } as Record<MapLevel, Drawing>;
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
