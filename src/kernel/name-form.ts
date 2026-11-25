import type { Certainty } from "./certainty";

export type Language = "ru" | "be" | "pl" | "lt" | "yi" | "la" | "en" | "other";
export type Script = "Cyrl" | "Latn" | "Hebr" | "other";
export type NameKind = "birth" | "married" | "church" | "nickname" | "variant";

/** One form of a name. A part nobody knows is an empty string. */
export type NameForm = {
  id: string;
  language: Language;
  script: Script;
  kind: NameKind;
  given: string;
  patronymic: string;
  surname: string;
  certainty: Certainty;
};

/**
 * What the search takes for one and the same letter.
 *
 * | Written                                 | Compared as                              |
 * | --------------------------------------- | ---------------------------------------- |
 * | capitals                                | small letters                            |
 * | ё, ї, ў, ą, ė, ś, ž, ō and the like     | the letter without its mark: е, и, у, a  |
 * | й                                       | й, a letter of its own                   |
 * | і, ѣ, ѳ, ѵ of the old spelling          | и, е, ф, и                               |
 * | ъ at the end of a word                  | nothing; inside a word ъ is ъ            |
 * | ґ, ł, ø, đ, ð, ı, ß, æ, œ, þ            | as in the map below                      |
 * | װ, ױ, ײ and the points of Yiddish       | the two letters; nothing                 |
 * | apostrophes, the geresh, the gershayim  | nothing; so is a straight quote          |
 * | soft hyphens and other unseen signs     | nothing                                  |
 * | any dash, the maqaf; spaces             | a hyphen; one space, none at the ends    |
 *
 * No ending is cut, no sound is guessed and no letter of one script is taken for one of another:
 * names that differ by anything not in the table do not meet.
 */
const same: Record<string, string> = {
  // The spelling before 1918.
  і: "и",
  ѣ: "е",
  ѳ: "ф",
  ѵ: "и",
  // The Belarusian and Ukrainian g.
  ґ: "г",
  // Latin letters that Unicode does not take for a letter with a mark.
  ł: "l",
  ø: "o",
  đ: "d",
  ð: "d",
  ı: "i",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  þ: "th",
  // Yiddish digraphs written as one character.
  װ: "וו",
  ױ: "וי",
  ײ: "יי",
};

const sameLetter = new RegExp(`[${Object.keys(same).join("")}]`, "gu");
const dropped = /["'`´‘’‛ʹʻʼʽ′＇׳״]|\p{Cf}/gu;
/** Marks over Latin, Greek and Cyrillic letters and points of Hebrew ones, but for the breve of й. */
const mark =
  /(?!(?<=и)\u0306)[\u0300-\u036f\u0483-\u0487\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu;

/** A name as the search compares it, never shown. Folding a folded name changes nothing. */
export function foldName(name: string): string {
  return name
    .replace(dropped, "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(dropped, "")
    .replace(mark, "")
    .replace(sameLetter, (letter) => same[letter] ?? letter)
    .normalize("NFC")
    .replace(/(?<!ъ)ъ+(?![\p{L}\p{M}\p{N}])/gu, "")
    .replace(/[\p{Pd}\u2212\u2043]/gu, "-")
    .replace(/\s+/gu, " ")
    .trim();
}
