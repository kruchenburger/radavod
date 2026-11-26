import { useMemo } from "react";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { kinOf } from "../tree/layout/kin";
import { useData } from "./data";
import classes from "./foot.module.css";
import { hrefOf } from "./places";

/** The running foot: every branch in its ink. It opens the pages by branch. */
export function Foot({ person }: { person: string }) {
  const { t } = useLanguage();
  const { snapshot, words } = useData();
  const counts = useMemo(() => {
    const people = new Map<string | null, number>();
    for (const { branch } of snapshot.people) people.set(branch, (people.get(branch) ?? 0) + 1);
    return people;
  }, [snapshot]);
  const own = kinOf(snapshot).person(person)?.branch ?? null;
  return (
    <footer className={classes.foot}>
      <nav aria-label={t("list.branches")}>
        <ul>
          <li>
            <Link className={classes.all} href={hrefOf({ screen: "list", person })}>
              {t("view.branches")}
            </Link>
          </li>
          {snapshot.branches.map(({ id }) => (
            <li key={id}>
              <Link
                href={`${hrefOf({ screen: "list", person })}#page-${id}`}
                aria-current={id === own || undefined}
                style={{ color: words.ink(id) }}
              >
                {words.branch(id)} <span>{counts.get(id) ?? 0}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
