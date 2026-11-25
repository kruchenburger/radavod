import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { type Citation, evidenceOver, type Source } from "../../src/contexts/evidence";
import type { CitationId, FactRef, PersonId, SourceId, UnionId } from "../../src/kernel/id";
import { MemoryEvidence } from "./memory-others";

const source = (name: string) => `source_${name}` as SourceId;
const citationId = (name: string) => `citation_${name}` as CitationId;
const anna = "person_anna" as PersonId;
const couple = "union_couple" as UnionId;
const birth: FactRef = { subject: anna, fact: "event:e1" };

const newSource = (name: string, more: Partial<Source> = {}): Omit<Source, "version"> => ({
  id: source(name),
  kind: "document",
  title: "Метрическая книга",
  repository: "",
  note: "",
  ...more,
});

const citation = (name: string, more: Partial<Citation> = {}): Citation => ({
  id: citationId(name),
  source: source("book"),
  fact: birth,
  page: "л. 12",
  quote: "",
  ...more,
});

const start = () => {
  const store = new MemoryEvidence();
  const evidence = evidenceOver(store);
  evidence.addSource(newSource("book"));
  return { store, evidence };
};

describe("a source", () => {
  it("may be a relative's story", () => {
    const { evidence } = start();
    const story = newSource("story", { kind: "story", title: "Рассказ тёти", note: "на кухне" });
    expect(evidence.addSource(story).ok).toBe(true);
    expect(evidence.source(source("story"))).toEqual({ ...story, version: 0 });
    expect(evidence.cite(citation("c", { source: source("story"), page: "" })).ok).toBe(true);
    expect(evidence.countFor(birth)).toBe(1);
  });

  it("is added once and edited", () => {
    const { evidence, store } = start();
    expect(evidence.addSource(newSource("book"))).toMatchObject({ error: { code: "duplicate" } });
    expect(evidence.editSource(source("book"), { kind: "book", title: "Книга" })).toMatchObject({
      value: [{ kind: "source", before: { kind: "document" }, after: { title: "Книга" } }],
    });
    const { saves } = store;
    expect(evidence.editSource(source("book"), { title: "Книга" })).toEqual({
      ok: true,
      value: [],
    });
    expect(store.saves).toBe(saves);
    expect(evidence.editSource(source("none"), {})).toEqual({
      ok: false,
      error: { code: "missing", id: source("none") },
    });
    expect(evidence.source(source("none"))).toBeNull();
  });
});

describe("a source that is removed", () => {
  it("must not stand behind a fact", () => {
    const { evidence } = start();
    evidence.cite(citation("1"));
    evidence.cite(citation("2", { fact: { subject: couple, fact: "union" } }));
    expect(evidence.removeSource(source("book"))).toEqual({
      ok: false,
      error: { code: "in-use", count: 2 },
    });
    evidence.uncite(birth, citationId("1"));
    evidence.uncite({ subject: couple, fact: "union" }, citationId("2"));
    expect(evidence.removeSource(source("book"))).toMatchObject({
      value: [{ kind: "source", id: source("book"), after: null }],
    });
    expect(evidence.source(source("book"))).toBeNull();
    expect(evidence.removeSource(source("book"))).toEqual({
      ok: false,
      error: { code: "missing", id: source("book") },
    });
  });
});

describe("a citation", () => {
  it("stands behind one fact of one subject, whatever the fact is", () => {
    const { evidence } = start();
    evidence.cite(citation("1"));
    evidence.cite(citation("2", { quote: "«родися и крещена»" }));
    evidence.cite(citation("3", { fact: { subject: anna, fact: "event:e2" } }));
    evidence.cite(citation("4", { fact: { subject: couple, fact: "union" } }));
    expect(evidence.countFor(birth)).toBe(2);
    expect(evidence.countFor({ subject: anna, fact: "event:e2" })).toBe(1);
    expect(evidence.countFor({ subject: couple, fact: "union" })).toBe(1);
    expect(evidence.countFor({ subject: couple, fact: "event:e1" })).toBe(0);
    expect(evidence.citationsOf(anna).map(({ id }) => id)).toEqual(["1", "2", "3"].map(citationId));
    expect(evidence.citationsOf("person_x" as PersonId)).toEqual([]);
  });

  it("is refused of a missing source and with an identifier taken in the same subject", () => {
    const { evidence, store } = start();
    evidence.cite(citation("1"));
    const { saves } = store;
    expect(evidence.cite(citation("2", { source: source("none") }))).toEqual({
      ok: false,
      error: { code: "missing", id: source("none") },
    });
    const elsewhere = citation("1", { fact: { subject: anna, fact: "name:n1" } });
    expect(evidence.cite(elsewhere)).toEqual({ ok: false, error: { code: "duplicate" } });
    expect(store.saves).toBe(saves);
  });

  it("is taken back, and the fact and what is left of it are told", () => {
    const { evidence } = start();
    evidence.cite(citation("1"));
    evidence.cite(citation("2"));
    evidence.cite(citation("3", { fact: { subject: anna, fact: "event:e2" } }));
    expect(evidence.uncite(birth, citationId("1"))).toMatchObject({
      ok: true,
      value: { left: 1, fact: birth, change: [{ kind: "cited", id: anna }] },
    });
    expect(evidence.uncite(birth, citationId("2"))).toMatchObject({
      value: { left: 0, fact: birth },
    });
    expect(evidence.countFor(birth)).toBe(0);
    expect(evidence.citationsOf(anna)).toHaveLength(1);
    expect(evidence.uncite(birth, citationId("2"))).toEqual({
      ok: false,
      error: { code: "missing", id: citationId("2") },
    });
  });

  it("is taken back only from the fact it stands behind", () => {
    const { evidence } = start();
    evidence.cite(citation("1"));
    for (const fact of [
      { subject: anna, fact: "event:e2" },
      { subject: couple, fact: "event:e1" },
    ]) {
      expect(evidence.uncite(fact, citationId("1"))).toEqual({
        ok: false,
        error: { code: "missing", id: citationId("1") },
      });
    }
    expect(evidence.countFor(birth)).toBe(1);
  });

  it("leaves an empty row when it was the only one", () => {
    const { evidence, store } = start();
    evidence.cite(citation("1"));
    expect(evidence.uncite(birth, citationId("1"))).toMatchObject({
      value: { change: [{ after: { citations: [] } }] },
    });
    // The row stays: its version goes on.
    expect(store.cited.rows.get(anna)).toEqual({ id: anna, version: 0, citations: [] });
  });

  it("keeps any text as it is written", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (text) => {
        const { evidence } = start();
        evidence.cite(citation("1", { page: text, quote: text }));
        expect(evidence.citationsOf(anna)).toEqual([citation("1", { page: text, quote: text })]);
      }),
    );
  });
});

it("as many citations are counted as were given and not taken back", () => {
  const subjects = fc.constantFrom<FactRef>(
    birth,
    { subject: anna, fact: "name:n1" },
    { subject: couple, fact: "union" },
  );
  const names = fc.constantFrom("1", "2", "3", "4", "5");
  const step = fc.oneof(fc.record({ cite: names, fact: subjects }), fc.record({ uncite: names }));
  fc.assert(
    fc.property(fc.array(step, { maxLength: 40, size: "max" }), (steps) => {
      const { evidence } = start();
      const given = new Map<string, FactRef>();
      for (const one of steps) {
        if ("cite" in one) {
          const result = evidence.cite(citation(one.cite, { fact: one.fact }));
          const taken = given.get(one.cite)?.subject === one.fact.subject;
          expect(result.ok).toBe(!taken);
          // Elsewhere the identifier is free. The test keeps one of each.
          if (result.ok && given.has(one.cite)) evidence.uncite(one.fact, citationId(one.cite));
          else if (result.ok) given.set(one.cite, one.fact);
        } else {
          const fact = given.get(one.uncite);
          const result = evidence.uncite(fact ?? birth, citationId(one.uncite));
          expect(result.ok).toBe(fact !== undefined);
          given.delete(one.uncite);
          const left = [...given.values()].filter((other) => other === fact).length;
          if (result.ok) expect(result.value).toMatchObject({ fact, left });
        }
        for (const fact of given.values()) {
          const count = [...given.values()].filter((other) => other === fact).length;
          expect(evidence.countFor(fact)).toBe(count);
        }
      }
    }),
  );
});
