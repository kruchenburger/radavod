/** Letters that no decomposition takes to a plain one. Old and neighbouring spellings meet here. */
const plain: Record<string, string> = {
  ѣ: "е",
  є: "е",
  і: "и",
  ѵ: "и",
  ѳ: "ф",
  ґ: "г",
  ł: "l",
  đ: "d",
  ð: "d",
  ø: "o",
  ß: "ss",
  æ: "ae",
  œ: "oe",
  þ: "th",
  ı: "i",
};

/**
 * Two spellings of one name fold to the same text: for the search, never for a person to read.
 * «й» keeps its breve, since it is another letter than «и».
 */
export function foldName(text: string): string {
  return text
    .replace(/['’‘ʼʹ`´′]/gu, "")
    .normalize("NFKD")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/(й)|\p{M}/gu, (_, short: string | undefined) => short ?? "")
    .replace(/[ѣєіѵѳґłđðøßæœþı]/gu, (letter) => plain[letter] ?? letter)
    .replace(/\p{Pd}/gu, "-")
    .replace(/ъ+(?!\p{L})/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .normalize("NFC");
}
