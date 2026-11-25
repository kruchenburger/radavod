import { useMantineColorScheme } from "@mantine/core";
import type { ReactNode } from "react";
import type { TreeSample } from "../../src/shared/tree";
import { ThemeIcon } from "../app/icons";
import { useLanguage } from "../app/language";
import { Link } from "../app/router";
import { locales } from "../i18n/t";
import { Foot } from "./foot";
import classes from "./frame.module.css";
import { branchesPlace, hrefOf, type Place, treePlace } from "./places";
import { SearchBox } from "./search-box";

type FrameProps = {
  place: Place;
  sample: TreeSample | null;
  /** The screen is the sheet of the map, with the mark and a way out of its own. */
  isSheet?: boolean;
  children: ReactNode;
};

/** What stands around every screen of the example. On the phone the map is a sheet over it. */
export function Frame({ place, sample, isSheet = false, children }: FrameProps) {
  const { t } = useLanguage();
  const person = "person" in place ? place.person : null;
  const tree = hrefOf(treePlace(person));
  const branches = hrefOf(branchesPlace({ person }));
  return (
    <div className={classes.frame} data-screen={place.screen} data-sheet={isSheet || undefined}>
      <div className={classes.mark}>
        <b>{t("sample.mark")}</b>
        <span>{t("sample.note")}</span>
        <Link href="/">{t("sample.leave")}</Link>
      </div>
      <header className={classes.top}>
        <Link className={classes.brand} href={hrefOf(treePlace(null))}>
          {t("app.name")}
        </Link>
        <nav className={classes.views} aria-label={t("view.views")}>
          <Link href={tree} aria-current={place.screen === "tree" ? "page" : undefined}>
            {t("view.around")}
          </Link>
          <Link href={branches} aria-current={place.screen === "branches" ? "page" : undefined}>
            {t("view.branches")}
          </Link>
        </nav>
        <div className={classes.tools}>
          {sample !== null && <SearchBox />}
          <LanguageButton />
          <ThemeButton />
        </div>
      </header>
      <main className={classes.main}>{children}</main>
      {sample !== null && place.screen !== "branches" && <Foot person={person ?? sample.start} />}
    </div>
  );
}

function LanguageButton() {
  const { t, locale, setLocale } = useLanguage();
  const other = locales.find((one) => one !== locale) ?? locale;
  return (
    <button type="button" className={classes.tool} lang={other} onClick={() => setLocale(other)}>
      {t(`language.${other}`)}
    </button>
  );
}

function ThemeButton() {
  const { t } = useLanguage();
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const other = colorScheme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className={classes.tool}
      aria-label={`${t("settings.theme")}: ${t(`theme.${other}`)}`}
      onClick={() => setColorScheme(other)}
    >
      <ThemeIcon />
    </button>
  );
}
