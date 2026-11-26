import { useComputedColorScheme, useMantineColorScheme } from "@mantine/core";
import { useId } from "react";
import { locales } from "../i18n/t";
import classes from "./controls.module.css";
import { ThemeIcon } from "./icons";
import { useLanguage } from "./language";

/** Both languages by their marks, the same in either; the radios are native, so are the keys. */
export function LanguageChoice() {
  const { t, locale, setLocale } = useLanguage();
  const name = useId();
  return (
    <div role="radiogroup" aria-label={t("settings.language")} className={classes.languages}>
      {locales.map((one) => (
        <label key={one} className={classes.language} data-chosen={one === locale || undefined}>
          <input
            type="radio"
            name={name}
            value={one}
            lang={one}
            // The name starts with what is seen, for whoever speaks to the page.
            aria-label={`${t(`language.${one}.mark`)}, ${t(`language.${one}`)}`}
            checked={one === locale}
            onChange={() => setLocale(one)}
          />
          <span aria-hidden="true">{t(`language.${one}.mark`)}</span>
        </label>
      ))}
    </div>
  );
}

export function ThemeButton() {
  const { t } = useLanguage();
  const { setColorScheme } = useMantineColorScheme();
  const other = useComputedColorScheme("light") === "dark" ? "light" : "dark";
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
