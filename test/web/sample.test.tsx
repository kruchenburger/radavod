import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import { App } from "../../web/app/app";
import { labelsOf } from "../../web/sample/fan-screen";
import { kinOf } from "../../web/tree/layout/kin";
import { relativesOf } from "../../web/tree/layout/relatives";
import { wordsOf } from "../../web/tree/words";
import { familyOf } from "./layout/family";

const sample = sampleOf(generateFamily(1, 300));
const { start } = sample;
const name = (id: string, locale: "ru" | "en" = "ru"): string => {
  const person = kinOf(sample.snapshot).person(id);
  if (person === undefined) throw new Error(`nobody ${id}`);
  return wordsOf(sample.snapshot, locale).name(person);
};

/** People who are hard to show, found by examples/hard-cases.ts. */
const hard = {
  threeUnions: "p28",
  repeated: "p162",
  adopted: "p165",
  versions: "p180",
  unnamed: "p192",
};

type Answers = Partial<
  Record<"/config" | "/health" | "/sample/tree.json", () => Promise<Response>>
>;

let answers: Answers;
let problems: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  problems = vi.spyOn(console, "error").mockClear();
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["ru-RU"]);
  const health = { status: "ok", version: "1.2.3", tree: "ok", access: "ok" };
  answers = {
    "/config": () => Promise.resolve(Response.json({ sample: true })),
    "/health": () => Promise.resolve(Response.json(health)),
    "/sample/tree.json": () => Promise.resolve(Response.json(sample)),
  };
  vi.stubGlobal("fetch", (path: keyof Answers) => answers[path]?.() ?? Promise.reject(new Error()));
  setWidth(1440);
});

afterEach(() => {
  // Before anything here fails: one test must not leave its page to the next.
  cleanup();
  expect(problems).not.toHaveBeenCalled();
  window.history.replaceState(null, "", "/");
});

function setWidth(width: number): void {
  Object.defineProperty(document.documentElement, "clientWidth", {
    value: width,
    configurable: true,
  });
  vi.stubGlobal("innerWidth", width);
  act(() => void window.dispatchEvent(new Event("resize")));
}

async function open(href: string): Promise<void> {
  window.history.replaceState(null, "", href);
  render(<App />);
  // A busy machine (CI, files run side by side) lays out 300 people slowly.
  const slow = { timeout: 5000 };
  await waitFor(() => expect(document.querySelector("[data-screen]")).not.toBeNull(), slow);
  await waitFor(() => expect(screen.queryByText("Открываем древо")).toBeNull(), slow);
}

const address = () => window.location.pathname + window.location.search;
const tree = () => screen.getByRole("region", { name: /^Древо, в центре/ });
const centre = () => tree().querySelector("[data-focus]") as HTMLElement;
const press = (element: HTMLElement) => fireEvent.click(element);

describe("the start page", () => {
  it("opens the example where the installation allows it", async () => {
    render(<App />);
    press(await screen.findByRole("link", { name: "Открыть пример" }));
    expect(address()).toBe("/sample");
    // The example of 300 people takes a while to lay out on a busy machine.
    expect(await screen.findByText("Пример", {}, { timeout: 5000 })).toBeTruthy();
  });

  it.each([
    ["is off", () => Promise.resolve(Response.json({ sample: false }))],
    ["is not told", () => Promise.resolve(new Response("<html>"))],
    ["is not known", () => Promise.reject(new TypeError())],
  ])("says nothing of the example when it %s", async (_, config) => {
    answers["/config"] = config;
    render(<App />);
    await screen.findByText("Версия 1.2.3");
    expect(screen.queryByText("Открыть пример")).toBeNull();
  });
});

describe("where the example is off", () => {
  it.each([
    "/sample",
    "/sample/generations",
    "/sample/branches",
    `/sample/person/${start}`,
    `/sample/list/${start}`,
  ])("%s is an unknown page", async (href) => {
    answers["/config"] = () => Promise.resolve(Response.json({ sample: false }));
    window.history.replaceState(null, "", href);
    render(<App />);
    expect(await screen.findByText("Такой страницы нет")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Пример");
    press(screen.getByRole("button", { name: "На стартовую" }));
    expect(address()).toBe("/");
  });
});

it.each([
  ["does not answer", () => Promise.reject(new TypeError()), "Сервер не ответил."],
  ["answers with something else", () => Promise.resolve(new Response("<html>")), "с ошибкой"],
])("says why when it is not known whether it is open: the server %s", async (_, config, text) => {
  answers["/config"] = config;
  window.history.replaceState(null, "", "/sample");
  render(<App />);
  expect((await screen.findByRole("alert", {}, { timeout: 4000 })).textContent).toContain(text);
});

it("knows no other pages", async () => {
  window.history.replaceState(null, "", "/people");
  render(<App />);
  expect(await screen.findByText("Такой страницы нет")).toBeTruthy();
});

describe("the tree that cannot be opened", () => {
  it.each([
    ["does not answer", () => Promise.reject(new TypeError()), "Сервер не ответил. Проверьте"],
    ["is not a tree", () => Promise.resolve(Response.json({})), "Сервер ответил с ошибкой."],
  ])("says why: the server %s", async (_, answer, text) => {
    answers["/sample/tree.json"] = answer;
    window.history.replaceState(null, "", "/sample");
    render(<App />);
    const alert = await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(alert.textContent).toContain(text);
    expect(screen.getByRole("button", { name: "Обновить" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Закрыть пример" })).toBeTruthy();
  });

  it("says that it is being opened", async () => {
    answers["/sample/tree.json"] = () => new Promise(() => {});
    window.history.replaceState(null, "", "/sample");
    render(<App />);
    expect((await screen.findByRole("status")).textContent).toBe("Открываем древо");
  });
});

describe("every screen", () => {
  it.each([
    "/sample",
    "/sample/generations",
    "/sample/branches",
    `/sample/person/${start}`,
    `/sample/list/${start}`,
  ])("%s carries the mark and a way out", async (href) => {
    await open(href);
    expect(screen.getAllByText("Пример").length).toBeGreaterThan(0);
    press(screen.getByRole("link", { name: "Закрыть пример" }));
    expect(address()).toBe("/");
  });

  it("has the views, the language and the theme", async () => {
    await open("/sample");
    const views = screen.getByRole("navigation", { name: "Виды древа" });
    expect(within(views).getByText("Родословная").getAttribute("aria-current")).toBe("page");
    press(screen.getByRole("button", { name: "Тема: Тёмная" }));
    expect(document.documentElement.getAttribute("data-mantine-color-scheme")).toBe("dark");
    const languages = screen.getByRole("radiogroup", { name: "Язык" });
    expect(within(languages).getByText("RU").closest("label")?.dataset["chosen"]).toBe("true");
    expect((screen.getByRole("radio", { name: "RU, Русский" }) as HTMLInputElement).checked).toBe(
      true,
    );
    press(screen.getByRole("radio", { name: "EN, English" }));
    expect(screen.getByText("Pedigree")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(address()).toBe("/sample");
    // The same two marks in either language, the chosen one marked.
    const again = screen.getByRole("radiogroup", { name: "Language" });
    expect(
      within(again)
        .getAllByRole("radio")
        .map((one) => one.getAttribute("aria-label")),
    ).toEqual(["RU, Русский", "EN, English"]);
    expect(within(again).getByText("EN").closest("label")?.dataset["chosen"]).toBe("true");
    expect((screen.getByRole("radio", { name: "EN, English" }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it("has a title of its own", async () => {
    await open(`/sample/person/${start}`);
    expect(document.title).toBe(`${name(start)}. Radavod`);
  });

  it("says so when there is no such person", async () => {
    await open("/sample/tree/nobody");
    expect(screen.getByText("Такого человека в примере нет")).toBeTruthy();
    press(screen.getByRole("button", { name: "К древу" }));
    expect(centre().dataset["key"]).toBe(`p:${start}`);
  });
});

describe("around a person", () => {
  it("begins with the person of the example, on the direct line", async () => {
    await open("/sample");
    expect(centre().dataset["key"]).toBe(`p:${start}`);
    const label = within(centre()).getAllByRole("link")[0]?.textContent;
    expect(label).toContain(name(start));
    expect(label).toContain("Прямая линия");
  });

  it("puts whoever is pressed in the centre, and back leads back", async () => {
    await open("/sample");
    const parent = relativesOf(sample.snapshot, start)?.parents[0]?.person ?? "";
    press(tree().querySelector(`[data-press="p:${parent}"]`) as HTMLElement);
    expect(address()).toBe(`/sample/tree/${parent}`);
    expect(centre().dataset["key"]).toBe(`p:${parent}`);
    act(() => window.history.back());
    await waitFor(() => expect(centre().dataset["key"]).toBe(`p:${start}`));
  });

  it("opens the card when the centre is pressed", async () => {
    await open("/sample");
    press(within(centre()).getAllByRole("link")[0] as HTMLElement);
    expect(address()).toBe(`/sample/person/${start}`);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      name(start).split(" ")[0],
    );
  });

  it("unfolds the siblings and folds them", async () => {
    await open(`/sample/tree/${hard.threeUnions}`);
    const kin = relativesOf(sample.snapshot, hard.threeUnions);
    const number = kin?.siblings.length ?? 0;
    expect(number).toBeGreaterThan(0);
    const word = () => screen.getByRole("link", { name: `Братья и сёстры: ${number}` });
    expect(word().getAttribute("aria-expanded")).toBe("false");
    press(word());
    expect(address()).toContain("siblings=open");
    expect(word().getAttribute("aria-expanded")).toBe("true");
    expect(tree().querySelectorAll('[data-role="sibling"]').length).toBeGreaterThan(0);
    press(word());
    expect(tree().querySelectorAll('[data-role="sibling"]')).toHaveLength(0);
  });

  it.each([1440, 360])("opens one union of several, at %i px", async (width) => {
    setWidth(width);
    await open(`/sample/tree/${hard.threeUnions}`);
    const closed = within(tree())
      .getAllByRole("link", { name: /^Дети: \d/ })
      .filter((link) => link.getAttribute("aria-expanded") === "false");
    expect(closed.length).toBeGreaterThan(0);
    const before = within(tree()).getAllByText(/^Дети: \d/).length;
    (closed[0] as HTMLElement).focus();
    press(closed[0] as HTMLElement);
    expect(address()).toMatch(/union=p\d+/);
    expect(document.activeElement).toBe(closed[0]);
    expect(within(tree()).getAllByText(/^Дети: \d/)).toHaveLength(before);
    const opened = within(tree())
      .getAllByRole("link", { name: /^Дети: \d/ })
      .filter((link) => link.getAttribute("aria-expanded") === "true");
    expect(opened).toHaveLength(1);
  });

  it("names an ancestor who stands twice once, and leads there", async () => {
    await open(`/sample/tree/${hard.repeated}`);
    const reference = within(tree()).getAllByRole("link", { name: /^Те(?:| же) родители|^Тот же/ });
    expect(reference.length).toBeGreaterThan(0);
    press(reference[0] as HTMLElement);
    expect(address()).toMatch(/^\/sample\/tree\/p\d+$/);
  });

  it("keeps the focus in the tree when what had it is gone", async () => {
    await open(`/sample/tree/${hard.repeated}`);
    const [reference] = within(tree()).getAllByRole("link", {
      name: /^Те(?:| же) родители|^Тот же/,
    });
    reference?.focus();
    press(reference as HTMLElement);
    expect(centre().contains(document.activeElement)).toBe(true);
  });

  it("opens a family in the half of the descendants", async () => {
    setWidth(900);
    await open(`/sample/tree/${hard.threeUnions}`);
    const [closed] = within(tree())
      .getAllByRole("link", { name: /^Дети: \d/ })
      .filter((link) => link.getAttribute("aria-expanded") === "false");
    press(closed as HTMLElement);
    expect(address()).toContain("half=descendants");
    expect(tree().querySelectorAll('[data-role="descendant"]').length).toBeGreaterThan(0);
  });

  it("has a heading for a screen reader", async () => {
    await open("/sample");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      `Древо, в центре ${name(start)}`,
    );
  });

  it("has a place for an unknown parent and nothing to add one with", async () => {
    const child = sample.snapshot.people.find(({ parents }) =>
      parents.some(({ parent }) => parent === null),
    );
    await open(`/sample/tree/${child?.id}`);
    expect(tree().querySelectorAll('[data-role="unknown"]').length).toBeGreaterThan(0);
    expect(within(tree()).queryByText("+")).toBeNull();
    expect(within(tree()).queryByRole("button")).toBeNull();
  });

  it("explains the lines it draws", async () => {
    await open(`/sample/tree/${hard.adopted}`);
    expect(within(tree()).getByText("Усыновление, опека")).toBeTruthy();
    expect(document.querySelector("path[data-kind=adopted]")).not.toBeNull();
  });

  it("marks another version of the parents", async () => {
    await open(`/sample/tree/${hard.versions}`);
    expect(within(tree()).getByText("Другая версия")).toBeTruthy();
  });

  it("walks by the arrows", async () => {
    await open("/sample");
    const link = within(centre()).getAllByRole("link")[0] as HTMLElement;
    link.focus();
    fireEvent.keyDown(link, { key: "ArrowLeft" });
    const parent = document.activeElement as HTMLElement;
    const parents = relativesOf(sample.snapshot, start)?.parents.map(({ person }) => `p:${person}`);
    expect(parents).toContain(parent.dataset["press"]);
    fireEvent.keyDown(parent, { key: "ArrowRight" });
    expect((document.activeElement as HTMLElement).dataset["press"]).toBe(`p:${start}`);
  });

  it("gives the person in the centre the focus at once, and after every move", async () => {
    await open("/sample");
    const pressed = () => (document.activeElement as HTMLElement).dataset["press"];
    // The tree may come a render after the words of loading go.
    await waitFor(() => expect(pressed()).toBe(`p:${start}`));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    const parent = pressed();
    expect(parent).not.toBe(`p:${start}`);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    press(document.activeElement as HTMLElement);
    await waitFor(() => expect(centre().dataset["key"]).toBe(parent));
    await waitFor(() => expect(pressed()).toBe(parent));
    act(() => {
      window.history.back();
    });
    await waitFor(() => expect(centre().dataset["key"]).toBe(`p:${start}`));
    await waitFor(() => expect(pressed()).toBe(`p:${start}`));
  });

  it("leaves the focus where the visitor put it", async () => {
    await open("/sample");
    await waitFor(() => expect(centre().contains(document.activeElement)).toBe(true));
    const field = screen.getByRole("combobox", { name: "Имя или место" });
    field.focus();
    act(() => {
      window.history.pushState(null, "", `/sample/tree/${hard.threeUnions}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() => expect(centre().dataset["key"]).toBe(`p:${hard.threeUnions}`));
    expect(document.activeElement).toBe(field);
  });

  it("shows one half between 720 and 1400 px", async () => {
    setWidth(900);
    await open(`/sample/tree/${hard.threeUnions}`);
    const roles = () =>
      [...tree().querySelectorAll<HTMLElement>("[data-role]")].map(
        ({ dataset }) => dataset["role"],
      );
    expect(roles()).toContain("ancestor");
    expect(roles()).not.toContain("descendant");
    press(screen.getByRole("link", { name: "Потомки" }));
    expect(address()).toContain("half=descendants");
    expect(roles()).toContain("descendant");
    expect(roles()).not.toContain("ancestor");
    press(screen.getByRole("link", { name: /^Братья и сёстры/ }));
    expect(roles()).toContain("sibling");
  });

  it("is a list of rows on the phone, nothing wider than the screen", async () => {
    setWidth(360);
    await open("/sample");
    expect(tree().dataset["as"]).toBe("narrow");
    expect(screen.queryByRole("navigation", { name: "Половина древа" })).toBeNull();
    for (const card of tree().querySelectorAll<HTMLElement>("[data-key]")) {
      expect(Number.parseFloat(card.style.width)).toBeLessThanOrEqual((360 - 32) / 16);
    }
  });

  it("has the branches under it, the one of the chosen person marked", async () => {
    await open("/sample");
    const foot = screen.getByRole("navigation", { name: "Ветви" });
    const branches = within(foot).getAllByRole("listitem");
    expect(branches).toHaveLength(11);
    const own = foot.querySelector("[aria-current]");
    expect(own?.textContent).toContain(
      wordsOf(sample.snapshot, "ru").branch(kinOf(sample.snapshot).person(start)?.branch ?? null),
    );
    expect(own?.getAttribute("href")).toMatch(new RegExp(`^/sample/list/${start}#page-`));
  });
});

describe("the tree by generations", () => {
  const generations = () => screen.getByRole("region", { name: /^Древо по поколениям/ });
  const middle = () => generations().querySelector("[data-focus]") as HTMLElement;
  const card = (id: string) => generations().querySelector(`[data-press="p:${id}"]`) as HTMLElement;
  const parent = relativesOf(sample.snapshot, start)?.parents[0]?.person ?? "";

  it("stands between the pedigree and all branches, on the same person", async () => {
    await open(`/sample/tree/${parent}`);
    const views = screen.getByRole("navigation", { name: "Виды древа" });
    expect(
      within(views)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Родословная", "Древо", "Все ветви"]);
    press(within(views).getByText("Древо"));
    expect(address()).toBe(`/sample/generations/${parent}`);
    expect(within(views).getByText("Древо").getAttribute("aria-current")).toBe("page");
    expect(middle().dataset["key"]).toBe(`p:${parent}`);
    expect(document.title).toBe(`${name(parent)}, Древо. Radavod`);
  });

  it("begins with the person of the example, the parents above and the children below", async () => {
    await open("/sample/generations");
    expect(middle().dataset["key"]).toBe(`p:${start}`);
    const top = (id: string) =>
      Number(
        /translate\([^,]+, ([\d.]+)rem\)/u.exec(card(id).parentElement?.style.transform ?? "")?.[1],
      );
    expect(top(parent)).toBeLessThan(top(start));
    const child = relativesOf(sample.snapshot, start)?.unions[0]?.children[0]?.person;
    if (child !== undefined) expect(top(child)).toBeGreaterThan(top(start));
  });

  it("puts whoever is pressed in the centre, the centre opens the card, and links lead on", async () => {
    await open("/sample/generations");
    press(card(parent));
    expect(address()).toBe(`/sample/generations/${parent}`);
    expect(middle().dataset["key"]).toBe(`p:${parent}`);
    press(card(parent));
    expect(address()).toBe(`/sample/person/${parent}`);
    act(() => window.history.back());
    await waitFor(() => expect(middle().dataset["key"]).toBe(`p:${parent}`));
    const links = within(generations())
      .getAllByRole("link")
      .filter((link) => !link.dataset["press"]);
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual(
      expect.arrayContaining([
        ["Родословная", `/sample/tree/${parent}`],
        ["Все ветви", `/sample/list/${parent}`],
      ]),
    );
  });

  it("is walked by the keys: up to a parent, down again, along the row", async () => {
    await open("/sample/generations");
    const focused = () => (document.activeElement as HTMLElement).dataset["press"];
    await waitFor(() => expect(focused()).toBe(`p:${start}`));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
    const up = focused() ?? "";
    expect(
      relativesOf(sample.snapshot, start)?.parents.map(({ person }) => `p:${person}`),
    ).toContain(up);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowDown" });
    expect(focused()).toBe(`p:${start}`);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowRight" });
    expect(focused()).not.toBe(`p:${start}`);
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
    expect(focused()).toBe(`p:${start}`);
  });

  it("says so when there is no such person", async () => {
    await open("/sample/generations/nobody");
    expect(screen.getByText("Такого человека в примере нет")).toBeTruthy();
  });
});

describe("the card of a person", () => {
  it("has the names, the years, the branch and the kin, and nothing invented", async () => {
    await open(`/sample/person/${start}`);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((one) => one.textContent);
    expect(headings).toEqual(["Годы жизни", "Родня", "Имена"]);
    const person = kinOf(sample.snapshot).person(start);
    const names = person?.otherNames.length ?? 0;
    const section = screen.getByRole("heading", { name: "Имена" }).parentElement as HTMLElement;
    expect(within(section).getAllByRole("listitem")).toHaveLength(names + 1);
    expect(section.querySelector("[lang=be]")).not.toBeNull();
    expect(screen.getByText(/На прямой линии/)).toBeTruthy();
  });

  it("leads to the kin, to the tree and to the map", async () => {
    await open(`/sample/person/${start}`);
    const parent = relativesOf(sample.snapshot, start)?.parents[0]?.person ?? "";
    press(screen.getAllByRole("link", { name: name(parent) })[0] as HTMLElement);
    expect(address()).toBe(`/sample/person/${parent}`);
    const href = (text: string) => screen.getByRole("link", { name: text }).getAttribute("href");
    expect(href("Показать в древе")).toBe(`/sample/tree/${parent}`);
    expect(href("Показать среди ветвей")).toBe(`/sample/branches?person=${parent}`);
  });

  it("leads back to the tree one came from", async () => {
    const child = relativesOf(sample.snapshot, start)?.parents[0]?.person ?? "";
    await open(`/sample/tree/${child}?siblings=open`);
    press(within(centre()).getAllByRole("link")[0] as HTMLElement);
    expect(screen.getByRole("link", { name: "К древу" }).getAttribute("href")).toBe(
      `/sample/tree/${child}?siblings=open`,
    );
  });

  it("says what kind of a tie it is, and how sure", async () => {
    await open(`/sample/person/${hard.adopted}`);
    expect(screen.getAllByText(/усыновление/).length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-certainty]").length).toBeGreaterThan(0);
  });

  it("has words for somebody without a name", async () => {
    await open(`/sample/person/${hard.unnamed}`);
    expect(screen.getByRole("heading", { level: 1 }).textContent?.trim()).toBe("Имя неизвестно");
    expect(screen.getAllByText("Имя неизвестно").length).toBeGreaterThan(1);
  });

  it("opens for everybody in both languages", async () => {
    await open(`/sample/person/${start}`);
    for (const { id } of sample.snapshot.people.filter((_, i) => i % 23 === 0)) {
      act(() => {
        window.history.pushState(null, "", `/sample/person/${id}`);
        window.dispatchEvent(new PopStateEvent("popstate"));
      });
      expect(document.title).toBe(`${name(id)}. Radavod`);
    }
  });
});

describe("siblings", () => {
  it("are not said to share one parent when nobody knows the other", async () => {
    await open("/sample/person/p169");
    expect(screen.queryByText(/один общий родитель/)).toBeNull();
  });
});

describe("the pages of branches", () => {
  it("have every branch as a page, everybody once, and the chosen one marked", async () => {
    await open(`/sample/list/${start}`);
    const pages = await screen.findAllByRole("heading", { level: 2 });
    expect(pages).toHaveLength(11);
    const names = [...document.querySelectorAll<HTMLAnchorElement>('[data-key^="p:"] > a')];
    const hrefs = names.map((link) => link.getAttribute("href"));
    expect(new Set(hrefs).size).toBe(300);
    expect(hrefs).toHaveLength(300);
    const chosen = names.filter((link) => link.getAttribute("aria-current") === "true");
    expect(chosen.map((link) => link.getAttribute("href"))).toEqual([`/sample/list/${start}`]);
    const branches = screen.getByRole("navigation", { name: "Ветви" });
    expect(within(branches).getAllByRole("link")).toHaveLength(11);
  });

  it("lead from a reference to the person on another page, and the focus goes there", async () => {
    await open(`/sample/list/${start}`);
    await screen.findAllByRole("heading", { level: 2 });
    const pageOf = (element: Element | null) => element?.closest("[data-page]");
    const lineOf = (link: HTMLAnchorElement) =>
      document.querySelector(`[data-key="p:${link.getAttribute("href")?.split("/").at(-1)}"]`);
    const references = [...document.querySelectorAll<HTMLAnchorElement>("[data-reference] a")];
    const across = references.find((link) => pageOf(lineOf(link)) !== pageOf(link));
    expect(across).toBeDefined();
    const href = across?.getAttribute("href") ?? "";
    press(across as HTMLElement);
    expect(address()).toBe(href);
    const target = document.querySelector<HTMLAnchorElement>('[data-page] a[aria-current="true"]');
    expect(target?.getAttribute("href")).toBe(href);
    await waitFor(() => expect(document.activeElement).toBe(target));
  });

  it("keep the children of a partner alone on the trunk of the union, and say so", async () => {
    const snapshot = familyOf({
      people: [
        { id: "a", branch: "A" },
        "wife",
        { id: "both", branch: "A", parents: ["a", "wife"], born: 2 },
        { id: "hers", parents: ["wife"], born: 1 },
        { id: "taken", parents: [{ parent: "wife", kind: "adoption" }], born: 3 },
      ],
      unions: [["a", "wife"]],
      branches: ["A"],
    });
    const own = { snapshot, start: "a", line: "both" };
    answers["/sample/tree.json"] = () => Promise.resolve(Response.json(own));
    await open("/sample/list/a");
    await screen.findAllByRole("heading", { level: 2 });
    const item = (id: string) => document.querySelector(`[data-key="p:${id}"]`)?.closest("li");
    expect(item("hers")?.textContent).toContain("второй родитель неизвестен");
    expect(item("taken")?.textContent).not.toContain("второй родитель неизвестен");
    expect(item("both")?.textContent).not.toContain("второй родитель неизвестен");
    // One trunk: dark past the child of the partner alone, down to the child on the line.
    expect(item("hers")?.parentElement).toBe(item("both")?.parentElement);
    expect(item("hers")?.dataset["line"]).toBe("pass");
    expect(item("both")?.dataset["line"]).toBe("in");
  });

  it("lead back to the tree, and from the tree here", async () => {
    await open("/sample");
    press(screen.getByRole("link", { name: "По ветвям" }));
    expect(address()).toBe(`/sample/list/${start}`);
    press(screen.getAllByRole("link", { name: "Родословная" }).at(-1) as HTMLElement);
    expect(address()).toBe(`/sample/tree/${start}`);
  });
});

describe("the words of the choices of the centre", () => {
  const forms: Record<string, [string, string, string]> = {
    a: ["Анна", "Анна Ольхунич", "1900–1950"],
    b: ["Анна", "Анна Мятлик", "1901–1960"],
    c: ["Анна", "Анна Мятлик", "1930–2000"],
    d: ["Иван", "Иван Мятлик", "1899–1970"],
  };
  const label = (ids: string[]) => labelsOf(ids, (id) => forms[id] ?? ["", "", ""]);

  it("are the given name, the whole name when two share it, and the years when two share that", () => {
    expect(["a", "d"].map(label(["a", "d"]))).toEqual(["Анна", "Иван"]);
    expect(["a", "b", "d"].map(label(["a", "b", "d"]))).toEqual([
      "Анна Ольхунич",
      "Анна Мятлик",
      "Иван",
    ]);
    expect(["b", "c"].map(label(["b", "c"]))).toEqual([
      "Анна Мятлик, 1901–1960",
      "Анна Мятлик, 1930–2000",
    ]);
  });
});

describe("the fan", () => {
  const fan = () => screen.getByRole("group", { name: /^Предки:/ });

  it("opens on the couple where the branches meet, and the centre can be chosen", async () => {
    await open("/sample/branches?as=fan");
    const { line } = sample;
    const partner = kinOf(sample.snapshot).unions(line)[0]?.other;
    expect(fan().getAttribute("aria-label")).toContain(name(line));
    expect(fan().getAttribute("aria-label")).toContain(name(partner ?? ""));
    const centre = screen.getByRole("navigation", { name: "В центре" });
    const current = within(centre)
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current"));
    expect(current.map((link) => link.getAttribute("href"))).toEqual([
      `/sample/branches?as=fan&person=${line}&with=${partner}`,
    ]);
    press(within(centre).getAllByRole("link")[0] as HTMLElement);
    expect(address()).toBe(`/sample/branches?as=fan&person=${line}`);
    expect(fan().getAttribute("aria-label")).toBe(`Предки: ${name(line)}`);
  });

  it("puts a pressed ancestor in the centre, and leads from the centre to the pedigree", async () => {
    await open(`/sample/branches?as=fan&person=${sample.line}`);
    const cell = fan().querySelector<SVGAElement>("[data-key][tabindex='0']");
    const href = cell?.getAttribute("href") ?? "";
    expect(href).toMatch(/^\/sample\/branches\?as=fan&person=p\d+$/);
    press(cell as unknown as HTMLElement);
    expect(address()).toBe(href);
    const centre = screen.getAllByRole("link", { name: name(href.split("=").at(-1) ?? "") });
    press(centre.at(-1) as HTMLElement);
    expect(address()).toBe(`/sample/tree/${href.split("=").at(-1)}`);
  });

  it("is walked by the arrows, one cell at a time in the order of the keys", async () => {
    await open(`/sample/branches?as=fan&person=${sample.line}`);
    const stops = () => fan().querySelectorAll("[data-key][tabindex='0']");
    expect(stops()).toHaveLength(1);
    const first = stops()[0] as SVGAElement;
    act(() => first.focus());
    fireEvent.keyDown(first, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).not.toBe(first));
    const up = document.activeElement as SVGAElement;
    expect(up.getAttribute("data-key")?.startsWith(first.getAttribute("data-key") ?? "")).toBe(
      true,
    );
    fireEvent.keyDown(up, { key: "ArrowDown" });
    await waitFor(() => expect(document.activeElement).toBe(first));
    expect(stops()).toHaveLength(1);
    const keys = document.getElementById(fan().getAttribute("aria-describedby") ?? "");
    expect(keys?.textContent).toContain("Стрелки ведут по вееру");
  });

  it("is a way of all branches, and the pedigree leads to it", async () => {
    await open(`/sample/list/${start}`);
    const ways = screen.getByRole("navigation", { name: "Показать как" });
    press(within(ways).getByRole("link", { name: "Веер" }));
    expect(address()).toBe(`/sample/branches?as=fan&person=${start}`);
    await open(`/sample/tree/${start}`);
    press(screen.getByRole("link", { name: "Веер предков" }));
    expect(address()).toBe(`/sample/branches?as=fan&person=${start}`);
  });
});

describe("the search", () => {
  const field = () => screen.getByRole("combobox", { name: "Имя или место" });
  const type = (value: string) => fireEvent.change(field(), { target: { value } });

  it("finds by another spelling, and Enter puts the first in the centre", async () => {
    await open("/sample");
    const person = kinOf(sample.snapshot).person(start);
    const other = person?.otherNames[0];
    type(`${other?.given} ${other?.surname}`);
    const options = screen.getAllByRole("option");
    expect(options[0]?.textContent).toContain(other?.given);
    expect(options[0]?.textContent).toContain("Ольхуничи");
    expect(options[0]?.getAttribute("aria-selected")).toBe("true");
    expect(field().getAttribute("aria-activedescendant")).toBe(options[0]?.id);
    press(document.querySelector('[data-role="ancestor"] a') as HTMLElement);
    type(`${other?.given} ${other?.surname}`);
    fireEvent.keyDown(field(), { key: "Enter" });
    expect(centre().dataset["key"]).toBe(`p:${start}`);
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("is walked by the arrows, around the ends", async () => {
    await open("/sample");
    type("ол");
    const { length } = screen.getAllByRole("option");
    expect(length).toBeGreaterThan(2);
    const active = () =>
      screen
        .getAllByRole("option")
        .findIndex((one) => one.getAttribute("aria-selected") === "true");
    fireEvent.keyDown(field(), { key: "ArrowUp" });
    expect(active()).toBe(length - 1);
    fireEvent.keyDown(field(), { key: "ArrowDown" });
    expect(active()).toBe(0);
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("option")).toBeNull();
    expect((field() as HTMLInputElement).value).toBe("");
  });

  it("says that nobody was found", async () => {
    await open("/sample");
    type("ъыьэ");
    const said = screen.getAllByText("Никого не нашли. Проверьте написание.");
    expect(said.some((one) => one.getAttribute("role") === "status")).toBe(true);
  });

  it("is a button on the phone, and gives the focus back", async () => {
    setWidth(360);
    await open("/sample");
    const button = screen.getByRole("button", { name: "Имя или место" });
    press(button);
    expect(document.activeElement).toBe(field());
    fireEvent.keyDown(field(), { key: "Escape" });
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
});

describe("all branches", () => {
  it("open as the pages by branch on the same person, from any old address", async () => {
    await open("/sample/branches");
    await waitFor(() => expect(address()).toBe(`/sample/list/${start}`));
    const father = relativesOf(sample.snapshot, start)?.parents[0]?.person ?? "";
    await open(`/sample/branches?level=near&person=${father}&at=p1.0.0&scale=1.2`);
    await waitFor(() => expect(address()).toBe(`/sample/list/${father}`));
    const branch = sample.snapshot.branches[2]?.id ?? "";
    await open(`/sample/branches?person=${father}&branch=${branch}`);
    await waitFor(() => expect(address()).toBe(`/sample/list/${father}`));
    expect(window.location.hash).toBe(`#page-${branch}`);
  });

  it("are two ways, the pages first and then the fan", async () => {
    await open(`/sample/list/${start}`);
    const ways = screen.getByRole("navigation", { name: "Показать как" });
    const [pages, fan] = within(ways).getAllByRole("link");
    expect(pages?.textContent).toBe("По ветвям");
    expect(pages?.getAttribute("aria-current")).toBe("true");
    expect(fan?.getAttribute("href")).toBe(`/sample/branches?as=fan&person=${start}`);
    const views = screen.getByRole("navigation", { name: "Виды древа" });
    expect(within(views).getByText("Все ветви").getAttribute("aria-current")).toBe("page");
  });

  it("has no sheet to hide the mark behind before there is one", async () => {
    answers["/sample/tree.json"] = () => Promise.reject(new TypeError());
    window.history.replaceState(null, "", "/sample/branches");
    render(<App />);
    await screen.findByRole("alert", {}, { timeout: 4000 });
    expect(document.querySelector("[data-sheet]")).toBeNull();
    expect(screen.getByText("Пример")).toBeTruthy();
  });

  it("is a sheet with a way back on the phone, the fan", async () => {
    setWidth(360);
    await open(`/sample/branches?as=fan&person=${start}`);
    // jsdom knows no media queries, so the styles of the phone are not on.
    const back = document.querySelector("[aria-label='К древу']") as HTMLElement;
    expect(back.getAttribute("href")).toBe(`/sample/tree/${start}`);
  });
});
