import { readdirSync } from "node:fs";
import { expect, it } from "vitest";
import { checkText } from "./banned.ts";
import { check, readTree, repository, runCopyGuard } from "./guard.ts";

const bad: [fixture: string, rule: string][] = [
  ["jsx-literal", "jsx-text"],
  ["jsx-fragment-literal", "jsx-text"],
  ["jsx-string", "jsx-text"],
  ["jsx-template", "jsx-text"],
  ["jsx-conditional", "jsx-text"],
  ["jsx-logical", "jsx-text"],
  ["jsx-concatenation", "jsx-text"],
  ["jsx-variable", "jsx-text"],
  ["jsx-map", "jsx-text"],
  ["jsx-list", "jsx-text"],
  ["jsx-function", "jsx-text"],
  ["jsx-string-method", "jsx-text"],
  ["create-element", "jsx-text"],
  ["default-prop", "jsx-text"],
  ["jsx-imported", "jsx-text"],
  ["jsx-state", "jsx-text"],
  ["jsx-entries", "jsx-text"],
  ["jsx-render-function", "jsx-text"],
  ["component-returns-text", "jsx-text"],
  ["inner-html", "property-text"],
  ["input-button", "attribute-text"],
  ["select-data", "attribute-text"],
  ["error-class", "property-text"],
  ["sentence-elsewhere", "text-outside-catalog"],
  ["schema-message", "text-outside-catalog"],
  ["server-sentence", "text-outside-catalog"],
  ["aria-label-literal", "attribute-text"],
  ["placeholder-literal", "attribute-text"],
  ["title-literal", "attribute-text"],
  ["alt-literal", "attribute-text"],
  ["label-literal", "attribute-text"],
  ["component-label-literal", "attribute-text"],
  ["spread-attribute", "property-text"],
  ["option-label", "property-text"],
  ["document-title", "document-title"],
  ["document-title-template", "document-title"],
  ["text-content", "dom-text"],
  ["set-attribute", "dom-text"],
  ["alert", "dialog-text"],
  ["notification", "notification-text"],
  ["toast", "notification-text"],
  ["thrown-user-error", "error-text"],
  ["rejected-user-error", "error-text"],
  ["thrown-string", "error-text"],
  ["server-user-error", "error-text"],
  ["server-response-text", "response-text"],
  ["server-response-plain", "response-text"],
  ["error-message-shown", "error-message-shown"],
  ["cyrillic-elsewhere", "text-outside-catalog"],
  ["html-text", "markup-text"],
  ["html-attribute", "markup-text"],
  ["html-script", "document-title"],
  ["svg-text", "markup-text"],
  ["css-content", "css-text"],
  ["unread-file", "unread-file"],
  ["missing-en-key", "missing-en-key"],
  ["missing-ru-key", "missing-ru-key"],
  ["extra-ru-key", "extra-ru-key"],
  ["extra-en-key", "extra-en-key"],
  ["unused-key", "unused-key"],
  ["unknown-key", "unknown-key"],
  ["duplicate-key", "duplicate-key"],
  ["empty-text", "empty-text"],
  ["computed-text", "unreadable-text"],
  ["spread-catalog", "unreadable-text"],
  ["other-parameters", "other-parameters"],
  ["missing-parameter", "missing-parameter"],
  ["missing-plural-form", "missing-plural-form"],
  ["count-without-plural", "missing-plural-form"],
  ["extra-plural-form", "extra-plural-form"],
  ["banned-ru", "banned-ru"],
  ["banned-ru-plural", "banned-ru"],
  ["banned-en", "banned-en"],
  ["dash-ru", "dash-ru"],
  ["dash-en", "dash-en"],
  ["informal-ty", "informal-ty"],
  ["informal-ty-verb", "informal-ty"],
];

it.each(bad)("rejects %s by its own rule", (fixture, rule) => {
  const rules = runCopyGuard(fixture).map((v) => v.rule);
  expect([...new Set(rules)]).toEqual([rule]);
});

it("has a test for every bad fixture", () => {
  const folders = readdirSync(new URL("fixtures/bad", import.meta.url));
  expect(bad.map(([fixture]) => fixture).sort()).toEqual(folders.sort());
});

it("accepts the clean fixture", () => {
  expect(runCopyGuard("clean")).toEqual([]);
});

it.each(["empty", "no-such-fixture"])("fails when no files were parsed: %s", (fixture) => {
  expect(() => runCopyGuard(fixture)).toThrow("no files parsed");
});

it("fails when a file cannot be parsed", () => {
  expect(() => runCopyGuard("broken-syntax")).toThrow("cannot parse web/app.tsx");
});

it("fails without a catalog", () => {
  expect(() => runCopyGuard("no-catalog")).toThrow("no catalog web/i18n/ru.ts");
});

it("fails on a catalog it cannot find in the file", () => {
  expect(() => runCopyGuard("unreadable-catalog")).toThrow("no catalog in web/i18n/en.ts");
});

it("fails on an empty catalog", () => {
  expect(() => runCopyGuard("empty-catalog")).toThrow("empty catalog web/i18n/ru.ts");
});

it("reads the real tree", () => {
  const { files, texts, violations } = check(readTree(repository));
  expect(violations).toEqual([]);
  expect(files).toBeGreaterThan(20);
  expect(texts).toBeGreaterThan(20);
});

const rulesOf = (locale: "ru" | "en", text: string) => [...new Set(checkText(locale, text))];

it.each([
  "Легко и быстро добавляйте родню",
  "Это не просто древо",
  "Добавьте родню в один клик",
  "Список позволяет найти человека",
  "Настройки позволят выбрать ветвь",
  "Журнал обеспечивает порядок",
  "Здесь осуществляется перенос",
  "Что-то пошло не так",
  "ЧТО-ТО ПОШЛО НЕ ТАК",
  "Пожалуйста, подождите",
  "Не волнуйтесь, запись сохранена",
])("bans in Russian: %s", (text) => {
  expect(rulesOf("ru", text)).toEqual(["banned-ru"]);
});

it.each([
  "A seamless tree",
  "Seamlessly edit",
  "Effortless import",
  "Delve into history",
  "Please note the date",
  "It looks like the file is empty",
  "Oops!",
  "Something went wrong",
])("bans in English: %s", (text) => {
  expect(rulesOf("en", text)).toEqual(["banned-en"]);
});

it.each([
  "Добавьте человека — он появится в древе",
  "Запись сохраняется — вы увидите её в журнале",
  "Выберите ветвь – цвет изменится",
  "Загрузите файл - мы покажем отчёт",
])("bans a dash between two clauses in Russian: %s", (text) => {
  expect(rulesOf("ru", text)).toEqual(["dash-ru"]);
});

it.each(["Add a person — they appear", "Saved—see the log", "Saved -- see the log"])(
  "bans a dash between two clauses in English: %s",
  (text) => {
    expect(rulesOf("en", text)).toEqual(["dash-en"]);
  },
);

it.each(["Ты хранитель", "Покажи своё древо", "Нажми «+»", "Если хочешь, позови родню"])(
  "bans «ты»: %s",
  (text) => {
    expect(rulesOf("ru", text)).toEqual(["informal-ty"]);
  },
);

it.each([
  "Непросто прочитать запись",
  "Не простая дата",
  "Легко читается",
  "Быстро",
  "Клик по карточке",
  "Социальное обеспечение",
  "Позвольте представиться",
  "Дозволение на брак",
  "Осуществление",
  "Что-то ещё",
  "Читатель — смотрит, но не правит",
  "Минск — столица",
  "Иван — сын Петра",
  "Михаил — брат Людмилы",
  "Портрет — работа неизвестного",
  "Отчёт — в журнале",
  "Хранитель — роль участника",
  "1885 — 1890",
  "Вильна—Ковно",
  "Кто-нибудь из родни",
  "Тыл, твердь, тебеньки",
  "Лишь одна запись",
  "Мышь, брешь и плешь",
  "Нажмите «+»",
  "Откройте запись",
  "Если хотите, добавьте фото",
  "Открыть",
  "Проверьте дату и попробуйте ещё раз",
  "Запись в метрической книге не найдена",
])("leaves ordinary Russian alone: %s", (text) => {
  expect(rulesOf("ru", text)).toEqual([]);
});

it.each([
  "Seam",
  "The effort of many people",
  "Please choose a branch",
  "This looks like the same person",
  "Note",
  "A note about the date",
  "1885–1890",
  "Great-grandmother",
  "Ivan Petrov - keeper",
  "What went wrong in the import",
  "Looks up names in two scripts",
])("leaves ordinary English alone: %s", (text) => {
  expect(rulesOf("en", text)).toEqual([]);
});
