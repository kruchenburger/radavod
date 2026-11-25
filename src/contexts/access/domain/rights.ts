/** Who may do what in a family. Routes consult this table and nothing else. */

export type Role = "reader" | "editor" | "keeper";

export type Action =
  /** The tree, cards, sources and the search. */
  | "read-tree"
  /** The journal of edits of a person. */
  | "read-journal"
  /** People, links, events, places, sources, branches. */
  | "edit-tree"
  | "undo-and-trash"
  | "erase"
  /** Import, export, restoring a copy, starting over. */
  | "exchange"
  /** The names of the members. */
  | "see-members"
  /** Invitations, roles, revoking sign-in, the sign-in log, the settings of the family. */
  | "manage-members"
  /** One's own passkeys, export and deletion of one's account. */
  | "own-account";

const rights: Readonly<Record<Action, readonly Role[]>> = {
  "read-tree": ["reader", "editor", "keeper"],
  "read-journal": ["editor", "keeper"],
  "edit-tree": ["editor", "keeper"],
  "undo-and-trash": ["editor", "keeper"],
  erase: ["keeper"],
  exchange: ["keeper"],
  "see-members": ["reader", "editor", "keeper"],
  "manage-members": ["keeper"],
  "own-account": ["reader", "editor", "keeper"],
};

export function can(role: Role, action: Action): boolean {
  const roles = rights[action];
  // An action outside the table is the fault of the code, not a refusal.
  if (roles === undefined) throw new Error(`unknown-action ${action}`);
  return roles.includes(role);
}
