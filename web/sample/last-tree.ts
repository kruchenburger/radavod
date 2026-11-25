/** The tree or the map one came from, so that "back" leads there and not to another place. */
let address: string | null = null;

export const lastTree = (): string | null => address;

export function rememberTree(href: string): void {
  address = href;
}
