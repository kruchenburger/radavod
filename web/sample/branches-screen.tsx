import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useArrival } from "../app/arrival";
import { CloseIcon } from "../app/icons";
import { useLanguage } from "../app/language";
import { go, Link } from "../app/router";
import { branchMap, type BranchMap } from "../tree/layout/branch-map";
import { Legend } from "../tree/lines";
import { MapView, type Target } from "../tree/map/map-view";
import {
  isNarrow,
  restingScale,
  scales,
  type Size,
  spotOf,
  type View,
  viewOfPage,
  viewOfPerson,
  viewOfSpot,
} from "../tree/map/view";
import { measure } from "../tree/type";
import classes from "./branches-screen.module.css";
import { useData } from "./data";
import { rememberTree } from "./last-tree";
import { Modes } from "./modes";
import { type BranchesPlace, branchesPlace, hrefOf, treePlace } from "./places";

/**
 * All branches on one wide canvas, opened on a person: the one the address names, else the one
 * the example begins with. The strip above it shows the whole family and where the window is.
 */
export function BranchesScreen({ place }: { place: BranchesPlace }) {
  const { t } = useLanguage();
  const { snapshot, start, line, words } = useData();
  const heading = useArrival<HTMLHeadingElement>();
  const hint = useId();
  const map = useMemo(
    () => branchMap(snapshot, { measure, headOf: ({ id }) => words.page(id), lineOf: line }),
    [snapshot, line, words],
  );
  const chosen = place.person ?? start;
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
        <span className={classes.legend}>
          <Legend links={map.links} />
        </span>
        <Link href={hrefOf({ screen: "list", person: chosen })}>{t("view.list")}</Link>
        <Link
          className={classes.close}
          href={hrefOf(treePlace(place.person))}
          aria-label={t("card.back")}
        >
          <CloseIcon />
        </Link>
        <Modes place={place} />
      </div>
      <PlacedMap place={place} map={map} chosen={chosen} hint={hint} />
      <p id={hint} className={classes.keys}>
        <b>{t("map.keyboard")}</b> {t("map.keys")}
      </p>
    </section>
  );
}

type PlacedMapProps = { place: BranchesPlace; map: BranchMap; chosen: string; hint: string };

/** The view as the address tells it, and the address as the view is. */
function PlacedMap({ place, map, chosen, hint }: PlacedMapProps) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const href = hrefOf(place);
  const written = useRef(href);
  const [target, setTarget] = useState<Target>(() => ({
    view: viewOf(place, chosen),
    isSmooth: false,
  }));
  useEffect(() => {
    if (written.current === href) return;
    written.current = href;
    setTarget({ view: viewOf(place, chosen), isSmooth: true });
  }, [href, place, chosen]);

  const now = useRef(place);
  now.current = place;
  const onRest = useCallback(
    (view: View, _window: Size): void => {
      const old = now.current;
      const scale = Math.round(view.k * 100) / 100;
      const next = branchesPlace({ person: old.person, at: spotOf(view, map), scale });
      written.current = hrefOf(next);
      go(written.current, "replace");
    },
    [map],
  );
  const links = useMemo(
    () => ({
      page: (branch: string | null) =>
        hrefOf(branchesPlace({ person: place.person, branch: branch ?? none })),
      reference: (other: string) => hrefOf(branchesPlace({ person: other })),
      person: (person: string) => hrefOf({ screen: "person", person }),
    }),
    [place.person],
  );
  return (
    <MapView
      snapshot={snapshot}
      map={map}
      words={words}
      chosen={chosen}
      target={target}
      label={t("view.branches")}
      describedBy={hint}
      hrefOfPage={links.page}
      hrefOfReference={links.reference}
      hrefOfPerson={links.person}
      onRest={onRest}
    />
  );
}

/** The page of nobody's branch, in an address. */
const none = "none";

/**
 * Where the canvas opens: the spot in the address, else the page asked for, else the chosen
 * person, a little below the middle so their ancestors stand over them. On a phone smaller.
 */
function viewOf({ branch, at, scale }: BranchesPlace, chosen: string) {
  return (map: BranchMap, window: Size): View => {
    const k = scale !== 1 ? restingScale(scale) : isNarrow(window) ? scales.least : 1;
    if (at !== null) {
      const spot = viewOfSpot(at, k, map);
      if (spot !== null) return spot;
    }
    if (branch !== null) {
      const page = map.pages.findIndex((one) => (one.branch ?? none) === branch);
      const view = viewOfPage(page, map, window, k);
      if (view !== null) return view;
    }
    return viewOfPerson(chosen, map, window, k) ?? { x: map.width / 2, y: map.height / 2, k };
  };
}
