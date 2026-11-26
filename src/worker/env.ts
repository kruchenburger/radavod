import type { FamilyAccess } from "./family-access";
import type { FamilyTree } from "./family-tree";

export type Env = {
  TREE: DurableObjectNamespace<FamilyTree>;
  ACCESS: DurableObjectNamespace<FamilyAccess>;
  ASSETS: Fetcher;
  APP_VERSION: string;
  JURISDICTION: "eu" | "none";
  /** "on" opens the invented family to anybody. */
  SAMPLE: string;
  /** The domain passkeys are bound to, of this installation. */
  RP_ID?: string;
  /** The address of the site, exactly as a browser sends it in `Origin`. */
  ORIGIN?: string;
  /** A secret: lets in the first keeper, and one more each time it is new. */
  SETUP_CODE?: string;
};
