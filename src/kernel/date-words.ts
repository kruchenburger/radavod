/** The words of written dates: Russian, Belarusian, Polish, English and those of GEDCOM. */

const months = [
  [
    "январь января январе январю январем янв генварь генваря генв",
    "студзень студзеня студзені студзеню студзенем студз",
    "styczeń stycznia styczniu styczniem stycz sty",
    "january jan",
  ],
  [
    "февраль февраля феврале февралю февралем фев февр",
    "люты лютага лютым лют",
    "luty lutego lutym lut",
    "february feb",
  ],
  [
    "март марта марте марту мартом мар",
    "сакавік сакавіка сакавіку сакавіком сак",
    "marzec marca marcu marcem",
    "march mar",
  ],
  [
    "апрель апреля апреле апрелю апрелем апр",
    "красавік красавіка красавіку красавіком крас",
    "kwiecień kwietnia kwietniu kwietniem kwiec kwiet kwi",
    "april apr",
  ],
  [
    "май мая мае маю маем",
    "маі травень траўня траўні траўню траўнем трав",
    "maj maja maju majem",
    "may",
  ],
  [
    "июнь июня июне июню июнем июн",
    "чэрвень чэрвеня чэрвені чэрвеню чэрвенем чэрв",
    "czerwiec czerwca czerwcu czerwcem czerw cze",
    "june jun",
  ],
  [
    "июль июля июле июлю июлем июл",
    "ліпень ліпеня ліпені ліпеню ліпенем ліп",
    "lipiec lipca lipcu lipcem lip",
    "july jul",
  ],
  [
    "август августа августе августу августом авг",
    "жнівень жніўня жніўні жніўню жніўнем жн",
    "sierpień sierpnia sierpniu sierpniem sierp sie",
    "august aug",
  ],
  [
    "сентябрь сентября сентябре сентябрю сентябрем сент сен",
    "верасень верасня верасні верасню вераснем вер",
    "wrzesień września wrześniu wrześniem wrzes wrz",
    "september sept sep",
  ],
  [
    "октябрь октября октябре октябрю октябрем окт",
    "кастрычнік кастрычніка кастрычніку кастрычнікам кастр",
    "październik października październiku październikiem pazdziern pazdz paz",
    "october oct",
  ],
  [
    "ноябрь ноября ноябре ноябрю ноябрем нояб ноя",
    "лістапад лістапада лістападзе лістападу лістападам ліст",
    "listopad listopada listopadzie listopadem listop list lis",
    "november nov",
  ],
  [
    "декабрь декабря декабре декабрю декабрем дек",
    "снежань снежня снежні снежню снежнем снеж",
    "grudzień grudnia grudniu grudniem grudz gru",
    "december dec",
  ],
];

const monthByWord = new Map(
  months.flatMap((languages, i) =>
    languages.flatMap((words) => words.split(" ").map((word) => [plain(word), i + 1] as const)),
  ),
);

/**
 * Polish and Belarusian archives number months so. Capitals only: "i" is a conjunction. On a
 * Cyrillic keyboard І and Х stand for I and X.
 */
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** The number of a month by its name in any case, full or short, old spelling or new. */
export function monthOf(word: string): number | undefined {
  const number = roman.indexOf(word.replace(/І/gu, "I").replace(/Х/gu, "X")) + 1;
  return number > 0 ? number : monthByWord.get(plain(word));
}

/** Without case and marks; і of the old spelling and of Belarusian is и. */
function plain(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/і/gu, "и");
}

// The rest are parts of patterns, matched without regard to case.

export const qualifierWords = {
  about: [
    "около|ок|примерно|прим|приблизительно|прибл|бл",
    "каля|прыблізна|прыбл|прыкладна",
    "około|ok",
    "about|abt|around|approximately|approx|circa|ca|estimated|est|calculated|cal",
  ].join("|"),
  before: [
    "до|перед|ранее|раньше|не позднее|не позже",
    "да|перад|раней(?: за)?|не пазней(?: за)?",
    "przed|do|nie później niż",
    "before|bef|prior to|no later than|not later than|not after",
  ].join("|"),
  after: [
    "после|позднее|позже|не ранее|не раньше",
    "пасля|пазней(?: за)?|не раней(?: за)?",
    "po|nie wcześniej niż",
    "after|aft|no earlier than|not earlier than|not before",
  ].join("|"),
};

export const betweenWords = "между|меж|паміж|між|między|pomiędzy|between|betw|bet";
export const andWords = "и|і|а|a|i|oraz|and";

/** What stands before a date and adds nothing to it. */
export const prepositions = "во?|у|ў|w latach|w|we|in|on|dnia";
/** What stands after the number of a day. */
export const dayWords = "дня|числа|of";
export const yearWords = [
  "гг?|год|года|году|годом|годы|годов|годах|годами",
  "годзе|гады|гадоў|гадах|гадамі",
  "rr?|rok|roku|rokiem",
].join("|");

export const calendarWords = {
  julian: [
    "@#djulian@|julian",
    "(?:по )?(?:ст\\.? ?ст\\.?|ст\\.? ?стил[яю]|стар[оа]го стиля|старому стилю|старый стиль)",
    "(?:па )?(?:ст\\.? ?стылю|старога стылю|старому стылю|стараму стылю|старым стылі)",
    "st\\.? ?st\\.?|starego stylu",
    "o\\.? ?s\\.?|old style",
  ].join("|"),
  gregorian: [
    "@#dgregorian@|gregorian",
    "(?:по )?(?:н\\.? ?ст\\.?|н\\.? ?стил[яю]|нов[оа]го стиля|новому стилю|новый стиль)",
    "(?:па )?(?:н\\.? ?стылю|новага стылю|новаму стылю|новым стылі)",
    "n\\.? ?st\\.?|nowego stylu",
    "n\\.? ?s\\.?|new style",
  ].join("|"),
};
