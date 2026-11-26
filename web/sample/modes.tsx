import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import classes from "./branches-screen.module.css";
import { useData } from "./data";
import { type BranchesPlace, branchesPlace, hrefOf } from "./places";

/**
 * The ways to see all branches, as words on a line: the pages by branch first, then the fan. The
 * chosen person goes along.
 */
export function Modes({ as, person }: { as: BranchesPlace["as"]; person: string | null }) {
  const { t } = useLanguage();
  const { start } = useData();
  return (
    <nav className={classes.modes} aria-label={t("map.modes")}>
      <Link
        href={hrefOf({ screen: "list", person: person ?? start })}
        aria-current={as === "list" ? "true" : undefined}
      >
        {t("view.list")}
      </Link>
      <Link
        href={hrefOf(branchesPlace({ as: "fan", person }))}
        aria-current={as === "fan" ? "true" : undefined}
      >
        {t("map.asFan")}
      </Link>
    </nav>
  );
}
