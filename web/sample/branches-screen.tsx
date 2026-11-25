import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useArrival } from "../app/arrival";
import { CloseIcon } from "../app/icons";
import { useLanguage } from "../app/language";
import { Message } from "../app/message";
import { go, Link } from "../app/router";
import { isPhone, usePage } from "../app/use-page";
import type { MapLevel } from "../tree/layout/branch-map";
import { Legend } from "../tree/lines";
import { MapView, type Target } from "../tree/map/map-view";
import { useMaps } from "../tree/map/use-maps";
import {
  fit,
  isNarrow,
  isWhole,
  type Maps,
  restingScale,
  type Size,
  spotOf,
  toLevel,
  type View,
  viewOfPage,
  viewOfPerson,
  viewOfSpot,
} from "../tree/map/view";
import classes from "./branches-screen.module.css";
import { useData } from "./data";
import { rememberTree } from "./last-tree";
import { type BranchesPlace, branchesPlace, hrefOf, treePlace } from "./places";

const levels: MapLevel[] = ["far", "closer", "near"];

export function BranchesScreen({ place }: { place: BranchesPlace }) {
  const { t } = useLanguage();
  const { snapshot, start } = useData();
  const heading = useArrival<HTMLHeadingElement>();
  const page = usePage();
  const [latest, setLatest] = useState<Latest | null>(null);
  const hint = useId();
  // Two pages in a row on the phone, three when there are many. A window that is not wide has less
  // of them in a row than the book.
  const pages = snapshot.branches.length;
  const perRow = isPhone(page)
    ? pages > 12
      ? 3
      : 2
    : page.width < 1100
      ? Math.max(1, Math.round(Math.sqrt(pages * 1.6)))
      : null;
  const maps = useMaps(snapshot, start, perRow);
  const person = place.person;
  const back = hrefOf(treePlace(person));
  const list = hrefOf({ screen: "list", person: person ?? start });
  useEffect(() => rememberTree(hrefOf(place)), [place]);

  return (
    <section className={classes.screen}>
      <div className={classes.head}>
        <h1 ref={heading} tabIndex={-1}>
          {t("view.branches")}
        </h1>
        <b className={classes.mark}>{t("sample.mark")}</b>
        <span className={classes.count}>
          {t("people.count", { count: snapshot.people.length })},{" "}
          {t("branches.count", { count: snapshot.branches.length })}
        </span>
        {maps.status === "ready" && (
          <span className={classes.legend}>
            <Legend links={maps.of.far.links} />
          </span>
        )}
        <Link href={list}>{t("view.list")}</Link>
        <Link className={classes.close} href={back} aria-label={t("card.back")}>
          <CloseIcon />
        </Link>
        {maps.status === "ready" && <Levels place={place} latest={latest} />}
      </div>
      {maps.status === "loading" && <Message text={t("map.loading")} />}
      {maps.status === "failed" && (
        <Message
          text={t("map.failed")}
          action={{ label: t("view.list"), onClick: () => go(list) }}
          isProblem
        />
      )}
      {maps.status === "ready" && (
        <>
          {maps.isOld && (
            <p role="status" className={classes.hint}>
              {t("map.loading")}
            </p>
          )}
          <PlacedMap place={place} maps={maps.of} hint={hint} onLatest={setLatest} />
        </>
      )}
      {/* It keeps its room on the other levels, so that the map does not change its height. */}
      <p className={classes.press} data-off={place.level !== "far" || undefined}>
        {t("map.press")}
      </p>
      <p id={hint} className={classes.keys}>
        <b>{t("map.keyboard")}</b> {t(place.level === "far" ? "map.keysFar" : "map.keysNear")}
      </p>
    </section>
  );
}

type Latest = { view: View; window: Size; maps: Maps };

type PlacedMapProps = {
  place: BranchesPlace;
  maps: Maps;
  hint: string;
  onLatest: (latest: Latest) => void;
};

/** The view as the address tells it, and the address as the view is. */
function PlacedMap({ place, maps, hint, onLatest }: PlacedMapProps) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const href = hrefOf(place);
  const written = useRef(href);
  const [target, setTarget] = useState<Target>(() => ({ view: viewOf(place), isSmooth: false }));
  useEffect(() => {
    if (written.current === href) return;
    written.current = href;
    setTarget({ view: viewOf(place), isSmooth: true });
  }, [href, place]);

  const now = useRef({ place, maps });
  now.current = { place, maps };
  const onRest = useCallback(
    (view: View, window: Size): void => {
      const { place: old, maps: own } = now.current;
      const latest = { view, window, maps: own };
      onLatest(latest);
      written.current = hrefOf(placeOf(latest, old));
      go(written.current, "replace");
    },
    [onLatest],
  );
  const onAway = useCallback((view: View, window: Size): void => {
    const { place: old, maps: own } = now.current;
    const further = levels[levels.indexOf(view.level) - 1];
    if (further !== undefined) go(hrefOf(atLevel(further, old, { view, window, maps: own })));
  }, []);
  const links = useMemo(
    () => ({
      page: (branch: string | null) =>
        hrefOf(branchesPlace({ level: "closer", person: place.person, branch: branch ?? none })),
      reference: (other: string, level: MapLevel) => {
        const card = maps[level].cards.find((one) => one.person === other);
        const [dx, dy] = [(card?.w ?? 0) / 2, (card?.h ?? 0) / 2];
        const at = { person: other, dx, dy };
        return hrefOf(branchesPlace({ level, person: place.person, at }));
      },
      person: (person: string) => hrefOf({ screen: "person", person }),
    }),
    [place.person, maps],
  );
  return (
    <MapView
      snapshot={snapshot}
      maps={maps}
      words={words}
      chosen={place.person}
      target={target}
      label={t("view.branches")}
      describedBy={hint}
      hrefOfPage={links.page}
      hrefOfReference={links.reference}
      hrefOfPerson={links.person}
      onRest={onRest}
      onAway={onAway}
    />
  );
}

/** The page of nobody's branch, in an address. */
const none = "none";

function viewOf({ level, person, branch, at, scale }: BranchesPlace) {
  return (maps: Maps, window: Size): View => {
    const map = maps[level];
    const whole = fit(maps.far, window, isNarrow(window));
    if (at !== null) {
      const spot = viewOfSpot(
        at,
        level,
        restingScale(level, level === "far" ? whole.k * scale : scale),
        map,
      );
      if (spot !== null) return spot;
    }
    if (level === "far") return whole;
    if (branch !== null) {
      const page = map.pages.findIndex((one) => (one.branch ?? none) === branch);
      const view = viewOfPage(page, level, map, window);
      if (view !== null) return view;
    }
    const middle = { maps, window, px: window.w / 2, py: window.h / 2 };
    const chosen = person === null ? null : viewOfPerson(person, level, map);
    return chosen ?? toLevel(whole, level, 1, middle);
  };
}

/** The whole map from far has no place of its own: it is the same on every screen. */
function placeOf({ view, window, maps }: Latest, { person }: BranchesPlace): BranchesPlace {
  const { level } = view;
  if (isWhole(view, maps, window)) return branchesPlace({ person });
  const whole = fit(maps.far, window, isNarrow(window));
  const scale = level === "far" ? view.k / whole.k : view.k;
  return branchesPlace({
    level,
    person,
    at: spotOf(view, maps[level]),
    scale: Math.round(scale * 100) / 100,
  });
}

/** Another level with the same place in the middle. From far it is the chosen person. */
function atLevel(level: MapLevel, place: BranchesPlace, latest: Latest | null): BranchesPlace {
  const base = branchesPlace({ level, person: place.person });
  if (latest === null || level === "far") return base;
  const { view, window, maps } = latest;
  if (view.level === "far" && placeOf(latest, place).at === null) return base;
  const middle = { maps, window, px: window.w / 2, py: window.h / 2 };
  return { ...base, at: spotOf(toLevel(view, level, 1, middle), maps[level]) };
}

function Levels({ place, latest }: { place: BranchesPlace; latest: Latest | null }) {
  const { t } = useLanguage();
  return (
    <nav className={classes.levels} aria-label={t("map.zoom")}>
      {levels.map((level) => (
        <Link
          key={level}
          href={hrefOf(atLevel(level, place, latest))}
          aria-current={level === place.level ? "true" : undefined}
        >
          {t(`map.${level}`)}
        </Link>
      ))}
    </nav>
  );
}
