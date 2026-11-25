import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type ParsedDate, parseFuzzyDate, sortKey } from "../../src/kernel/fuzzy-date";

const read = (text: string): ParsedDate | null => parseFuzzyDate(text).parsed;
const exact = (year: number, month?: number, day?: number): ParsedDate => ({
  qualifier: "exact",
  calendar: "gregorian",
  from: {
    year,
    ...(month === undefined ? {} : { month }),
    ...(day === undefined ? {} : { day }),
  },
});
const may12 = exact(1885, 5, 12);

describe("a day", () => {
  it.each([
    // Digits.
    "12.05.1885",
    "12.5.1885",
    "12. 05. 1885",
    "12.05.1885 г.",
    "12.05.1885г.",
    "12.05.1885 года",
    "12.05.1885 r.",
    "1885-05-12",
    "1885.05.12",
    "1885/5/12",
    // Roman months of Polish and Belarusian archives.
    "12.V.1885",
    "12 V 1885",
    "12.V.1885 г.",
    "12-V-1885",
    "12/V/1885 r.",
    // Russian.
    "12 мая 1885",
    "12 Мая 1885 г.",
    "12 мая 1885 года",
    "12-го мая 1885 г.",
    "12-мая-1885",
    "«12» мая 1885 г.",
    "12-е мая 1885",
    "12-ое мая 1885",
    "12 дня мая 1885 года",
    "12 мая, 1885",
    "1885 года мая 12 дня",
    "1885 г., мая 12",
    "1885 года, 12 мая",
    "мая 12 дня 1885 года",
    // Belarusian.
    "12 траўня 1885 г.",
    "12-ага мая 1885",
    "12-га мая 1885 г.",
    // Polish.
    "12 maja 1885",
    "12 maja 1885 r.",
    "12 maja 1885 roku",
    "12 maja roku 1885",
    "12 maja r. 1885",
    "dnia 12 maja 1885 r.",
    "12. maja 1885",
    // English.
    "12 May 1885",
    "12 MAY 1885",
    "12-MAY-1885",
    "12th May 1885",
    "12th of May, 1885",
    "May 12, 1885",
    "May 12th, 1885",
    "on 12 May 1885",
    "1885 May 12",
    // Around it.
    "  12  мая\u00a01885 г. ",
    "12.05.1885.",
    "12.05.1885,",
  ])("reads %j", (text) => {
    expect(read(text)).toEqual(may12);
  });

  it.each([
    "31.02.1885",
    "31 апреля 1885",
    "32.01.1885",
    "12.13.1885",
    "29.02.1900",
    "1885-13-01",
    "12 мая 0885",
  ])("does not read %j, a day that never was", (text) => {
    expect(read(text)).toBeNull();
  });

  it("reads 29 February by the calendar it is written in", () => {
    expect(read("29.02.1884")).toEqual(exact(1884, 2, 29));
    expect(read("29.02.2000")).toEqual(exact(2000, 2, 29));
    expect(read("29.02.1900 ст. ст.")).toEqual({ ...exact(1900, 2, 29), calendar: "julian" });
  });

  it("reads slashes and dashes only when they cannot mean another day", () => {
    expect(read("13/05/1885")).toEqual(exact(1885, 5, 13));
    expect(read("05/13/1885")).toEqual(exact(1885, 5, 13));
    expect(read("05/05/1885")).toEqual(exact(1885, 5, 5));
    expect(read("13-05-1885")).toEqual(exact(1885, 5, 13));
    expect(read("12/05/1885")).toBeNull();
    expect(read("12-05-1885")).toBeNull();
    expect(read("05.13.1885")).toBeNull();
  });
});

describe("a month and a year", () => {
  it.each([
    "05.1885",
    "5/1885",
    "05-1885",
    "V 1885",
    "V.1885",
    "май 1885",
    "мая 1885 г.",
    "в мае 1885 года",
    "Май, 1885",
    "травень 1885",
    "у маі 1885 г.",
    "у траўні 1885 г.",
    "maj 1885",
    "w maju 1885 r.",
    "May 1885",
    "in May 1885",
    "May, 1885",
    "May of 1885",
    "1885 май",
    "1885 May",
  ])("reads %j", (text) => {
    expect(read(text)).toEqual(exact(1885, 5));
  });

  it.each([
    "..05.1885",
    "..V.1885",
    "?.V.1885",
    "XX.V.1885",
    "..V.1885 г.",
    "??.V.1885",
    ".05.1885",
    "__.05.1885",
    "??.05.1885",
    "?.05.1885",
    "00.05.1885",
    "0.05.1885",
    "xx.05.1885",
    "хх.05.1885",
    "--.05.1885",
    "**.05.1885",
    "….05.1885",
    "1885-05-00",
    "?? мая 1885 г.",
    "__ мая 1885",
    "... мая 1885",
    "«__» мая 1885 г.",
  ])("reads %j, with the day missing", (text) => {
    expect(read(text)).toEqual(exact(1885, 5));
  });

  it.each([
    "1885",
    "1885 г.",
    "1885г",
    "1885 год",
    "в 1885 году",
    "в 1885-м году",
    "1885-й год",
    "w r. 1885",
    "у 1885 годзе",
    "ў 1885 г.",
    "w 1885 r.",
    "w roku 1885",
    "1885 rok",
    "in 1885",
    "..1885",
    "....1885",
    "__.__.1885",
    "??.??.1885",
    "00.00.1885",
    "1885-00-00",
    "00/00/1885",
  ])("reads %j as a year", (text) => {
    expect(read(text)).toEqual(exact(1885));
  });

  it.each([
    "12..1885",
    "x.x.1885",
    "X.X.1885",
    "X X 1885",
    "Х.Х.1885 г.",
    "x.05.1885",
    "..v.1885",
    "12.??.1885",
    "12.00.1885",
    "1885-00-12",
    "??/05/1885",
    "00-05-1885",
    "00.00.0000",
  ])("does not read %j, where it is not clear what is missing or what is left", (text) => {
    expect(read(text)).toBeNull();
  });
});

describe("the names of months", () => {
  const forms = [
    "январь января январе январём янв. Января генваря генв. студзень студзеня студзені студзенем styczeń stycznia styczniu styczniem styczen January Jan Jan. JAN",
    "февраль февраля феврале февралем фев. февр. люты лютага лютым luty lutego lutym February Feb",
    "март марта марте мартом мартъ сакавік сакавіка сакавіку сакавіком marzec marca marcu marcem March Mar",
    "апрель апреля апреле апрелем апр. апрѣля красавік красавіка красавіку красавіком kwiecień kwietnia kwietniu kwietniem kwiet. April Apr",
    "май мая мае маем маі травень траўня траўні траўнем maj maja maju majem May",
    "июнь июня июне июнем іюнь іюня июн. чэрвень чэрвеня чэрвені чэрвенем czerwiec czerwca czerwcu czerwcem June Jun",
    "июль июля июле июлем іюль іюля июл. ліпень ліпеня ліпені ліпенем lipiec lipca lipcu lipcem July Jul",
    "август августа августе августом августъ авг. жнівень жніўня жніўні жніўнем sierpień sierpnia sierpniu sierpniem August Aug",
    "сентябрь сентября сентябре сентябрём сент. сен. верасень верасня верасні вераснем wrzesień września wrześniu wrześniem wrzesnia September Sep Sept",
    "октябрь октября октябре октябрём окт. кастрычнік кастрычніка кастрычніку кастрычнікам październik października październiku październikiem październ. pazdziernika October Oct",
    "ноябрь ноября ноябре ноябрём нояб. ноя. лістапад лістапада лістападзе лістападам listopad listopada listopadzie listopadem listop. November Nov",
    "декабрь декабря декабре декабрём дек. снежань снежня снежні снежнем grudzień grudnia grudniu grudniem December Dec",
  ];
  const roman = "I II III IV V VI VII VIII IX X XI XII".split(" ");

  it.each(forms.map((words, i) => [i + 1, words] as const))("of month %i", (month, words) => {
    for (const word of [...words.split(" "), roman[month - 1]]) {
      expect([word, read(`9 ${word} 1885`)]).toEqual([word, exact(1885, month, 9)]);
      expect([word, read(`${word} 1885`)]).toEqual([word, exact(1885, month)]);
    }
  });

  it("in Roman digits typed as Cyrillic letters", () => {
    expect(read("9.Х.1885")).toEqual(exact(1885, 10, 9));
    expect(read("9 ІІІ 1885")).toEqual(exact(1885, 3, 9));
    expect(read("9.ХІІ.1885")).toEqual(exact(1885, 12, 9));
    expect(read("..ІV.1885")).toEqual(exact(1885, 4));
    expect(read("9.х.1885")).toBeNull();
  });

  it("in decomposed letters", () => {
    expect(read("9 май 1885".normalize("NFD"))).toEqual(exact(1885, 5, 9));
    expect(read("9 września 1885".normalize("NFD"))).toEqual(exact(1885, 9, 9));
  });

  it("but not a small letter or a conjunction for a Roman one", () => {
    expect(read("9 i 1885")).toBeNull();
    expect(read("9 и 1885")).toBeNull();
    expect(read("9 v 1885")).toBeNull();
  });

  it("but not a part of a word", () => {
    expect(read("9 маяк 1885")).toBeNull();
    expect(read("9 constructor 1885")).toBeNull();
    expect(read("9 marchew 1885")).toBeNull();
  });
});

describe("a date only known nearly", () => {
  const cases: Record<"about" | "before" | "after", string[]> = {
    about: [
      "около 1885",
      "около 1885 г.",
      "Около 1885 года.",
      "Около 1885 года",
      "ок. 1885",
      "ок.1885",
      "ок 1885",
      "бл. 1885",
      "примерно 1885",
      "приблизительно в 1885 году",
      "прибл. 1885",
      "прим. 1885",
      "каля 1885 г.",
      "прыблізна 1885",
      "прыкладна 1885",
      "około 1885 r.",
      "ok. 1885",
      "about 1885",
      "around 1885",
      "approx. 1885",
      "approximately 1885",
      "circa 1885",
      "ca. 1885",
      "ca 1885",
      "c. 1885",
      "c.1885",
      "c1885",
      "c 1885",
      "~1885",
      "≈ 1885",
      "abt 1885",
      "ABT 1885",
      "Abt. 1885",
      "EST 1885",
      "CAL 1885",
      "1885?",
      "1885 (?)",
      "1885 г. ?",
    ],
    before: [
      "до 1885",
      "до 1885 г.",
      "ранее 1885",
      "перед 1885",
      "не позднее 1885",
      "не позже 1885 года",
      "да 1885 г.",
      "перад 1885",
      "не пазней за 1885",
      "przed 1885",
      "przed 1885 rokiem",
      "do 1885 r.",
      "nie później niż 1885",
      "before 1885",
      "Bef. 1885",
      "BEF 1885",
      "prior to 1885",
      "no later than 1885",
      "not after 1885",
    ],
    after: [
      "после 1885",
      "послѣ 1885",
      "позднее 1885",
      "не ранее 1885 г.",
      "не раньше 1885",
      "пасля 1885 г.",
      "не раней за 1885",
      "po 1885 r.",
      "nie wcześniej niż 1885",
      "after 1885",
      "Aft. 1885",
      "AFT 1885",
      "no earlier than 1885",
      "not before 1885",
    ],
  };
  for (const [qualifier, texts] of Object.entries(cases)) {
    it.each(texts)(`is ${qualifier} in %j`, (text) => {
      expect(read(text)).toEqual({ ...exact(1885), qualifier });
    });
  }

  it("is read with a month and a day too", () => {
    expect(read("до мая 1885")).toEqual({ ...exact(1885, 5), qualifier: "before" });
    expect(read("после 12.05.1885")).toEqual({ ...may12, qualifier: "after" });
    expect(read("ок. 12 мая 1885 г.")).toEqual({ ...may12, qualifier: "about" });
    expect(read("ABT MAY 1885")).toEqual({ ...exact(1885, 5), qualifier: "about" });
  });
});

describe("a date between two others", () => {
  const between = (from: ParsedDate["from"], to: ParsedDate["from"]): ParsedDate => ({
    qualifier: "between",
    calendar: "gregorian",
    from,
    to,
  });

  it.each([
    "между 1880 и 1885",
    "между 1880 и 1885 гг.",
    "Между 1880 и 1885 годами",
    "между 1880 г. и 1885 г.",
    "паміж 1880 і 1885 гг.",
    "паміж 1880 і 1885 гадамі",
    "między 1880 a 1885",
    "między 1880 a 1885 r.",
    "pomiędzy 1880 i 1885 rokiem",
    "między rokiem 1880 a 1885",
    "between 1880 and 1885",
    "betw. 1880 and 1885",
    "BET 1880 AND 1885",
    "1880-1885",
    "в 1880-1885 гг.",
    "w latach 1880-1885",
    "між 1880 і 1885",
    "между 1880-1885 гг.",
    "1880–1885",
    "1880 – 1885 гг.",
    "1880 -1885",
    "1880 г.-1885 г.",
    "1880—1885",
  ])("is read in %j", (text) => {
    expect(read(text)).toEqual(between({ year: 1880 }, { year: 1885 }));
  });

  it("takes from the second what the first leaves out", () => {
    const days = between({ year: 1885, month: 5, day: 5 }, { year: 1885, month: 5, day: 10 });
    expect(read("между 5 и 10 мая 1885")).toEqual(days);
    expect(read("между 5.05 и 10.05.1885")).toEqual(days);
    expect(read("BET 5 MAY 1885 AND 10 MAY 1885")).toEqual(days);
    expect(read("5.05.1885 - 10.05.1885")).toEqual(days);
    expect(read("5.05.1885-10.05.1885")).toEqual(days);
    const months = between({ year: 1885, month: 5 }, { year: 1885, month: 7 });
    expect(read("между маем и июлем 1885 г.")).toEqual(months);
    expect(read("między majem a lipcem 1885")).toEqual(months);
    expect(read("between May and July 1885")).toEqual(months);
  });

  it("does not take the day of the second", () => {
    const day = between({ year: 1885, month: 5 }, { year: 1885, month: 6, day: 5 });
    expect(read("between May and June 5, 1885")).toEqual(day);
    expect(read("BET MAY AND JUN 5 1885")).toEqual(day);
    expect(read("между маем и июнем 5 1885")).toEqual(day);
    expect(read("между маем и 5 июня 1885")).toEqual(day);
  });

  it.each(["1880-е", "1880-е гг.", "1880-е годы", "в 1880-х годах", "1880-я гады", "1880s"])(
    "is the decade %j",
    (text) => {
      expect(read(text)).toEqual(between({ year: 1880 }, { year: 1889 }));
    },
  );

  it("may be one year, or a year and a month of it", () => {
    expect(read("между 1885 и 1885")).toEqual(between({ year: 1885 }, { year: 1885 }));
    expect(read("между маем 1885 и 1885")).toEqual(
      between({ year: 1885, month: 5 }, { year: 1885 }),
    );
  });

  it.each([
    ["между 1885 и 1880", "the second is earlier"],
    ["1885-1880", "the second is earlier"],
    ["между 12.05.1885 и маем 1884", "the second is earlier"],
    ["между 5.07.1885 и 10.05.1885", "the second is earlier"],
    ["между 10 и 5 мая 1885", "the second is earlier"],
    ["между 31.02.1885 и 1886", "the first never was"],
    ["между 1885 и 31.02.1886", "the second never was"],
    ["1–13 мая 1885", "two days or a day in two calendars"],
    ["1900-е", "a decade or a century"],
    ["1800s", "a decade or a century"],
    ["1880-85", "a year without its century"],
    ["1885/86", "a year without its century"],
    ["1885-05", "a month or a year without its century"],
    ["между 5 и 1885", "nobody knows what 5 is"],
    ["около 1880-1885", "two qualifiers"],
    ["между около 1880 и 1885", "two qualifiers"],
    ["между 1880 и 1885?", "two qualifiers"],
    ["1-13 мая 1885", "two days or a day in two calendars"],
    ["FROM 1880 TO 1885", "a period"],
    ["с 1880 по 1885", "a period"],
    ["май–июнь 1885", "a period or a choice"],
    ["1885 или 1886", "one of two years"],
  ])("is not read in %j: %s", (text) => {
    expect(read(text)).toBeNull();
  });
});

describe("the calendar", () => {
  const julian: ParsedDate = { ...may12, calendar: "julian" };

  it.each([
    "12.05.1885 ст. ст.",
    "12.05.1885 ст.ст.",
    "12.05.1885 (ст. ст.)",
    "12 мая 1885 г. ст. ст.",
    "12 мая 1885 ст. стиля",
    "12 мая 1885 по ст. стилю",
    "12 мая 1885 (старый стиль)",
    "12 мая 1885 стараго стиля",
    "12 мая 1885 по ст. ст.",
    "12 мая 1885 г. по старому стилю",
    "12 мая ст. ст. 1885",
    "12 мая 1885, старого стиля",
    "12 траўня 1885 г. старога стылю",
    "12 мая 1885 г. па старым стылі",
    "12 maja 1885 r. st. st.",
    "12 maja 1885 starego stylu",
    "12 May 1885 OS",
    "12 May 1885 (O.S.)",
    "12 May 1885 old style",
    "12 May 1885 Julian",
    "@#DJULIAN@ 12 MAY 1885",
    "JULIAN 12 MAY 1885",
  ])("is Julian in %j", (text) => {
    expect(read(text)).toEqual(julian);
  });

  it.each([
    "12.05.1885 н. ст.",
    "12.05.1885 н.ст.",
    "12 мая 1885 нового стиля",
    "12 мая 1885 по н. стилю",
    "12 мая 1885 (новый стиль)",
    "12 мая 1885 новаго стиля",
    "12 мая 1885 (по новому стилю)",
    "12 мая 1885 г. новага стылю",
    "12 maja 1885 r. n. st.",
    "12 maja 1885 nowego stylu",
    "12 May 1885 NS",
    "12 May 1885 (N.S.)",
    "12 May 1885 new style",
    "12 May 1885 Gregorian",
    "@#DGREGORIAN@ 12 MAY 1885",
    "GREGORIAN 12 MAY 1885",
  ])("is Gregorian in %j", (text) => {
    expect(read(text)).toEqual(may12);
  });

  it("goes with a qualifier", () => {
    expect(read("до 12.05.1885 ст. ст.")).toEqual({ ...julian, qualifier: "before" });
    expect(read("ABT @#DJULIAN@ 12 MAY 1885")).toEqual({ ...julian, qualifier: "about" });
    expect(read("BET @#DJULIAN@ 1880 AND @#DJULIAN@ 1885")).toEqual({
      qualifier: "between",
      calendar: "julian",
      from: { year: 1880 },
      to: { year: 1885 },
    });
    expect(read("между 5 и 10 мая 1885 ст. ст.")).toEqual({
      qualifier: "between",
      calendar: "julian",
      from: { year: 1885, month: 5, day: 5 },
      to: { year: 1885, month: 5, day: 10 },
    });
  });

  it.each([
    "@#DHEBREW@ 12 TSH 5645",
    "@#DFRENCH R@ 12 VEND 12",
    "@#DHEBREW@ 1885",
    "BET @#DJULIAN@ 1880 AND 1885",
    "BET 1880 AND @#DJULIAN@ 1885",
    "12 мая 1885 ст. ст. н. ст.",
    "12 мая 1885 ст.",
    "12 мая 1885 гн. ст.",
    "12 мая 1885 ст. стихи",
  ])("is not read in %j", (text) => {
    expect(read(text)).toBeNull();
  });
});

describe("one day in both calendars", () => {
  const may1: ParsedDate = { ...exact(1885, 5, 1), calendar: "julian" };
  it.each([
    "1/13 мая 1885",
    "1/13 мая 1885 г.",
    "1 / 13 мая 1885",
    "1 (13) мая 1885 г.",
    "1(13) мая 1885",
    "1 [13] мая 1885",
    "13 (1) мая 1885",
    "01/13.05.1885",
    "1.05/13.05.1885",
    "01.05.1885 (13.05.1885)",
    "01.05.1885/13.05.1885",
    "1 мая / 13 мая 1885",
    "1 мая (13 мая) 1885 года",
    "1 мая 1885 (13 мая)",
    "13 мая 1885 (1 мая)",
    "13 мая 1885 г. (1 мая по ст. ст.)",
    "1 мая 1885 (13 мая по н. ст.)",
    "13.05.1885 (1.05 ст. ст.)",
    "1885 года мая 1/13",
    "1885 года мая 1/13 дня",
    "мая 1 (13) дня 1885 года",
    "May 1/13, 1885",
    "1/13 мая 1885 н. ст.",
    "1 мая 1885 г. (13 мая 1885 г.)",
    "1 мая 1885 ст. ст. (13 мая 1885 н. ст.)",
    "13 мая н. ст. (1 мая ст. ст.) 1885",
    "1/13 траўня 1885 г.",
    "1/13 maja 1885 r.",
    "1 (13) maja 1885 r.",
    "1/13 May 1885",
    "1/13 V 1885",
  ])("is read in %j", (text) => {
    expect(read(text)).toEqual(may1);
  });

  it("crosses months, years and a day the Gregorian calendar lacks", () => {
    const day = (year: number, month: number, at: number): ParsedDate => ({
      ...exact(year, month, at),
      calendar: "julian",
    });
    expect(read("20 апреля / 2 мая 1885")).toEqual(day(1885, 4, 20));
    expect(read("20 апреля (2 мая) 1885 г.")).toEqual(day(1885, 4, 20));
    expect(read("20.04/02.05.1885")).toEqual(day(1885, 4, 20));
    expect(read("25 декабря 1885 / 6 января 1886")).toEqual(day(1885, 12, 25));
    expect(read("29 февраля (13 марта) 1900")).toEqual(day(1900, 2, 29));
    expect(read("1/14 мая 1905")).toEqual(day(1905, 5, 1));
  });

  it("goes with a qualifier", () => {
    expect(read("около 1/13 мая 1885")).toEqual({ ...may1, qualifier: "about" });
  });

  it.each([
    ["1/14 мая 1885", "13 days between the calendars came in 1900"],
    ["1/12 мая 1885", "it is not the same day"],
    ["20/2 мая 1885", "the first month is not written"],
    ["25 декабря / 6 января 1886", "the first year is not written"],
    ["1 мая 1885 н. ст. (13 мая 1885 ст. ст.)", "the styles are the other way round"],
    ["13 мая 1885 ст. ст. (1 мая 1885)", "the styles are the other way round"],
    ["31 февраля (15 марта) 1885", "the first never was"],
    ["17 февраля (29 февраля) 1885", "the second never was"],
    ["май 1885 (13 мая 1885)", "the first is not a day"],
    ["19 апреля (май) 1885", "the second is not a day"],
    ["12 (мая) 1885", "a month in brackets"],
    ["25 декабря 1885 (6 января)", "the second year is not written and is another"],
    ["1 мая 1885 (12 мая)", "it is not the same day"],
    ["1/13 мая 1885 ст. ст.", "the style contradicts the second day"],
  ])("is not read in %j: %s", (text) => {
    expect(read(text)).toBeNull();
  });
});

describe("what is not read", () => {
  it.each([
    "",
    " ",
    "на Покров 1885",
    "в голодный год",
    "неизвестно",
    "12 мая",
    "12.05.",
    "12.05.85",
    "85",
    "май 85 г.",
    "'85",
    "885",
    "188?",
    "18??",
    "XIX век",
    "19 в.",
    "лето 1885",
    "конец 1885",
    "spring 1885",
    "род. 1885",
    "1885 г.р.",
    "[1885]",
    "(около Пасхи)",
    "INT 1885 (about 1885)",
    "45 B.C.",
    "1731/32",
    "12 мая 1885, 12 часов",
    "от 12 мая 1885",
    "к 1885",
    "с 1885",
    "c 1885 г.",
    "c мая 1885",
    "18850512",
    "12051885",
    "１２.０５.１８８５",
    "1885\u202e",
    "👶 1885",
    "ז׳ אייר תרמ״ה",
    "до",
    "около",
    "между и",
    "1885 1886",
    "1885 г. г.",
    "0000",
    "0885",
  ])("%j stays text", (text) => {
    expect(parseFuzzyDate(text)).toEqual({ text, parsed: null });
  });

  it("is a text too long for a date", () => {
    const text = `${" ".repeat(200)}1885`;
    expect(parseFuzzyDate(text)).toEqual({ text, parsed: null });
  });
});

const anyText = fc.oneof(
  fc.string({ unit: "binary" }),
  fc.string({ unit: "grapheme", maxLength: 600 }),
  // Pieces of dates in any order.
  fc
    .array(
      fc.constantFrom(
        ..."12 31 02 05 1885 1886 мая май V May . .. / - – ( ) [ ] ? , ст. ст.ст. н. до около между и BET AND @#DJULIAN@ г. 1880-е".split(
          " ",
        ),
      ),
      { maxLength: 12 },
    )
    .chain((parts) => fc.constantFrom("", " ").map((by) => parts.join(by))),
);

describe("any text", () => {
  it("is kept as it was written", () => {
    fc.assert(fc.property(anyText, (text) => parseFuzzyDate(text).text === text));
  });

  it("is read into a date that exists, or not at all", () => {
    const daysIn = (year: number, month: number, calendar: ParsedDate["calendar"]) =>
      month === 2 && calendar === "julian"
        ? year % 4 === 0
          ? 29
          : 28
        : new Date(Date.UTC(year, month, 0)).getUTCDate();
    fc.assert(
      fc.property(anyText, (text) => {
        const parsed = read(text);
        if (parsed === null) return;
        for (const { year, month, day } of [parsed.from, parsed.to ?? parsed.from]) {
          // The century is always the text's own.
          expect(text).toContain(String(Math.floor(year / 10)));
          if (month !== undefined) expect(month >= 1 && month <= 12).toBe(true);
          if (day !== undefined) {
            expect(day >= 1 && day <= daysIn(year, month ?? 0, parsed.calendar)).toBe(true);
          }
        }
        expect(parsed.to !== undefined).toBe(parsed.qualifier === "between");
      }),
      { numRuns: 2000 },
    );
  });
});

describe("the sort key", () => {
  const key = (text: string) => sortKey(parseFuzzyDate(text));
  const msInDay = 86_400_000;
  const day = (d: Date) => `${d.getUTCDate()}.${d.getUTCMonth() + 1}.${d.getUTCFullYear()}`;
  const daysFrom = (from: number, to: number) =>
    fc
      .integer({ min: Date.UTC(from, 0, 1) / msInDay, max: Date.UTC(to, 11, 31) / msInDay })
      .map((days) => new Date(days * msInDay));

  it("counts days as the snapshot does", () => {
    expect(key("01.01.2000")).toBe(2451545);
  });

  it("counts Gregorian days one by one", () => {
    const dates = daysFrom(1000, 2999);
    fc.assert(
      fc.property(dates, dates, (a, b) => {
        const [first, second] = [key(day(a)), key(day(b))];
        if (first === null || second === null) throw new Error("not read");
        expect(second - first).toBe((b.getTime() - a.getTime()) / msInDay);
      }),
    );
  });

  it.each([
    // The calendars part further on 29 February 1900, which only the Julian one has.
    ["12 days", "1801-01-01", "1900-02-28", 12],
    ["13 days", "1900-03-01", "2099-12-31", 13],
  ])("puts a Julian day at its Gregorian one, %s later", (_, from, to, days) => {
    const inside = daysFrom(1801, 2099).filter(
      (d) => d >= new Date(`${from}T00:00Z`) && d <= new Date(`${to}T00:00Z`),
    );
    fc.assert(
      fc.property(inside, (d) => {
        expect(key(`${day(d)} ст. ст.`)).toBe((key(day(d)) ?? Number.NaN) + days);
      }),
    );
  });

  it("puts the Julian 29 February 1900 at 13 March", () => {
    expect(key("29.02.1900 ст. ст.")).toBe(key("13.03.1900"));
  });

  it("is the first day of a month or a year", () => {
    expect(key("май 1885")).toBe(key("01.05.1885"));
    expect(key("1885")).toBe(key("01.01.1885"));
    expect(key("около 1885")).toBe(key("01.01.1885"));
    expect(key("после 1885")).toBe(key("01.01.1885"));
    expect(key("между 1880 и 1885")).toBe(key("01.01.1880"));
    expect(key("1885 ст. ст.")).toBe(key("13.01.1885"));
    expect(key("1/13 мая 1885")).toBe(key("13.05.1885"));
  });

  it("is nothing for a date only known to be before another, and for an unread one", () => {
    expect(key("до 1885")).toBeNull();
    expect(key("не позднее 12.05.1885")).toBeNull();
    expect(key("на Покров 1885")).toBeNull();
    expect(key("")).toBeNull();
  });
});
