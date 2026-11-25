import { evidenceTables } from "../contexts/evidence";
import { historyTables, type Migration, upgradeHistory } from "../contexts/history";
import { kinshipTables } from "../contexts/kinship";
import { lifeTables } from "../contexts/life";
import { placesTables } from "../contexts/places";

/** The steps every database of a tree goes through. Each context owns its tables. */
export const steps: Migration[] = [
  {
    number: 1,
    up(sql) {
      const tables = [kinshipTables, placesTables, evidenceTables, lifeTables, historyTables];
      for (const table of tables.flat()) sql.exec(table);
    },
  },
  { number: 2, up: upgradeHistory },
];
