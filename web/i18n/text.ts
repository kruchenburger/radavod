/** One form per plural category the language has, picked by {count}. */
export type Plural = { one: string; few?: string; many?: string; other: string };
export type Text = string | Plural;
