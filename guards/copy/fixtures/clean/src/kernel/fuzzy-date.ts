// Words that are parsed, not shown.
export const MONTHS = ["января", "февраля"];

export function parse(text: string) {
  if (text === "") throw new RangeError("empty date");
  return MONTHS.indexOf(text);
}
