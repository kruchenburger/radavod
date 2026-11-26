import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import classes from "./branches-screen.module.css";
import { type BranchesPlace, branchesPlace, hrefOf } from "./places";

const modes: BranchesPlace["as"][] = ["map", "fan"];

/** The ways to see all branches, as words on a line; the chosen person goes along. */
export function Modes({ place }: { place: BranchesPlace }) {
  const { t } = useLanguage();
  return (
    <nav className={classes.modes} aria-label={t("map.modes")}>
      {modes.map((as) => (
        <Link
          key={as}
          href={hrefOf(branchesPlace({ as, person: place.person }))}
          aria-current={place.as === as ? "true" : undefined}
        >
          {t(as === "map" ? "map.asCanvas" : "map.asFan")}
        </Link>
      ))}
    </nav>
  );
}
