/** GEDCOM import and export, the full copy, and the import of a family table. */
export { intoEmptyTree, type TreeNotEmpty } from "./domain/import";
export { type Preview, previewOf } from "./domain/preview";
export {
  LONGEST_TEXT,
  MOST_ROWS,
  type Problem,
  type ProblemCode,
  readTable,
  type Table,
  type TableError,
  type TablePerson,
  type TableUnion,
} from "./domain/table";
