import type { Env } from "./env";

/** One installation serves one family, but its id is always passed explicitly. */
export const FAMILY_ID = "family";

export function stubFor<T extends Rpc.DurableObjectBranded>(
  ns: DurableObjectNamespace<T>,
  familyId: string,
  env: Pick<Env, "JURISDICTION">,
): DurableObjectStub<T> {
  switch (env.JURISDICTION) {
    case "eu":
      return ns.jurisdiction("eu").getByName(familyId);
    case "none":
      return ns.getByName(familyId);
    default:
      // An object never moves: a typo here must not put a family's data in the wrong place.
      throw new Error(`JURISDICTION must be "eu" or "none"`);
  }
}
