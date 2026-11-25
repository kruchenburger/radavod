import { Button } from "@mantine/core";
import { useArrival } from "../app/arrival";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { kinOf } from "../tree/layout/kin";
import { peopleByPage } from "../tree/layout/relatives";
import { useMaps } from "../tree/map/use-maps";
import { useData } from "./data";
import { KinList, PersonLine } from "./kin-list";
import classes from "./list-screen.module.css";
import { hrefOf, treePlace } from "./places";

/** Everybody in plain headings and lists, for a screen reader and for whoever likes lists. */
export function ListScreen({ person: id }: { person: string }) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const heading = useArrival<HTMLHeadingElement>();
  const person = kinOf(snapshot).person(id);
  if (person === undefined) return null;
  return (
    <article className={classes.list}>
      <header>
        <h1 ref={heading} tabIndex={-1} data-unnamed={!words.isNamed(person) || undefined}>
          {words.name(person)}
        </h1>
        <p>
          <span>{words.years(person)}</span>{" "}
          <b style={{ color: words.ink(person.branch) }}>{words.branch(person.branch)}</b>
        </p>
        <Button component={Link} href={hrefOf(treePlace(id))} size="md" variant="outline">
          {t("view.tree")}
        </Button>
      </header>
      <div className={classes.columns}>
        <section>
          <h2>{t("card.kin")}</h2>
          <KinList person={id} hrefFor={(person) => ({ screen: "list", person })} />
        </section>
        <section>
          <h2>{t("list.branches")}</h2>
          <Branches own={person.branch} />
        </section>
      </div>
    </article>
  );
}

function Branches({ own }: { own: string | null }) {
  const { t } = useLanguage();
  const { snapshot, start, words } = useData();
  const maps = useMaps(snapshot, start);
  if (maps.status === "loading") return <p role="status">{t("map.loading")}</p>;
  if (maps.status === "failed") return <p role="alert">{t("map.failed")}</p>;
  return peopleByPage(maps.of.far).map(({ branch, people, generations }) => (
    <details key={branch ?? ""} className={classes.branch} open={branch === own}>
      <summary>
        <h3 style={{ color: words.ink(branch) }}>{words.page(branch)}</h3>
        <span>{t("people.count", { count: people })}</span>
      </summary>
      <ol>
        {generations.map((row, i) => (
          <li key={i}>
            <h4>{t("list.generation", { number: i + 1 })}</h4>
            <ul>
              {row.map((person) => (
                <li key={person}>
                  <PersonLine
                    person={person}
                    hrefFor={(one) => ({ screen: "list", person: one })}
                    without={branch}
                  />
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </details>
  ));
}
