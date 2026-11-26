/** The screens of the example. The Worker serves the app at these addresses and no others. */
export type SamplePath =
  | { screen: "tree"; person: string | null }
  | { screen: "generations"; person: string | null }
  | { screen: "branches" }
  | { screen: "person"; person: string }
  | { screen: "list"; person: string };

/** The invented family, written by the build. */
export const SAMPLE_FILE = "/sample/tree.json";

const personal = /^\/sample\/(tree|generations|person|list)\/([\w-]{1,64})$/;

export function parseSamplePath(path: string): SamplePath | null {
  if (path === "/sample") return { screen: "tree", person: null };
  if (path === "/sample/branches") return { screen: "branches" };
  if (path === "/sample/generations") return { screen: "generations", person: null };
  const [, screen, person] = personal.exec(path) ?? [];
  if (person === undefined) return null;
  return { screen: screen as "tree" | "generations" | "person" | "list", person };
}

export function samplePath(path: SamplePath): string {
  if (path.screen === "branches") return "/sample/branches";
  if (path.person === null) return path.screen === "tree" ? "/sample" : `/sample/${path.screen}`;
  return `/sample/${path.screen}/${path.person}`;
}
