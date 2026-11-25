import { isId, type Id } from "../../../kernel/id";
import { defaultName } from "./name";

export type Person = { id: Id; name: string };
export const person = (id: string): Person => {
  if (!isId(id)) throw new Error("a person needs an id");
  return { id, name: defaultName };
};
