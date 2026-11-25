import type { Change as EvidenceChange, EvidenceStore } from "../../src/contexts/evidence";
import type { Change as LifeChange, LifeStore } from "../../src/contexts/life";
import type { Change as PlacesChange, PlacesStore } from "../../src/contexts/places";
import type { EventId, PersonId, PlaceId, SourceId, UnionId } from "../../src/kernel/id";

/** Stores that hold copies, as a database does: nobody can change what they hold but by `save`. */
class Memory<Id, Value> {
  readonly rows = new Map<Id, Value>();

  get(id: Id): Value | null {
    return structuredClone(this.rows.get(id) ?? null);
  }

  put({ id, after }: { id: Id; after: Value | null }): void {
    if (after === null) this.rows.delete(id);
    else this.rows.set(id, structuredClone(after));
  }
}

type Saved<Change extends { kind: string; after: unknown }[], Kind extends string> = NonNullable<
  Extract<Change[number], { kind: Kind }>["after"]
>;

export class MemoryPlaces implements PlacesStore {
  readonly places = new Memory<PlaceId, Saved<PlacesChange, "place">>();
  saves = 0;

  place(id: PlaceId) {
    return this.places.get(id);
  }

  save(change: PlacesChange): void {
    this.saves++;
    for (const write of change) this.places.put(write);
  }
}

export class MemoryEvidence implements EvidenceStore {
  readonly sources = new Memory<SourceId, Saved<EvidenceChange, "source">>();
  readonly cited = new Memory<PersonId | UnionId, Saved<EvidenceChange, "cited">>();
  saves = 0;

  source(id: SourceId) {
    return this.sources.get(id);
  }

  citedOf(id: PersonId | UnionId) {
    return this.cited.get(id);
  }

  subjectOf(citation: string) {
    for (const [id, { citations }] of this.cited.rows) {
      if (citations.some((one) => one.id === citation)) return id;
    }
    return null;
  }

  save(change: EvidenceChange): void {
    this.saves++;
    for (const write of change) {
      if (write.kind === "source") this.sources.put(write);
      else this.cited.put(write);
    }
  }
}

export class MemoryLife implements LifeStore {
  readonly lives = new Memory<PersonId, Saved<LifeChange, "life">>();
  saves = 0;

  lifeOf(id: PersonId) {
    return this.lives.get(id);
  }

  homeOf(event: EventId) {
    for (const [id, { events }] of this.lives.rows) {
      if (events.some((one) => one.id === event)) return id;
    }
    return null;
  }

  save(change: LifeChange): void {
    this.saves++;
    for (const write of change) this.lives.put(write);
  }
}
