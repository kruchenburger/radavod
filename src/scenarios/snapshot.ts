import { sqliteCheckpoints, sqliteSnapshots } from "../contexts/history";
import type { EventId, PersonId } from "../kernel/id";
import { snapshotOf, touchedBy } from "../shared/snapshot";
import { erasing } from "./erase";
import type { Changed, UnitOfWork } from "./unit-of-work";

/** The snapshot of the last version as the browser gets it: packed, and not unpacked on the way. */
export type Packed = { version: number; epoch: string; encoding: "gzip"; body: Uint8Array };

/** The version a client is brought to, and what it must ask for again: "person/<id>" and the like. */
export type Changes = { version: number; changed: Changed[] };

export interface TreeSnapshots {
  /** The kept snapshot, made anew when the tree is past it. */
  snapshot(): Promise<Packed>;
  /** Makes the snapshot of now and keeps it. */
  rebuild(): Promise<Packed>;
  /**
   * What changed after a version, or "reload" when that cannot be told: another epoch, a version not
   * made, too much, or an erasure, which leaves the journal without the erased.
   */
  changesSince(version: number, epoch: string): Changes | "reload";
}

/** More than this many entries, or aggregates, and the whole snapshot is the cheaper answer. */
const mostEntries = 500;
const mostChanged = 1_000;

export function snapshotsOf(
  storage: Pick<DurableObjectStorage, "sql" | "transactionSync">,
  unit: UnitOfWork,
): TreeSnapshots {
  const kept = sqliteSnapshots(storage.sql);
  const checkpoints = sqliteCheckpoints(storage.sql);
  const headOf = () => ({
    version: unit.read((c) => c.history.last()),
    epoch: checkpoints.epoch(),
  });
  const rebuild = async (): Promise<Packed> => {
    for (;;) {
      const erasures = checkpoints.erasures();
      const head = headOf();
      const state = unit.read((c) => c.history.state());
      const body = await packed(JSON.stringify(snapshotOf(state, head)));
      // Somebody erased while it was packed is in it: it is neither kept nor given.
      if (checkpoints.erasures() !== erasures) continue;
      storage.transactionSync(() => {
        const now = headOf();
        if (now.version === head.version && now.epoch === head.epoch) {
          kept.put({ ...head, data: body });
        }
      });
      return { ...head, encoding: "gzip", body };
    }
  };
  /** One making at a time for one version: those who open the tree meanwhile wait for it. */
  let making: { version: number; epoch: string; packed: Promise<Packed> } | null = null;
  return {
    async snapshot() {
      const snapshot = kept.get();
      const head = headOf();
      if (snapshot === null || snapshot.version !== head.version || snapshot.epoch !== head.epoch) {
        if (making?.version !== head.version || making.epoch !== head.epoch) {
          const packed = rebuild().finally(() => {
            if (making?.packed === packed) making = null;
          });
          making = { ...head, packed };
        }
        return making.packed;
      }
      return {
        version: snapshot.version,
        epoch: snapshot.epoch,
        encoding: "gzip",
        body: snapshot.data,
      };
    },
    rebuild,
    changesSince(version, epoch) {
      return unit.read((c) => {
        const last = c.history.last();
        const isKnown = Number.isInteger(version) && version >= 0 && version <= last;
        if (!isKnown || epoch !== checkpoints.epoch() || last - version > mostEntries) {
          return "reload";
        }
        const unionOf = (home: string, event: string) =>
          c.life.event(home as PersonId, event as EventId)?.union ?? null;
        const latest = new Map<string, number>();
        for (let number = version + 1; number <= last; number++) {
          const entry = c.history.entry(number);
          if (entry === null) continue;
          if (entry.scenario === erasing) return "reload";
          for (const aggregate of touchedBy(entry.patches, unionOf)) {
            latest.delete(aggregate);
            latest.set(aggregate, number);
          }
          if (latest.size > mostChanged) return "reload";
        }
        const changed = [...latest].map(([aggregate, at]) => ({ aggregate, version: at }));
        return { version: last, changed };
      });
    },
  };
}

async function packed(text: string): Promise<Uint8Array> {
  const stream = new Response(text).body?.pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
