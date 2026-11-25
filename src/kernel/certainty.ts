/** How well a fact is known. */
export type Certainty = "hypothesis" | "one-source" | "confirmed" | "contradiction" | "unresolved";

/** Whether a fact may be called so only while at least one citation stands behind it. */
export function needsCitation(certainty: Certainty): boolean {
  return certainty === "one-source" || certainty === "confirmed";
}
