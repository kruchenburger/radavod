export const LANGUAGE_KEY = "radavod.language";
/** index.html reads it too, before the app starts. */
export const THEME_KEY = "radavod.theme";

/** A convenience of one browser: storage may be forbidden, full or cleared at any time. */
export function recall(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function remember(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // The choice lasts until the page is closed.
  }
}
