/** What is in the second set and not in the first. */
export function newcomers<T>(before: ReadonlySet<T>, after: ReadonlySet<T>): T[] {
  return [...after].filter((one) => !before.has(one));
}
