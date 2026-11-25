import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { foldName } from "../../src/kernel/name-form";

describe("folded names meet", () => {
  it.each([
    // Case.
    ["СНЕЖЕНЬ", "снежень"],
    ["ŁUKASZ", "łukasz"],
    // ё, and the letters of the old spelling.
    ["Фёдоръ", "федор"],
    ["Ѳедоръ", "Фёдор"],
    ["Ѳома", "Фома"],
    ["Матвѣй", "Матвей"],
    ["Снѣжень", "Снежень"],
    ["Марія", "Мария"],
    ["Іосифъ", "Иосиф"],
    ["Мѵрра", "Мирра"],
    ["Сидоръ Вересъ", "Сидор Верес"],
    ["Дубъ-Вересъ", "Дуб-Верес"],
    ["ВЕРЕСЪ", "верес"],
    // Belarusian and Ukrainian letters.
    ["Васіль", "Василь"],
    ["Вераснёў", "Вераснеу"],
    ["Ґанна", "Ганна"],
    // Polish.
    ["Łukasz", "lukasz"],
    ["Żółć", "Zolc"],
    ["Ścięgosław", "Sciegoslaw"],
    ["Jędrzej", "Jedrzej"],
    ["Źrebiąń", "zrebian"],
    // Lithuanian.
    ["Klevutytė", "Klevutyte"],
    ["Žąsinčiūkšvėįų", "zasinciuksveiu"],
    // Other Latin letters.
    ["Søren", "Soren"],
    ["Groß", "Gross"],
    ["GROẞ", "gross"],
    ["Æneas", "Aeneas"],
    ["Œdip", "Oedip"],
    ["Đorđe", "Dorde"],
    ["Guðrún", "Gudrun"],
    ["Þorvald", "Thorvald"],
    ["Theodōrus", "Theodorus"],
    ["İzzet", "izzet"],
    ["ıtır", "itir"],
    // Yiddish: points and digraphs.
    ["שנייבלא\u05b7ט", "שנייבלאט"],
    ["שנײבלא\u05b7ט", "שנייבלאט"],
    ["װא\u05b8לף", "וואלף"],
    ["הױז", "הויז"],
    // Apostrophes.
    ["Дар'я", "Дарʼя"],
    ["Дар’я", "Даря"],
    ["D'Arno", "D’Arno"],
    ["O`Dell", "O´Dell"],
    ["ז׳אן", "זאן"],
    ["ז'אן", "ז׳אן"],
    ['רמב"ם', "רמב״ם"],
    // Spaces, dashes and what is not seen.
    ["  Анна   Мария ", "анна мария"],
    ["Анна\u00a0Мария", "Анна Мария"],
    ["Верес–Дуб", "Верес-Дуб"],
    ["Верес−Дуб", "Верес-Дуб"],
    ["שרה־לאה", "שרה-לאה"],
    ["Вере\u00adсень", "Вересень"],
    ["\u200fשנייבלאט\u200e", "שנייבלאט"],
    // The same letters written in other code points.
    ["Фёдор й".normalize("NFD"), "Фёдор й"],
    ["Żółć".normalize("NFD"), "Żółć"],
  ])("%j and %j", (a, b) => {
    expect(foldName(a)).toBe(foldName(b));
  });
});

describe("folded names do not meet", () => {
  it.each([
    // Endings are a part of the name.
    ["Мховский", "Мховская"],
    ["Mchowski", "Mchowska"],
    ["Клевутис", "Клевут"],
    ["Klevutis", "Klevutytė"],
    ["Klevutytė", "Klevutienė"],
    ["Вереснев", "Вереснева"],
    ["Вереснёў", "Вереснев"],
    ["Верес", "Вересь"],
    ["Верес", "Вереса"],
    ["Фёдор", "Федора"],
    ["Фёдор", "Феодор"],
    ["Матвей", "Матфей"],
    // Letters that only look or sound alike.
    ["Майров", "Маиров"],
    ["Эльма", "Ельма"],
    ["Быков", "Биков"],
    ["Щуров", "Шуров"],
    ["Гацак", "Хацак"],
    ["Žemas", "Žiemas"],
    ["Szymon", "Šymon"],
    ["Rzepa", "Żepa"],
    ["Wit", "Vit"],
    // ъ inside a word is read, at its end it is not.
    ["Подъяров", "Подяров"],
    ["Подъяров", "Подьяров"],
    // Scripts. A name in another one is a form of its own.
    ["Васіль", "Vasil"],
    ["Анна", "Anna"],
    ["Аnna", "Anna"],
    ["יוסף", "Иосиф"],
    // Words.
    ["Анна Мария", "Аннамария"],
    ["Верес-Дуб", "Вересдуб"],
    ["Anna", "Hanna"],
    ["Анна", ""],
  ])("%j and %j", (a, b) => {
    expect(foldName(a)).not.toBe(foldName(b));
  });
});

describe("folding", () => {
  const letters = [
    ..."ЁёЪъІіЇѣѳѵЎўйИи'’ʼ´`Łłßẞİıæʼnﬁℌ- –",
    "\u0306",
    "\u0301",
    "\u0308",
    "\u200d",
    "\u00ad",
    "\u05b7",
    "\ud800",
  ];
  const names = fc.oneof(
    fc.string({ unit: "binary", maxLength: 600 }),
    fc.string({ unit: "grapheme" }),
    fc.string({ unit: fc.constantFrom(...letters) }),
  );

  it("of a folded name changes nothing", () => {
    fc.assert(
      fc.property(names, (name) => foldName(foldName(name)) === foldName(name)),
      { numRuns: 3000 },
    );
  });

  it("of every character alone or before a letter changes nothing the second time", () => {
    for (let code = 0; code <= 0xffff; code++) {
      for (const name of [String.fromCharCode(code), `${String.fromCharCode(code)}й`]) {
        const folded = foldName(name);
        if (foldName(folded) !== folded) expect(foldName(folded)).toBe(folded);
      }
    }
  });

  it("does not see the case", () => {
    const unit = fc.constantFrom(..."абвёйіўѣжъ abcłżąśėūßæ-'");
    fc.assert(
      fc.property(fc.string({ unit }), (name) => foldName(name.toUpperCase()) === foldName(name)),
    );
  });

  it("keeps what is not a letter of these languages", () => {
    expect(foldName("👶🏽 12")).toBe("👶🏽 12");
    expect(foldName("हिन्दी")).toBe("हिन्दी");
    expect(foldName("한글")).toBe("한글");
  });

  it("takes a long name and an empty one", () => {
    expect(foldName("Ё".repeat(500))).toBe("е".repeat(500));
    // A pattern that looks back would take seconds here.
    expect(foldName(`${"ъ".repeat(50_000)}а`)).toHaveLength(50_001);
    expect(foldName("ъ".repeat(50_000))).toBe("");
    expect(foldName("")).toBe("");
    expect(foldName("ъ")).toBe("");
  });
});
