import { Button } from "@mantine/core";
import { useMemo } from "react";
import type { TreeNameForm, TreePerson } from "../../src/shared/tree";
import { useArrival } from "../app/arrival";
import { BackIcon } from "../app/icons";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { CertaintyMark } from "../tree/certainty";
import { kinOf } from "../tree/layout/kin";
import { LifeStripView } from "../tree/person/life-strip-view";
import { useData } from "./data";
import { KinList } from "./kin-list";
import { lastTree } from "./last-tree";
import classes from "./person-screen.module.css";
import { branchesPlace, hrefOf, treePlace } from "./places";

export function PersonScreen({ person: id }: { person: string }) {
  const { t } = useLanguage();
  const { snapshot, start, words } = useData();
  const heading = useArrival<HTMLHeadingElement>();
  const kin = kinOf(snapshot);
  const isDirect = useMemo(() => kinOf(snapshot).lineOf(start).has(id), [snapshot, start, id]);
  const person = kin.person(id);
  if (person === undefined) return null;
  const { given, surname } = words.fullName(person.name);
  const place = words.place(person.place);
  const onTree = hrefOf(treePlace(id));
  const onBranches = hrefOf(branchesPlace({ level: "near", person: id }));
  return (
    <article className={classes.card}>
      <Link className={classes.back} href={lastTree() ?? onTree}>
        <BackIcon />
        {t("card.back")}
      </Link>
      <div className={classes.head}>
        <div>
          <h1 ref={heading} tabIndex={-1} data-unnamed={!words.isNamed(person) || undefined}>
            {given} <span style={{ color: words.ink(person.branch) }}>{surname}</span>
          </h1>
          <p className={classes.about}>
            <span>
              {[words.years(person), words.bornAs(person)]
                .filter((part) => part !== null)
                .join(", ")}
            </span>{" "}
            <b style={{ color: words.ink(person.branch) }}>{words.branch(person.branch)}</b>{" "}
            {isDirect && <span>{t("card.direct")}</span>}
          </p>
          {place !== null && (
            <p className={classes.place}>
              <span>{t("card.place")}</span> {place}
            </p>
          )}
        </div>
        <div className={classes.actions}>
          <Button component={Link} href={onTree} size="md">
            {t("card.show")}
          </Button>
          <Button component={Link} href={onBranches} size="md" variant="outline">
            {t("card.showBranches")}
          </Button>
        </div>
      </div>
      <LifeStripView snapshot={snapshot} person={id} words={words} line={start} />
      <div className={classes.columns}>
        <section>
          <h2>{t("card.kin")}</h2>
          <KinList person={id} hrefFor={(person) => ({ screen: "person", person })} />
        </section>
        <Names person={person} />
      </div>
    </article>
  );
}

/** The form shown first, then the others by language. */
function Names({ person: { name, otherNames } }: { person: TreePerson }) {
  const { t } = useLanguage();
  const { words } = useData();
  const order: string[] = [];
  for (const { language } of [name, ...otherNames].flatMap((form) => form ?? [])) {
    if (!order.includes(language)) order.push(language);
  }
  const others = otherNames.toSorted(
    (a, b) => order.indexOf(a.language) - order.indexOf(b.language),
  );
  const forms: TreeNameForm[] = name === null ? others : [name, ...others];
  return (
    <section>
      <h2>{t("card.names")}</h2>
      {forms.length === 0 ? (
        <p className={classes.unnamed}>{t("person.unnamed")}</p>
      ) : (
        <ul className={classes.names}>
          {forms.map((form, i) => {
            const { given, surname } = words.fullName(form);
            return (
              <li key={i}>
                <span
                  className={classes.form}
                  lang={form.language === "other" ? undefined : form.language}
                  dir={form.script === "Hebr" ? "rtl" : undefined}
                >
                  {`${given} ${surname}`.trim()}
                </span>
                <span className={classes.kind}>
                  {`${t(`name.${form.language}`)}, ${t(`name.${form.kind}`)}`}
                </span>
                <CertaintyMark of={form.certainty} />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
