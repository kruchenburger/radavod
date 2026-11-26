import { useEffect, useId, useMemo } from "react";
import { useArrival } from "../app/arrival";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { isPhone, usePage } from "../app/use-page";
import { FanView } from "../tree/fan-view";
import { fanMetrics, fanOf } from "../tree/layout/fan";
import { kinOf } from "../tree/layout/kin";
import { KindsLegend } from "../tree/lines";
import classes from "./branches-screen.module.css";
import { useData } from "./data";
import { rememberTree } from "./last-tree";
import { Modes } from "./modes";
import { type BranchesPlace, branchesPlace, hrefOf, treePlace } from "./places";

/**
 * The ancestors of one person or of a couple as a fan. Without a choice in the address the couple
 * of the person the direct line begins with stands in the centre, where the branches meet.
 */
export function FanScreen({ place }: { place: BranchesPlace }) {
  const { t } = useLanguage();
  const { snapshot, line, words } = useData();
  const heading = useArrival<HTMLHeadingElement>();
  const hint = useId();
  const isNarrow = isPhone(usePage());
  const kin = kinOf(snapshot);
  const person = place.person ?? line;
  const partner =
    place.person === null
      ? (kin.unions(line).find(({ other }) => other !== null)?.other ?? null)
      : place.partner;
  const centre = partner === null ? [person] : [person, partner];
  const fan = useMemo(
    () =>
      fanOf(snapshot, centre, {
        metrics: fanMetrics[isNarrow ? "narrow" : "wide"],
        lineOf: line,
        isQuarter: isNarrow,
      }),
    // The centre is a new array every time; its people decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, line, isNarrow, person, partner],
  );
  useEffect(() => rememberTree(hrefOf(place)), [place]);

  const nameOf = (id: string): string => {
    const one = kin.person(id);
    return one === undefined ? "" : words.person(one).given || words.name(one);
  };
  const choices = choicesOf(kin, person, partner);
  const at = (one: string, other: string | null) =>
    hrefOf(branchesPlace({ as: "fan", person: one, partner: other }));
  const names = centre.map((id) => {
    const one = kin.person(id);
    return one === undefined ? "" : words.name(one);
  });
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
        {fan.cells.some(({ direct }) => direct) && (
          <span className={classes.legend}>
            <KindsLegend kinds={new Set(["direct"])} />
          </span>
        )}
        <Modes place={place} />
      </div>
      <nav className={classes.centre} aria-label={t("fan.centre")}>
        <span>{t("fan.centre")}</span>
        {choices.map(([one, other]) => (
          <Link
            key={`${one} ${other}`}
            href={at(one, other)}
            aria-current={one === person && other === partner ? "true" : undefined}
          >
            {other === null ? (
              nameOf(one)
            ) : (
              <span>
                <span className={classes.said}>
                  {t("fan.pair", { one: nameOf(one), other: nameOf(other) })}
                </span>
                <span aria-hidden="true">
                  {nameOf(one)} ⚭ {nameOf(other)}
                </span>
              </span>
            )}
          </Link>
        ))}
      </nav>
      {fan.cells.length === 0 ? (
        <p className={classes.keys}>{t("fan.none", { name: names.join(", ") })}</p>
      ) : (
        <FanView
          fan={fan}
          snapshot={snapshot}
          words={words}
          label={t("fan.label", { names: names.join(", ") })}
          describedBy={hint}
          hrefOfPerson={(one) => at(one, null)}
          hrefOfCentre={(one) => hrefOf(treePlace(one))}
        />
      )}
      <p id={hint} className={classes.keys}>
        <b>{t("map.keyboard")}</b> {t("fan.keys")}
      </p>
    </section>
  );
}

/**
 * What may stand in the centre: the person alone, the person with each partner, and the partner
 * alone; the one whose half is the first comes first. On the phone the first one has the quarter.
 */
function choicesOf(
  kin: ReturnType<typeof kinOf>,
  person: string,
  partner: string | null,
): [string, string | null][] {
  const own: [string, string | null][] = [[person, null]];
  for (const { other } of kin.unions(person)) {
    if (other !== null && !own.some(([, one]) => one === other)) own.push([person, other]);
  }
  if (partner !== null) own.push([partner, person], [partner, null]);
  return own;
}
