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
  "health.degraded": "Your family's data is unavailable right now. Come back in a few minutes.",
  "health.unreachable": "The server didn't respond. Check your connection and reload the page.",
} satisfies Record<keyof typeof ru, Text>;
