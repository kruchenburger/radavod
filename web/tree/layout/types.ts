import type {
  Certainty,
  TreeParentage,
  TreePerson,
  TreeUnion,
} from "../../../src/shared/tree";

/** What a text looks like. The screen knows the fonts, the layout only asks how wide a text is. */
export type TextStyle =
  | "name"
  | "nameDirect"
  | "detail"
  | "focusName"
  | "focusDetail"
  | "title"
  | "leafName"
  | "leafNameDirect"
  | "leafDetail"
  | "tagName"
  | "tagNameDirect";

export type Measure = (text: string, style: TextStyle) => number;

/** The words of a card, written by the screen. Any of them may be empty. */
export type CardText = { given: string; surname: string; years: string; branch: string };

export type UnknownPlace =
  | { of: "parent"; child: string; parentage: string }
  | { of: "partner"; partner: string; union: string };

export type Wording = {
  person: (person: TreePerson) => CardText;
  unknown: (place: UnknownPlace) => string;
};

export type Part = "given" | "surname" | "years" | "branch" | "unknown";

/** A piece of text, its box counted from the corner of its card. */
export type Line = {
  text: string;
  part: Part;
  style: TextStyle;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Box = { x: number; y: number; w: number; h: number };
export type Point = readonly [x: number, y: number];

/** Cards are known by keys: the key of a person never meets the key of an unknown place. */
export const personKey = (id: string): string => `p:${id}`;

export type Card = Box & {
  key: string;
  /** Null for an unknown place. */
  person: string | null;
  /** On the direct line. */
  direct: boolean;
};

type LinkBase = {
  /** Links of one family share a trunk. Only they may lie on one another. */
  family: string;
  certainty: Certainty;
  direct: boolean;
  /**
   * Pieces along one axis each; the screen rounds the corners. Empty when the cards of a union
   * stand together.
   */
  points: Point[];
};

export type ParentageLink = LinkBase & {
  type: "parentage";
  /** Keys of one parent, or of both when the line leaves the couple. */
  parents: string[];
  child: string;
  kind: TreeParentage["kind"];
  main: boolean;
  /** False for a second line to somebody who already stands elsewhere. */
  tree: boolean;
};

export type UnionLink = LinkBase & {
  type: "union";
  union: string;
  partners: [string, string];
  kind: TreeUnion["kind"];
};

export type Link = ParentageLink | UnionLink;

export type Layout = {
  cards: Card[];
  links: Link[];
  width: number;
  height: number;
  /** Keys of cards as they are read, for the keyboard. */
  order: string[];
};
