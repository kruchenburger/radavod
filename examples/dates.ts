import type { FuzzyDate, PartialDate } from "./family.ts";
import type { Random } from "./random.ts";

type Parsed = NonNullable<FuzzyDate["parsed"]>;
type Calendar = Parsed["calendar"];

const ofMonth = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];
const months = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

/** The empire counted by the Julian calendar until 1918; overseas the Gregorian one was in use. */
const calendarOf = (year: number): Calendar => (year < 1918 ? "julian" : "gregorian");

function dated(
  text: string,
  qualifier: Parsed["qualifier"],
  from: PartialDate,
  to: PartialDate | null = null,
): FuzzyDate {
  const precision = from.day !== undefined ? "day" : from.month !== undefined ? "month" : "year";
  const calendar = calendarOf(from.year);
  return { text, parsed: { qualifier, precision, calendar, from, to } };
}

export const yearDate = (year: number): FuzzyDate => dated(String(year), "exact", { year });

const dayDate = (year: number, month: number, day: number): FuzzyDate =>
  dated(`${day} ${ofMonth[month - 1]} ${year} г.`, "exact", { year, month, day });

/** A date the way some source would give the year. */
export function dateIn(
  random: Random,
  year: number,
  calendar: Calendar = calendarOf(year),
): FuzzyDate {
  const date = writtenDate(random, year, calendar);
  if (date.parsed !== null) date.parsed.calendar = calendar;
  return date;
}

function writtenDate(random: Random, year: number, calendar: Calendar): FuzzyDate {
  const { int, chance } = random;
  const kind = random.weighted([
    ["day", 56],
    ["month", 8],
    ["year", 16],
    ["about", 9],
    ["before", 4],
    ["after", 3],
    ["between", 4],
  ]);
  switch (kind) {
    case "day":
      if (calendar === "julian" && chance(0.06)) {
        return dated(`на Покров ${year} г.`, "exact", { year, month: 10, day: 1 });
      }
      return dayDate(year, int(1, 12), int(1, 28));
    case "month": {
      const month = int(1, 12);
      return dated(`${months[month - 1]} ${year} г.`, "exact", { year, month });
    }
    case "year":
      return yearDate(year);
    case "about": {
      const near = year + int(-2, 2);
      return dated(`около ${near} г.`, "about", { year: near });
    }
    case "before": {
      const later = year + int(1, 3);
      return dated(`до ${later} г.`, "before", { year: later });
    }
    case "after": {
      const earlier = year - int(1, 3);
      return dated(`после ${earlier} г.`, "after", { year: earlier });
    }
    case "between": {
      const [from, to] = [year - int(1, 3), year + int(1, 3)];
      return dated(`между ${from} и ${to} гг.`, "between", { year: from }, { year: to });
    }
  }
}

/** A few days later in the same month, or null when the day is not known or the month ends. */
export function soonAfter(random: Random, date: FuzzyDate | null): FuzzyDate | null {
  const { year, month, day } = date?.parsed?.from ?? {};
  if (year === undefined || month === undefined || day === undefined) return null;
  const later = day + random.int(1, 4);
  if (later > 28) return null;
  const next = dayDate(year, month, later);
  if (next.parsed !== null && date?.parsed) next.parsed.calendar = date.parsed.calendar;
  return next;
}
