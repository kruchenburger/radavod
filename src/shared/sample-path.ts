/** The screens of the example. The Worker serves the app at these addresses and no others. */
export type SamplePath =
  | { screen: "tree"; person: string | null }
  | { screen: "branches" }
  | { screen: "person"; person: string }
  | { screen: "list"; person: string };

/** The invented family, written by the build. */
export const SAMPLE_FILE = "/sample/tree.json";

const personal = /^\/sample\/(tree|person|list)\/([\w-]{1,64})$/;

export function parseSamplePath(path: string): SamplePath | null {
  if (path === "/sample") return { screen: "tree", person: null };
  if (path === "/sample/branches") return { screen: "branches" };
  const [, screen, person] = personal.exec(path) ?? [];
  if (person === undefined) return null;
  return { screen: screen as "tree" | "person" | "list", person };
}

export function samplePath(path: SamplePath): string {
  if (path.screen === "branches") return "/sample/branches";
  return path.person === null ? "/sample" : `/sample/${path.screen}/${path.person}`;
}
