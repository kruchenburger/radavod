import type { Text } from "./text";

export const ru = {
  "app.name": "Radavod",
  "app.about": "Закрытый сайт с древом вашей семьи.",
  "settings.language": "Язык",
  "settings.theme": "Тема",
  "language.ru": "Русский",
  "language.en": "English",
  "theme.light": "Светлая",
  "theme.dark": "Тёмная",
  "health.checking": "Проверяем связь с сервером",
  "health.version": "Версия {version}",
  "health.degraded": "Древо не открывается: хранилище не отвечает. Напишите хранителю.",
  "health.unreachable": "Сервер не ответил. Проверьте интернет и обновите страницу.",
  "health.broken": "Сервер ответил с ошибкой. Обновите страницу или напишите хранителю.",
} satisfies Record<string, Text>;
