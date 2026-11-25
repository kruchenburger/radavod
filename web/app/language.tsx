import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from "react";
import {
  detectLocale,
  type Key,
  type Locale,
  locales,
  type Params,
  t as translate,
} from "../i18n/t";
import { LANGUAGE_KEY, recall, remember } from "./memory";

type Language = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: Key, params?: Params) => string;
};

const LanguageContext = createContext<Language | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState(firstLocale);

  // Screen readers and hyphenation follow the language of the page.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const language = useMemo<Language>(
    () => ({
      locale,
      setLocale(next) {
        remember(LANGUAGE_KEY, next);
        setLocale(next);
      },
      t: (key, params) => translate(locale, key, params),
    }),
    [locale],
  );
  return <LanguageContext value={language}>{children}</LanguageContext>;
}

export function useLanguage(): Language {
  const language = useContext(LanguageContext);
  if (!language) throw new Error("no-language-provider");
  return language;
}

function firstLocale(): Locale {
  const remembered = recall(LANGUAGE_KEY);
  return locales.find((locale) => locale === remembered) ?? detectLocale(navigator.languages);
}
