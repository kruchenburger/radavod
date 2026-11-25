import type { ru } from "./ru";
import type { Text } from "./text";

export const en = {
  "app.name": "Radavod",
  "app.about": "A private website for your family tree.",
  "settings.language": "Language",
  "settings.theme": "Theme",
  "language.ru": "Русский",
  "language.en": "English",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "health.checking": "Checking the server",
  "health.version": "Version {version}",
  "health.degraded": "The tree won't open: its storage isn't responding. Tell a keeper.",
  "health.unreachable": "The server didn't respond. Check your connection and reload the page.",
  "health.broken": "The server answered with an error. Reload the page or tell a keeper.",
} satisfies Record<keyof typeof ru, Text>;
