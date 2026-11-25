import type { FamilyAccess } from "./family-access";
import type { FamilyTree } from "./family-tree";

export type Env = {
  TREE: DurableObjectNamespace<FamilyTree>;
  ACCESS: DurableObjectNamespace<FamilyAccess>;
  ASSETS: Fetcher;
  APP_VERSION: string;
  JURISDICTION: "eu" | "none";
};
