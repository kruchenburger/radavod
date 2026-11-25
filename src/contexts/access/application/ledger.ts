import type { PersonId } from "../../../kernel/id";

/** Who was erased from the tree. It is kept apart from the tree, so no rollback forgets it. */
export interface ErasureLedger {
  remember(ids: PersonId[]): void;
  all(): PersonId[];
}
