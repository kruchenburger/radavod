export type Locale = "ru" | "en";

/** A word starts where no letter stands before it; \b does not know Cyrillic. */
const word = (pattern: string) => new RegExp(`(?<!\\p{L})(?:${pattern})(?!\\p{L})`, "iu");

const banned = {
  ru: [
    "(?:легко|быстро|просто|удобно) и (?:легко|быстро|просто|удобно)",
    // «не просто разобрать» means that it is hard.
    "не просто(?! \\p{L}+(?:ть|ти|чь)(?:ся)?(?!\\p{L}))",
    "в один клик",
    "одним кликом",
    "позвол(?:яет|яют|ит|ят)",
    "обеспечи(?:вает|вают|т|ть|вать)",
    "осуществля(?:ет|ют|ется|ются|ть|ться)",
    "что-то пошло не так",
    "пожалуйста",
    "не (?:волнуйтесь|переживайте)",
  ],
  en: [
    "seamless(?:ly)?",
    "effortless(?:ly)?",
    "delv(?:e|es|ed|ing)",
    "please note",
    "(?<=(?:^|[.!?,]) ?)it looks like",
    "(?:oops|whoops)",
    "something went wrong",
    "(?:in|with) (?:one|a single) click",
  ],
};

const informal = [
  "ты|тебя|тебе|тобой|тобою",
  "тво(?:й|я|е|и|его|ему|им|ем|ей|ю|их|ими)",
  // The imperatives an interface uses most; the steward reads for the rest.
  "выбери|нажми|введи|укажи|добавь|удали|убери|верни|вернись|открой|закрой|сохрани|загрузи|скачай",
  "войди|зайди|попробуй|проверь|обнови|подожди|создай|посмотри|покажи|напиши|отправь|подтверди",
  "найди|измени|исправь|пригласи|позови|отмени|сравни|прочитай|запомни",
  // «можешь», «увидишь», without «брешь» and «плешь».
  "(?!брешь|плешь)\\p{L}{2,}[еи]шь(?:ся)?",
];

// Enough to tell a clause from a name or a label: «Добавьте человека — он появится» from
// «Иван — сын Петра». The endings are the ones nouns do not share.
const request = "\\p{L}+(?:йте|ьте|ните|дите|рите|жите|зите|тите|сите|мите|вите|лите)(?:сь)?";
const statement = [
  "\\p{L}+(?:ется|ются|ится|атся|ятся|лось|лись|лась)",
  "\\p{L}+(?:ает|яет|ают|яют|уют|еют)",
  "\\p{L}{2,}(?:жем|дет|дут)",
  "вы \\p{L}+[еи]те|мы \\p{L}+[еи]м",
];

const rules: { rule: string; locale: Locale; breaks: (text: string) => boolean }[] = [
  { rule: "banned-ru", locale: "ru", breaks: matches(banned.ru) },
  { rule: "banned-en", locale: "en", breaks: matches(banned.en) },
  { rule: "informal-ty", locale: "ru", breaks: matches(informal) },
  { rule: "dash-ru", locale: "ru", breaks: joinsClauses },
  {
    rule: "dash-en",
    locale: "en",
    breaks: (text) => /[\p{L})”"]\s*(?:—|--)\s*[\p{L}(“"]/u.test(text),
  },
];

/** The rules a text of a catalog breaks. */
export function checkText(locale: Locale, text: string): string[] {
  const plain = text.replaceAll("ё", "е").replaceAll("Ё", "Е").replace(/\s+/g, " ");
  return rules.filter((r) => r.locale === locale && r.breaks(plain)).map((r) => r.rule);
}

function matches(patterns: string[]): (text: string) => boolean {
  const expressions = patterns.map(word);
  return (text) => expressions.some((expression) => expression.test(text));
}

function joinsClauses(text: string): boolean {
  const startsWithRequest = new RegExp(`^${request}(?!\\p{L})`, "iu");
  const isStatement = matches(statement);
  const isClause = matches([request, ...statement]);
  return text
    .replace(/«[^»]*»/g, "«»")
    .split(/(?<=[.!?…]) /)
    .some((sentence) => {
      // A dash next to a number is a range or a pause.
      const parts = sentence.split(/(?<!\d) (?:—|–|--?) (?!\d)/);
      return parts.slice(1).some((right, i) => {
        const left = parts[i]?.split(/[:;]/).at(-1) ?? "";
        return startsWithRequest.test(right) || (isClause(left) && isStatement(right));
      });
    });
}
