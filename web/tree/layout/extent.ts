/** The least and the greatest number. Spreading a long list into Math.min overflows the stack. */
export function extent(values: Iterable<number>): [least: number, most: number] {
  let least = Infinity;
  let most = -Infinity;
  for (const value of values) {
    if (value < least) least = value;
    if (value > most) most = value;
  }
  return [least, most];
}
