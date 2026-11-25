import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Change, type EventKind, type LifeEvent, lifeOver } from "../../src/contexts/life";
import { placesOver } from "../../src/contexts/places";
import { parseFuzzyDate } from "../../src/kernel/fuzzy-date";
import type { EventId, PlaceId } from "../../src/kernel/id";
import { Family, person, union } from "./memory-kinship";
import { MemoryLife, MemoryPlaces } from "./memory-others";

const eventId = (name: string) => `event_${name}` as EventId;
const place = (name: string) => `place_${name}` as PlaceId;

const event = (
  name: string,
  kind: EventKind,
  who: string | string[],
  more: Partial<LifeEvent> = {},
): LifeEvent => ({
  id: eventId(name),
  kind,
  title: "",
  date: null,
  place: null,
  participants: [who]
    .flat()
    .map((one, i) => ({ person: person(one), role: i === 0 ? "principal" : "witness" })),
  union: null,
  main: true,
  certainty: "hypothesis",
  note: "",
  ...more,
});
const on = (text: string): Partial<LifeEvent> => ({ date: parseFuzzyDate(text) });

const start = (...names: string[]) => {
  const family = new Family(...names);
  const placesStore = new MemoryPlaces();
  const places = placesOver(placesStore);
  places.add({ id: place("town"), names: [], affiliations: [], coordinates: null });
  const store = new MemoryLife();
  const life = lifeOver(store, family.kinship, places);
  const record = (one: LifeEvent): Change => {
    const result = life.record(one);
    if (!result.ok) throw new Error(`refused: ${JSON.stringify(result.error)}`);
    return result.value;
  };
  const ids = (who: string) => life.eventsOf(person(who)).map(({ id }) => id.slice(6));
  return { family, placesStore, life, store, record, ids };
};
const refused = (code: string, more: object = {}) => ({ ok: false, error: { code, ...more } });

describe("an event", () => {
  it("is kept with whom it is about and found by everybody who takes part", () => {
    const { life, record, ids } = start("a", "godmother", "other");
    const baptism = event("e", "baptism", ["a", "godmother"], { place: place("town") });
    expect(record(baptism).map(({ id }) => id)).toEqual([person("a"), person("godmother")]);
    expect(life.eventsOf(person("a"))).toEqual([baptism]);
    expect(life.eventsOf(person("godmother"))).toEqual([baptism]);
    expect(ids("other")).toEqual([]);
    expect(life.event(eventId("e"))).toEqual(baptism);
    expect(life.event(eventId("none"))).toBeNull();
  });

  it("is stored with an unknown place, an unread date and any kind", () => {
    const { life, record } = start("a");
    const kinds: EventKind[] = [
      "birth",
      "baptism",
      "wedding",
      "divorce",
      "residence",
      "service",
      "occupation",
      "emigration",
      "repression",
      "death",
      "burial",
      "other",
    ];
    for (const kind of kinds) record(event(kind, kind, "a", on("на Покров")));
    record(event("own", "other", "a", { title: "Посадил сад", note: "👶 לאה" }));
    expect(life.eventsOf(person("a"))).toHaveLength(13);
    expect(life.event(eventId("own"))).toMatchObject({ title: "Посадил сад", note: "👶 לאה" });
    expect(life.event(eventId("birth"))).toMatchObject({ place: null, date: { parsed: null } });
  });

  it("is refused when somebody or something it names is missing", () => {
    const { life, store } = start("a", "b");
    expect(life.record(event("e", "birth", "x"))).toEqual(refused("missing", { id: person("x") }));
    expect(life.record(event("e", "birth", ["a", "x"]))).toEqual(
      refused("missing", { id: person("x") }),
    );
    expect(life.record(event("e", "birth", "a", { place: place("x") }))).toEqual(
      refused("missing", { id: place("x") }),
    );
    expect(life.record(event("e", "wedding", "a", { union: union("x") }))).toEqual(
      refused("missing", { id: union("x") }),
    );
    expect(store.saves).toBe(0);
  });

  it("is refused about nobody, or with somebody twice in one role", () => {
    const { life, ids } = start("a", "b");
    expect(life.record(event("e", "birth", "a", { participants: [] }))).toEqual(refused("nobody"));
    const twice = event("e", "wedding", ["a", "b", "b"]);
    expect(life.record(twice)).toEqual(refused("duplicate"));
    const roles = [
      { person: person("a"), role: "principal" },
      { person: person("a"), role: "witness" },
    ];
    expect(life.record(event("e", "wedding", "a", { participants: roles })).ok).toBe(true);
    expect(ids("a")).toEqual(["e"]);
  });

  it("belongs to a union", () => {
    const { family, life, record, ids } = start("a", "b");
    family.withUnion("ab", "a", "b");
    record(event("e", "wedding", ["a", "b"], { union: union("ab") }));
    expect(life.event(eventId("e"))?.union).toBe(union("ab"));
    expect(ids("b")).toEqual(["e"]);
  });

  it("is recorded again whatever it names has gone since", () => {
    const { family, placesStore, life, record } = start("a", "b", "c");
    family.withUnion("ab", "a", "b");
    const wedding = event("e", "wedding", ["a", "b"], { union: union("ab"), place: place("town") });
    record(wedding);
    family.do({ do: "remove-union", id: union("ab") });
    family.store.people.delete(person("b"));
    placesStore.places.rows.delete(place("town"));
    expect(life.record({ ...wedding, certainty: "unresolved" }).ok).toBe(true);
    expect(life.record({ ...wedding, union: union("x") })).toEqual(
      refused("missing", { id: union("x") }),
    );
    expect(life.record({ ...wedding, place: place("x") })).toEqual(
      refused("missing", { id: place("x") }),
    );
    const participants = [...wedding.participants, { person: person("x"), role: "witness" }];
    expect(life.record({ ...wedding, participants })).toEqual(
      refused("missing", { id: person("x") }),
    );
  });

  it("is always the main one of a kind that has no versions", () => {
    const { life, record } = start("a");
    record(event("e", "birth", "a"));
    record(event("other", "birth", "a", { main: false }));
    record(event("other", "residence", "a", { main: false }));
    expect(life.event(eventId("other"))?.main).toBe(true);
  });

  it("is recorded again in its place", () => {
    const { life, record, ids, store } = start("a", "b", "c");
    record(event("first", "residence", "a"));
    record(event("e", "baptism", ["a", "b"]));
    record(event("e", "burial", ["a", "c"], { note: "новое" }));
    expect(ids("a")).toEqual(["first", "e"]);
    expect(ids("b")).toEqual([]);
    expect(ids("c")).toEqual(["e"]);
    expect(life.event(eventId("e"))).toMatchObject({ kind: "burial", note: "новое" });
    const { saves } = store;
    expect(record(event("e", "burial", ["a", "c"], { note: "новое" }))).toEqual([]);
    expect(store.saves).toBe(saves);
  });

  it("stays with whom it is about: its citations hold to them", () => {
    const { life, record } = start("a", "b");
    record(event("e", "baptism", ["a", "b"]));
    expect(life.record(event("e", "baptism", ["b", "a"]))).toEqual(refused("another-subject"));
    expect(life.record(event("e", "baptism", "b"))).toEqual(refused("another-subject"));
  });

  it("is removed from everybody", () => {
    const { life, record, ids, store } = start("a", "b");
    record(event("e", "baptism", ["a", "b"]));
    expect(life.remove(eventId("e")).ok).toBe(true);
    expect(ids("a")).toEqual([]);
    expect(ids("b")).toEqual([]);
    expect(life.remove(eventId("e"))).toEqual(refused("missing", { id: eventId("e") }));
    expect(store.lives.rows.get(person("b"))?.takesPart).toEqual([]);
  });

  it("comes in the order of the dates, those without a day last and as recorded", () => {
    const { record, ids } = start("a", "b");
    record(event("unread", "other", "a", on("в голодный год")));
    record(event("none", "other", "a"));
    record(event("death", "death", "a", on("1950")));
    record(event("guest", "baptism", ["b", "a"], on("12.05.1920")));
    record(event("birth", "birth", "a", on("около 1885")));
    expect(ids("a")).toEqual(["birth", "guest", "death", "unread", "none"]);
  });
});

describe.each(["birth", "death"] as const)("a version of a %s", (kind) => {
  const mains = (life: ReturnType<typeof start>["life"], who = "a") =>
    life
      .eventsOf(person(who))
      .filter((one) => one.main && one.kind === kind)
      .map(({ id }) => id.slice(6));

  it("that is made the main one clears the other", () => {
    const { life, record } = start("a");
    record(event("one", kind, "a"));
    record(event("two", kind, "a", { main: false }));
    expect(mains(life)).toEqual(["one"]);
    record(event("two", kind, "a"));
    expect(mains(life)).toEqual(["two"]);
    expect(life.eventsOf(person("a"))).toHaveLength(2);
  });

  it("is the main one when there is no other", () => {
    const { life, record } = start("a");
    record(event("one", kind, "a", { main: false }));
    expect(mains(life)).toEqual(["one"]);
    record(event("one", kind, "a", { main: false, note: "и теперь" }));
    expect(mains(life)).toEqual(["one"]);
  });

  it("that is the main one gives way to the next when it is put down, removed or no longer one", () => {
    const { life, record } = start("a");
    for (const name of ["one", "two", "three"]) {
      record(event(name, kind, "a", { main: name === "one" }));
    }
    record(event("one", kind, "a", { main: false }));
    expect(mains(life)).toEqual(["two"]);
    life.remove(eventId("two"));
    expect(mains(life)).toEqual(["one"]);
    record(event("one", "other", "a"));
    expect(mains(life)).toEqual(["three"]);
  });

  it("that is the main one is told, and it is never that of a child", () => {
    const { life, record } = start("father", "child");
    record(event("child", kind, ["child", "father"]));
    expect(life.main(person("father"), kind)).toBeNull();
    record(event("one", kind, "father"));
    record(event("two", kind, "father", { main: false }));
    expect(life.main(person("father"), kind)?.id).toBe(eventId("one"));
    expect(life.main(person("nobody"), kind)).toBeNull();
  });

  it("leaves those of others and of other kinds alone", () => {
    const { life, record } = start("a", "b");
    const other = kind === "birth" ? "death" : "birth";
    record(event("mine", kind, "a"));
    record(event("other", other, "a"));
    record(event("theirs", kind, ["b", "a"]));
    record(event("residence", "residence", "a"));
    expect(mains(life, "b")).toEqual(["theirs"]);
    expect(
      life
        .eventsOf(person("a"))
        .filter((one) => one.main)
        .map(({ id }) => id.slice(6)),
    ).toEqual(["mine", "other", "residence", "theirs"]);
  });
});

describe("a warning", () => {
  it("of a death before the birth blocks nothing", () => {
    const { life, record } = start("a");
    record(event("birth", "birth", "a", on("12.05.1885")));
    record(event("death", "death", "a", on("11.05.1885")));
    expect(life.warnings(person("a"))).toEqual([
      { code: "death-before-birth", birth: eventId("birth"), death: eventId("death") },
    ]);
  });

  it("is given only when the dates leave no doubt", () => {
    const pairs: [string, string, boolean][] = [
      ["12.05.1885", "1885", false],
      ["12.05.1885", "05.1885", false],
      ["1885", "01.01.1885", false],
      ["1885", "31.12.1884", true],
      ["1885", "1884", true],
      ["после 1885", "1884", true],
      ["после 1885", "1886", false],
      ["до 1885", "1800", false],
      ["1885", "до 1884", true],
      ["1885", "до 1885", false],
      ["1885", "после 1800", false],
      ["между 1880 и 1885", "1881", false],
      ["между 1880 и 1885", "1879", true],
      ["1885", "на Покров", false],
      ["на Покров", "1885", false],
      // "About" is taken for five years either way.
      ["около 1885", "1881", false],
      ["около 1885", "1879", true],
      ["1885", "около 1881", false],
      ["1885", "около 1879", true],
      ["1.05.1885 ст. ст.", "12.05.1885", true],
      ["1.05.1885 ст. ст.", "13.05.1885", false],
    ];
    for (const [birth, death, isOdd] of pairs) {
      const { life, record } = start("a");
      record(event("birth", "birth", "a", on(birth)));
      record(event("death", "death", "a", on(death)));
      expect([birth, death, life.warnings(person("a")).length]).toEqual([
        birth,
        death,
        isOdd ? 1 : 0,
      ]);
    }
  });

  it("goes by the main versions", () => {
    const { life, record } = start("a");
    record(event("birth", "birth", "a", on("1885")));
    record(event("wrong", "death", "a", { ...on("1880"), main: false }));
    record(event("death", "death", "a", on("1950")));
    expect(life.warnings(person("a"))).toEqual([]);
    record(event("wrong", "death", "a", on("1880")));
    expect(life.warnings(person("a"))).toHaveLength(1);
  });

  it("of a parent younger than the child is given at both", () => {
    for (const kind of ["blood", "adoption"] as const) {
      const { family, life, record } = start("child", "mother");
      family.withParent("child", "mother", { kind, main: false });
      family.withParent("child", "unknown");
      record(event("one", "birth", "child", on("1885")));
      record(event("two", "birth", "mother", on("1890")));
      const warning = {
        code: "parent-younger-than-child",
        parent: person("mother"),
        child: person("child"),
      };
      expect(life.warnings(person("child"))).toEqual([warning]);
      expect(life.warnings(person("mother"))).toEqual([warning]);
    }
  });

  it("of a parent is not given for a guardian, an unknown kind or the same year", () => {
    for (const kind of ["guardianship", "unknown"] as const) {
      const { family, life, record } = start("child", "guardian");
      family.withParent("child", "guardian", { kind });
      record(event("one", "birth", "child", on("1885")));
      record(event("two", "birth", "guardian", on("1890")));
      expect(life.warnings(person("child"))).toEqual([]);
      expect(life.warnings(person("guardian"))).toEqual([]);
    }
    const { family, life, record } = start("child", "mother");
    family.withParent("child", "mother");
    record(event("one", "birth", "child", on("1885")));
    record(event("two", "birth", "mother", on("12.05.1885")));
    expect(life.warnings(person("child"))).toEqual([]);
  });

  it("of one parent in two kinds is given once", () => {
    const { family, life, record } = start("child", "mother");
    family.withParent("child", "mother");
    family.withParent("child", "mother", { id: "more", kind: "adoption" });
    record(event("one", "birth", "child", on("1885")));
    record(event("two", "birth", "mother", on("1890")));
    expect(life.warnings(person("child"))).toHaveLength(1);
    expect(life.warnings(person("mother"))).toHaveLength(1);
  });

  it("of an event after the death is given to whoever was dead", () => {
    const { life, record } = start("a", "b");
    record(event("death", "death", "a", on("1950")));
    record(event("wedding", "wedding", ["b", "a"], on("1952")));
    record(event("residence", "residence", "a", on("1951")));
    record(
      event("own", "service", "a", {
        ...on("1953"),
        participants: [{ person: person("a"), role: "солдат" }],
      }),
    );
    for (const role of ["principal", "godparent"]) {
      const participants = [
        { person: person("b"), role: "principal" },
        { person: person("a"), role },
      ];
      record(event(role, "baptism", "b", { ...on("1954"), participants }));
    }
    expect(life.warnings(person("a"))).toEqual([
      { code: "event-after-death", event: eventId("residence"), death: eventId("death") },
      { code: "event-after-death", event: eventId("wedding"), death: eventId("death") },
      { code: "event-after-death", event: eventId("own"), death: eventId("death") },
      { code: "event-after-death", event: eventId("principal"), death: eventId("death") },
      { code: "event-after-death", event: eventId("godparent"), death: eventId("death") },
    ]);
    expect(life.warnings(person("b"))).toEqual([]);
  });

  it("of an event after the death is not given for what may follow it", () => {
    const { life, record } = start("a", "child");
    record(event("death", "death", "a", on("1950")));
    record(event("version", "death", "a", { ...on("1960"), main: false }));
    record(event("burial", "burial", "a", on("1951")));
    record(event("sign", "other", "a", { ...on("1990"), title: "Памятный знак" }));
    record(event("posthumous", "birth", ["child", "a"], on("1951")));
    const father = (who: string) => [
      { person: person(who), role: "principal" },
      { person: person("a"), role: "father" },
      { person: person(who), role: "witness" },
    ];
    for (const kind of ["baptism", "wedding"] as const) {
      record(event(kind, kind, "child", { ...on("1952"), participants: father("child") }));
    }
    record(event("cleared", "repression", "a", { ...on("1957"), title: "Реабилитация" }));
    record(event("residence", "residence", "a", on("1950")));
    record(event("unread", "residence", "a", on("на Покров")));
    expect(life.warnings(person("a"))).toEqual([]);
  });

  it("of a birth after the death is one warning", () => {
    const { life, record } = start("a");
    record(event("birth", "birth", "a", on("1960")));
    record(event("death", "death", "a", on("1950")));
    expect(life.warnings(person("a")).map(({ code }) => code)).toEqual(["death-before-birth"]);
  });

  it("is never given about a missing person", () => {
    const { life } = start();
    expect(life.warnings(person("x"))).toEqual([]);
  });
});

describe("a life", () => {
  const people = ["a", "b", "c"];
  const one = fc.constantFrom(...people);
  const kind = fc.constantFrom<EventKind>("birth", "birth", "death", "wedding", "other");
  const step = fc.oneof(
    {
      weight: 5,
      arbitrary: fc.record({
        record: fc.constantFrom("1", "2", "3", "4", "5"),
        kind,
        who: fc.uniqueArray(one, { minLength: 1 }),
        main: fc.boolean(),
        date: fc.constantFrom("1885", "1890", "на Покров"),
      }),
    },
    fc.record({ remove: fc.constantFrom("1", "2", "3", "4", "5") }),
  );
  const steps = fc.array(step, { minLength: 10, maxLength: 60, size: "max" });

  it("holds together after any steps, and a change replays and undoes", () => {
    fc.assert(
      fc.property(steps, (list) => {
        const { life, store } = start(...people);
        const copy = new MemoryLife();
        for (const next of list) {
          const before = structuredClone(store.lives.rows);
          const result =
            "remove" in next
              ? life.remove(eventId(next.remove))
              : life.record(
                  event(next.record, next.kind, next.who, { main: next.main, ...on(next.date) }),
                );
          if (!result.ok) {
            expect(store.lives.rows).toEqual(before);
            continue;
          }
          const all = [...store.lives.rows.values()];
          const events = all.flatMap((row) => row.events);
          expect(new Set(events.map(({ id }) => id)).size).toBe(events.length);
          for (const { id, events: own, takesPart } of all) {
            for (const { participants } of own) expect(participants[0]?.person).toBe(id);
            for (const versioned of ["birth", "death"]) {
              const versions = own.filter((e) => e.kind === versioned);
              const mains = versions.filter(({ main }) => main).length;
              expect(mains).toBe(versions.length === 0 ? 0 : 1);
            }
            const elsewhere = events
              .filter((e) => e.participants.slice(1).some((p) => p.person === id))
              .map((e) => e.id);
            expect(takesPart.map(({ event: e }) => e).sort()).toEqual(elsewhere.sort());
          }
          copy.save(result.value);
          expect(copy.lives.rows).toEqual(store.lives.rows);
          copy.save(
            result.value.map(({ before: was, after, ...write }) => ({
              ...write,
              before: after,
              after: was,
            })),
          );
          expect(copy.lives.rows).toEqual(before);
          copy.save(result.value);
        }
      }),
    );
  }, 30_000);
});
