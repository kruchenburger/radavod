import { Button } from "@mantine/core";
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useArrival } from "../app/arrival";
import { useLanguage } from "../app/language";
import { cameBack, Link } from "../app/router";
import { isPhone, usePage } from "../app/use-page";
import {
  type BranchPages,
  branchPages,
  type PageEntry,
  type PageTie,
  routeCrossings,
} from "../tree/layout/branch-pages";
import { kinOf } from "../tree/layout/kin";
import { personKey, type Point } from "../tree/layout/types";
import { type LineKind, lineLooks, linePath, tieKind } from "../tree/line-path";
import { KindsLegend } from "../tree/lines";
import { useData } from "./data";
import { Modes } from "./modes";
import { hrefOf, treePlace } from "./places";
import classes from "./pages-screen.module.css";

/**
 * Every branch as a page of its own, an outline of families in plain lists. It is also the way
 * through the tree for a screen reader and a keyboard: every name is a link in a list of lists.
 */
export function PagesScreen({ person: chosen }: { person: string }) {
  const { t } = useLanguage();
  const { snapshot, line, words } = useData();
  const heading = useArrival<HTMLHeadingElement>();
  const pages = useMemo(() => branchPages(snapshot, line), [snapshot, line]);
  const kinds = useMemo(() => kindsOf(pages), [pages]);
  const strip = useRef<HTMLDivElement>(null);
  const wires = useWires(strip, pages);
  useChosen(strip, chosen);

  const pageOf = (branch: string | null): string => `page-${branch ?? "none"}`;
  const toPage = (branch: string | null): void => {
    const page = document.getElementById(pageOf(branch));
    page?.scrollIntoView?.({ block: "nearest", inline: "start" });
    page?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  };
  return (
    <article className={classes.screen}>
      <header className={classes.head}>
        <h1 ref={heading} tabIndex={-1}>
          {t("view.branches")}
        </h1>
        <span className={classes.count}>
          {t("people.count", { count: snapshot.people.length })},{" "}
          {t("branches.count", { count: snapshot.branches.length })}
        </span>
        <span className={classes.legend}>
          <KindsLegend kinds={kinds} />
        </span>
        <Modes as="list" person={chosen} />
        <Button component={Link} href={hrefOf(treePlace(chosen))} size="md" variant="outline">
          {t("view.around")}
        </Button>
      </header>
      <nav className={classes.tabs} aria-label={t("list.branches")}>
        {pages.pages.map(({ branch, people }) => (
          <a
            key={branch ?? ""}
            href={`#${pageOf(branch)}`}
            style={{ color: words.ink(branch) }}
            onClick={(event) => {
              event.preventDefault();
              toPage(branch);
            }}
          >
            {words.page(branch)} <Count people={people} />
          </a>
        ))}
      </nav>
      <div ref={strip} className={classes.strip}>
        <div className={classes.row} data-row>
          {wires.length > 0 && (
            <svg className={classes.wires} aria-hidden="true">
              {wires.map((points, i) => (
                <path key={i} d={linePath(points, corners)} strokeWidth={lineLooks.direct.width} />
              ))}
            </svg>
          )}
          {pages.pages.map(({ branch, people, entries }) => (
            <section
              key={branch ?? ""}
              id={pageOf(branch)}
              className={classes.page}
              aria-labelledby={`${pageOf(branch)}-head`}
              data-page
            >
              <h2 id={`${pageOf(branch)}-head`} tabIndex={-1} style={{ color: words.ink(branch) }}>
                {words.page(branch)} <Count people={people} />
              </h2>
              <ul className={classes.tree}>
                {entries.map((entry) => (
                  <Entry key={entry.key} entry={entry} page={branch} chosen={chosen} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </article>
  );
}

const corners = { across: 6, down: 6 };

/** The number beside the name of a branch, said in words. */
function Count({ people }: { people: number }) {
  const { t } = useLanguage();
  return (
    <>
      <span aria-hidden="true">{people}</span>
      <span className={classes.said}>{t("people.count", { count: people })}</span>
    </>
  );
}

type EntryProps = { entry: PageEntry; page: string | null; chosen: string };

/** A person with the partners under, and the children of each under the parent they belong to. */
type Placed = EntryProps & { line?: "pass" | "in" | undefined; isAlone?: boolean | undefined };

function Entry({ entry, page, chosen, line, isAlone = false }: Placed) {
  const { parents, partners, children } = entry;
  return (
    <li data-line={line} data-kind={turnOf(entry.tie)}>
      {parents !== null && <Line entry={parents} page={page} chosen={chosen} />}
      <Line entry={entry} page={page} chosen={chosen} isAlone={isAlone} />
      <Children entries={children} page={page} chosen={chosen} />
      {partners.map((partner) => (
        <div key={partner.key}>
          <Line entry={partner} page={page} chosen={chosen} isPartner />
          <Children entries={partner.children} alone={partner.alone} page={page} chosen={chosen} />
          {partner.partners.map((other) => (
            <div key={other.key}>
              <Line entry={other} page={page} chosen={chosen} isPartner />
              <Children entries={other.children} page={page} chosen={chosen} />
            </div>
          ))}
        </div>
      ))}
    </li>
  );
}

/**
 * Children on one trunk, dark down to the child on the direct line. Those of a partner whose other
 * parent is unknown come first, as the map has them, and say so.
 */
function Children({
  entries,
  alone = [],
  ...rest
}: {
  entries: PageEntry[];
  alone?: PageEntry[];
  page: string | null;
  chosen: string;
}) {
  const all = [...alone, ...entries];
  if (all.length === 0) return null;
  const direct = all.findIndex(({ tie }) => tie?.direct === true);
  return (
    <ul>
      {all.map((entry, i) => (
        <Entry
          key={entry.key}
          entry={entry}
          {...rest}
          line={i < direct ? "pass" : i === direct ? "in" : undefined}
          isAlone={i < alone.length && isOfBlood(entry.tie)}
        />
      ))}
    </ul>
  );
}

/** Taken in alone, by adoption or guardianship, a child has no second parent to be unknown. */
const isOfBlood = (tie: PageTie | null): boolean =>
  tie === null || tie.kind === "blood" || tie.kind === "unknown";

type LineProps = {
  entry: PageEntry;
  page: string | null;
  chosen: string;
  isPartner?: boolean;
  /** A child of a partner whose other parent nobody knows. */
  isAlone?: boolean;
};

/** A name as a link with the years, or a reference to the page where the people stand. */
function Line({ entry, page, chosen, isPartner = false, isAlone = false }: LineProps) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const { reference, direct } = entry;
  const mark = isPartner ? (
    <span className={classes.ring} aria-hidden="true">
      ⚭
    </span>
  ) : null;
  if (reference !== undefined) {
    const { title, detail } = words.onMap.reference(reference);
    const [first] = reference.people;
    return (
      <p className={classes.line} data-key={entry.key} data-reference>
        {mark}
        {first === undefined ? (
          <i className={classes.reference}>
            {title} <b style={{ color: words.ink(reference.page) }}>{detail}</b>
          </i>
        ) : (
          <Link className={classes.reference} href={hrefOf({ screen: "list", person: first })}>
            {title} <b style={{ color: words.ink(reference.page) }}>{detail}</b>
          </Link>
        )}
      </p>
    );
  }
  const person = entry.person === null ? undefined : kinOf(snapshot).person(entry.person);
  if (person === undefined) return null;
  const { given, surname } = words.person(person);
  const isChosen = person.id === chosen;
  const isOther = person.branch !== page;
  const name: ReactNode = (
    <>
      {given}{" "}
      <span style={{ color: isChosen ? undefined : words.ink(person.branch) }}>{surname}</span>
    </>
  );
  return (
    <p
      className={classes.line}
      data-key={entry.key}
      data-direct={direct || undefined}
      data-chosen={isChosen || undefined}
    >
      {mark}
      <Link
        className={classes.name}
        href={hrefOf({ screen: "list", person: person.id })}
        aria-current={isChosen ? "true" : undefined}
        aria-label={isPartner ? t("tree.partner", { name: words.name(person) }) : undefined}
        data-unnamed={!words.isNamed(person) || undefined}
      >
        {name}
      </Link>
      <span className={classes.detail}>
        {words.years(person)}
        {isOther && (
          <>
            {" · "}
            <b style={{ color: words.ink(person.branch) }}>{words.branch(person.branch)}</b>
          </>
        )}
        {isAlone && ` · ${t("pages.alone")}`}
        {direct && <span className={classes.said}>, {t("pages.direct")}</span>}
      </span>
    </p>
  );
}

/** How the line turns to an entry; the trunk itself tells the direct line. */
const turnOf = (tie: PageTie | null): LineKind | undefined => {
  const kind = tie === null ? "thin" : tieKind(tie);
  return kind === "thin" || kind === "direct" ? undefined : kind;
};

/** The kinds of lines the pages have, for the legend. */
function kindsOf({ pages, crossings }: BranchPages): Set<LineKind> {
  const kinds = new Set<LineKind>(crossings.length > 0 ? ["direct"] : []);
  const walk = (entry: PageEntry): void => {
    if (entry.tie?.direct === true) kinds.add("direct");
    const kind = turnOf(entry.tie);
    if (kind !== undefined) kinds.add(kind);
    [...entry.children, ...entry.alone, ...entry.partners].forEach(walk);
  };
  for (const { entries } of pages) entries.forEach(walk);
  return kinds;
}

/** The chosen person is in the window; after a press on a name the focus is on it too. */
function useChosen(strip: React.RefObject<HTMLDivElement | null>, chosen: string): void {
  const isFirst = useRef(true);
  useEffect(() => {
    const line = strip.current?.querySelector<HTMLElement>(
      `[data-key="${CSS.escape(personKey(chosen))}"]`,
    );
    if (line == null) return;
    // An address may name a page, as the running foot does: the pages open on it.
    const asked = isFirst.current ? window.location.hash.slice(1) : "";
    const page = asked.startsWith("page-") ? document.getElementById(asked) : null;
    if (page !== null) {
      page.scrollIntoView?.({ block: "nearest", inline: "start" });
    } else if (isFirst.current && cameBack()) {
      // Back to the pages the browser puts the window where it was; the row of pages is new.
      const row = strip.current;
      const page = line.closest<HTMLElement>("[data-page]");
      if (row != null && page != null) {
        const [box, own] = [row.getBoundingClientRect(), page.getBoundingClientRect()];
        row.scrollLeft += own.left - box.left - (row.clientWidth - own.width) / 2;
      }
    } else {
      line.scrollIntoView?.({ block: "center", inline: "center" });
    }
    if (!isFirst.current) line.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    isFirst.current = false;
  }, [strip, chosen]);
}

/**
 * The direct line between pages: drawn over the laid out text, so the browser sets the type and
 * only the few ends of the line are measured, again whenever the text changes its size. On the
 * phone a page fills the window and the reference is the way across.
 */
function useWires(strip: React.RefObject<HTMLDivElement | null>, pages: BranchPages): Point[][] {
  const { locale } = useLanguage();
  const page = usePage();
  const isNarrow = isPhone(page);
  const [drawn, setDrawn] = useState<Point[][]>([]);
  useLayoutEffect(() => {
    const row = strip.current?.querySelector<HTMLElement>("[data-row]");
    if (row == null || isNarrow || typeof ResizeObserver === "undefined") {
      if (row != null) row.style.paddingTop = "";
      setDrawn([]);
      return undefined;
    }
    const draw = (isAgain = false): void => {
      const origin = row.getBoundingClientRect();
      const boxOf = (element: Element): { x: number; y: number; w: number; h: number } => {
        const box = element.getBoundingClientRect();
        return { x: box.left - origin.left, y: box.top - origin.top, w: box.width, h: box.height };
      };
      const sheets = [...row.querySelectorAll("[data-page]")];
      // From the sign of a union, if there is one, to the end of the name or the reference.
      const spotOf = (key: string) => {
        const line = row.querySelector(`[data-key="${CSS.escape(key)}"]`);
        const start = line?.firstElementChild;
        const text = line?.querySelector("a, i");
        const sheet = line?.closest("[data-page]");
        if (start == null || text == null || sheet == null) return null;
        const [first, last] = [boxOf(start), boxOf(text)];
        return { page: sheets.indexOf(sheet), ...last, x: first.x, w: last.x + last.w - first.x };
      };
      const ends = pages.crossings.flatMap(({ reference, to }) => {
        const [from, at] = [spotOf(reference), spotOf(to)];
        return from === null || at === null ? [] : [{ from, to: at }];
      });
      const rem = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const sizes = { rail: 0.75 * rem, apart: 0.5 * rem };
      const wires = routeCrossings(sheets.map(boxOf), ends, sizes);
      // The rail grows with its lanes, with room of two lanes under the last; counted in rem, so
      // the value is exact and reads back as it was written.
      const lanes = wires.filter((points) => points.length > 4).length;
      const top = 0.75 + (lanes + 1) * 0.5;
      const rail = top > 2.75 ? `${top}rem` : "";
      if (row.style.paddingTop !== rail && !isAgain) {
        // The pages move: measured again where they stand now, once.
        row.style.paddingTop = rail;
        draw(true);
        return;
      }
      setDrawn((old) => (same(old, wires) ? old : wires));
    };
    let isLive = true;
    draw();
    const observer = new ResizeObserver(() => draw());
    observer.observe(row);
    for (const sheet of row.querySelectorAll("[data-page]")) observer.observe(sheet);
    const fonts = typeof document.fonts === "undefined" ? null : document.fonts;
    const redraw = (): void => draw();
    fonts?.addEventListener("loadingdone", redraw);
    void fonts?.ready.then(() => {
      if (isLive) draw();
    });
    return () => {
      isLive = false;
      observer.disconnect();
      fonts?.removeEventListener("loadingdone", redraw);
    };
  }, [strip, pages, isNarrow, locale]);
  return drawn;
}

const same = (a: Point[][], b: Point[][]): boolean => JSON.stringify(a) === JSON.stringify(b);
