import { describe, expect, it } from "vitest";
import { NICKNAME_ADJECTIVES, NICKNAME_CREATURES } from "../../src/shared/nickname";
import { nameOf } from "../../web/access/nickname";
import { type Key, locales, type Params, t } from "../../web/i18n/t";

const pairs = NICKNAME_ADJECTIVES.flatMap((adjective) =>
  NICKNAME_CREATURES.map((creature) => ({ adjective, creature })),
);

// Russian adjectives agree with the noun. A noun in -а/-я is feminine and a noun in a hard
// consonant masculine; a noun in -ь may be either (Лось, Рысь, Лебедь, Снегирь) and is pinned below.
const masculine = /(ый|ий|ой|ийся)$/;
const feminine = /(ая|яя|аяся)$/;

describe("a nickname", () => {
  it("reads as two words in every language, for every pair", () => {
    for (const locale of locales) {
      const tr = (key: Key, params?: Params) => t(locale, key, params);
      for (const nickname of pairs) {
        const text = nameOf(tr, { name: "", nickname });
        expect(text.split(" ")).toHaveLength(2);
        expect(text).not.toMatch(/nickname\.|undefined|\{/);
      }
    }
  });

  it("agrees in gender in Russian", () => {
    const tr = (key: Key, params?: Params) => t("ru", key, params);
    for (const nickname of pairs) {
      const [adjective = "", creature = ""] = nameOf(tr, { name: "", nickname }).split(" ");
      expect(adjective).toMatch(feminine.test(adjective) ? feminine : masculine);
      if (/[ая]$/.test(creature)) expect(adjective).toMatch(feminine);
      if (/[^аяь]$/.test(creature)) expect(adjective).toMatch(masculine);
    }
    expect(nameOf(tr, { name: "", nickname: { adjective: "wild", creature: "owl" } })).toBe(
      "Бешеная Сова",
    );
    expect(nameOf(tr, { name: "", nickname: { adjective: "wild", creature: "hedgehog" } })).toBe(
      "Бешеный Ёж",
    );
    expect(nameOf(tr, { name: "", nickname: { adjective: "sly", creature: "lynx" } })).toBe(
      "Хитрая Рысь",
    );
    expect(nameOf(tr, { name: "", nickname: { adjective: "sly", creature: "moose" } })).toBe(
      "Хитрый Лось",
    );
    expect(nameOf(tr, { name: "", nickname: { adjective: "gentle", creature: "swan" } })).toBe(
      "Ласковый Лебедь",
    );
    expect(
      nameOf(tr, { name: "", nickname: { adjective: "spirited", creature: "bullfinch" } }),
    ).toBe("Задорный Снегирь");
    expect(nameOf(tr, { name: "", nickname: { adjective: "brilliant", creature: "mink" } })).toBe(
      "Гениальная Норка",
    );
  });

  it("gives way to a name, and to words the page does not know", () => {
    const tr = (key: Key, params?: Params) => t("en", key, params);
    const nickname = { adjective: "wild", creature: "dinosaur" };
    expect(nameOf(tr, { name: "", nickname })).toBe("Wild Dinosaur");
    expect(nameOf(tr, { name: "Anna", nickname })).toBe("Anna");
    expect(nameOf(tr, { name: "", nickname: { adjective: "perky", creature: "tiger" } })).toBe(
      "Peppy Tiger",
    );
    expect(nameOf(tr, { name: "", nickname: { adjective: "new", creature: "owl" } })).toBe("");
    expect(nameOf(tr, { name: "", nickname: { adjective: "wild", creature: "new" } })).toBe("");
  });
});
