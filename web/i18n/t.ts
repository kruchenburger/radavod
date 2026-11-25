import { en } from "./en";
import { ru } from "./ru";
import type { Text } from "./text";

export const locales = ["ru", "en"] as const;
export type Locale = (typeof locales)[number];
export type Key = keyof typeof ru;
type Forms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type Params = Record<string, string | number>;

export function createT<K extends string>(catalogs: Record<Locale, Record<K, Text>>) {
  return (locale: Locale, key: K, params: Params = {}): string => {
    const text = catalogs[locale][key];
    const forms: Forms = typeof text === "string" ? { other: text } : text;
    const form = forms[plurals[locale].select(Number(params.count))] ?? forms.other;
    return form.replace(/\{(\w+)\}/g, (placeholder, name: string) => {
      const value = Object.hasOwn(params, name) ? params[name] : undefined;
      if (value === undefined) return placeholder;
      // Only a count is grouped: a year is a number too.
      return name === "count" ? numbers[locale].format(Number(value)) : String(value);
    });
  };
}

export const t = createT<Key>({ ru, en });

/** The first language of the browser that has a catalog, else Russian. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const found = locales.find((locale) => locale === language.toLowerCase().split("-")[0]);
    if (found) return found;
  }
  return "ru";
}

const plurals = { ru: new Intl.PluralRules("ru"), en: new Intl.PluralRules("en") };
const numbers = { ru: new Intl.NumberFormat("ru"), en: new Intl.NumberFormat("en") };
