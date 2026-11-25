import type { Member } from "../contexts/access";
import { person } from "../contexts/kinship";
import { born } from "../contexts/life";

export const addChild = (by: Member) => ({ by, child: person("1"), born });
