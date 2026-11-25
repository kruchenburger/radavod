import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateFamily } from "../../examples/generate.ts";
import { sampleOf } from "../../examples/snapshot.ts";
import { App } from "../../web/app/app";
import { kinOf } from "../../web/tree/layout/kin";
import { relativesOf } from "../../web/tree/layout/relatives";
import { wordsOf } from "../../web/tree/words";

/** Answers as the worker of a browser does, or breaks as one that did not load. */
const { FakeWorker } = vi.hoisted(() => {
  class FakeWorker extends EventTarget {
    static isMissing = false;

    postMessage(data: unknown): void {
      const sent = structuredClone(data);
      queueMicrotask(async () => {
        if (FakeWorker.isMissing) {
          this.dispatchEvent(new Event("error"));
          return;
        }
        const { handle } = await import("../../web/tree/layout.worker");
        const reply = handle(sent as never);
        this.dispatchEvent(new MessageEvent("message", { data: reply }));
      });
    }

    terminate(): void {}
  }
  return { FakeWorker };
});
vi.mock("../../web/tree/layout.worker?worker", () => ({ default: FakeWorker }));

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
  versions: "p179",
  unnamed: "p191",
};

type Answers = Partial<
  Record<"/config" | "/health" | "/sample/tree.json", () => Promise<Response>>
>;

let answers: Answers;
let problems: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  FakeWorker.isMissing = false;
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
  act(() => void window.dispatchEvent(new Event("resize")));
}

async function open(href: string): Promise<void> {
  window.history.replaceState(null, "", href);
  render(<App />);
  await waitFor(() => expect(document.querySelector("[data-screen]")).not.toBeNull());
  await waitFor(() => expect(screen.queryByText("Открываем древо")).toBeNull());
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
    expect(await screen.findByText("Пример")).toBeTruthy();
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
  it.each(["/sample", "/sample/branches", `/sample/person/${start}`, `/sample/list/${start}`])(
    "%s is an unknown page",
    async (href) => {
      answers["/config"] = () => Promise.resolve(Response.json({ sample: false }));
      window.history.replaceState(null, "", href);
      render(<App />);
      expect(await screen.findByText("Такой страницы нет")).toBeTruthy();
      expect(document.body.textContent).not.toContain("Пример");
      press(screen.getByRole("button", { name: "На стартовую" }));
      expect(address()).toBe("/");
    },
  );
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
  it.each(["/sample", "/sample/branches", `/sample/person/${start}`, `/sample/list/${start}`])(
    "%s carries the mark and a way out",
    async (href) => {
      await open(href);
      expect(screen.getAllByText("Пример").length).toBeGreaterThan(0);
      press(screen.getByRole("link", { name: "Закрыть пример" }));
      expect(address()).toBe("/");
    },
  );

  it("has the views, the language and the theme", async () => {
    await open("/sample");
    const views = screen.getByRole("navigation", { name: "Виды древа" });
    expect(within(views).getByText("Вокруг человека").getAttribute("aria-current")).toBe("page");
    press(screen.getByRole("button", { name: "Тема: Тёмная" }));
    expect(document.documentElement.getAttribute("data-mantine-color-scheme")).toBe("dark");
    press(screen.getByRole("button", { name: "English" }));
    expect(screen.getByText("Around a person")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(address()).toBe("/sample");
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
    const closed = within(tree()).getAllByRole("link", { name: /^Дети: \d/ });
    expect(closed.length).toBeGreaterThan(0);
    const before = within(tree()).getAllByText(/^Дети: \d/).length;
    press(closed[0] as HTMLElement);
    expect(address()).toMatch(/union=p\d+/);
    expect(within(tree()).getAllByText(/^Дети: \d/)).toHaveLength(before);
    const opened = within(tree())
      .getAllByText(/^Дети: \d/)
      .filter(({ tagName }) => tagName === "B");
    expect(opened).toHaveLength(1);
  });

  it("names an ancestor who stands twice once, and leads there", async () => {
    await open(`/sample/tree/${hard.repeated}`);
    const reference = within(tree()).getAllByRole("link", { name: /^Те(?:| же) родители|^Тот же/ });
    expect(reference.length).toBeGreaterThan(0);
    press(reference[0] as HTMLElement);
    expect(address()).toMatch(/^\/sample\/tree\/p\d+$/);
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
    expect(document.querySelector("path[class*=adopted]")).not.toBeNull();
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
    press(own as HTMLElement);
    expect(address()).toContain("/sample/branches?level=closer");
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
    expect(href("Показать среди ветвей")).toBe(`/sample/branches?level=near&person=${parent}`);
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

describe("the list", () => {
  it("has the kin, and everybody once by branch and generation", async () => {
    await open(`/sample/list/${start}`);
    await screen.findAllByText("1-е поколение");
    const branches = screen.getByRole("heading", { name: "Ветви", level: 2 })
      .parentElement as HTMLElement;
    const ids = [...branches.querySelectorAll("a")].map((link) => link.getAttribute("href"));
    expect(new Set(ids).size).toBe(300);
    expect(ids).toHaveLength(300);
    const own = branches.querySelector("details[open] h3");
    expect(own?.textContent).toBe("Ольхуничи");
    expect(branches.querySelectorAll("details[open]")).toHaveLength(1);
  });

  it("leads back to the tree, and from the tree here", async () => {
    await open("/sample");
    press(screen.getByRole("link", { name: "Списком" }));
    expect(address()).toBe(`/sample/list/${start}`);
    press(screen.getByRole("link", { name: "Древом" }));
    expect(address()).toBe(`/sample/tree/${start}`);
  });

  it("says so when the branches cannot be arranged", async () => {
    FakeWorker.isMissing = true;
    // A map that was laid out before is kept, so this one is of a tree nobody saw.
    answers["/sample/tree.json"] = () => Promise.resolve(Response.json(structuredClone(sample)));
    await open(`/sample/list/${start}`);
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Браузер не смог разложить ветви. Обновите страницу.",
    );
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
    expect(screen.getByText("Никого не нашли. Проверьте написание.")).toBeTruthy();
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
  const window_ = () => screen.getByRole("group", { name: "Все ветви" });
  const levels = () => screen.getByRole("navigation", { name: "Масштаб" });

  it("says that it is laid out, then shows a page for every branch as a link", async () => {
    answers["/sample/tree.json"] = () => Promise.resolve(Response.json(structuredClone(sample)));
    await open("/sample/branches");
    expect(screen.getByText("Раскладываем ветви")).toBeTruthy();
    await waitFor(() => expect(window_()).toBeTruthy());
    const pages = within(window_()).getAllByRole("link");
    // One more for people of no branch.
    expect(pages).toHaveLength(11);
    expect(pages.filter(({ tabIndex }) => tabIndex === 0)).toHaveLength(1);
    const description = document.getElementById(window_().getAttribute("aria-describedby") ?? "");
    expect(description?.textContent).toContain("Стрелки ведут по ветвям");
  });

  it("says why when it cannot be, and leads to the list", async () => {
    FakeWorker.isMissing = true;
    answers["/sample/tree.json"] = () => Promise.resolve(Response.json(structuredClone(sample)));
    await open("/sample/branches");
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Браузер не смог разложить ветви.",
    );
    press(screen.getByRole("button", { name: "Списком" }));
    expect(address()).toBe(`/sample/list/${start}`);
  });

  it("comes closer when a page is pressed, and back leads back", async () => {
    await open("/sample/branches");
    await waitFor(() => expect(window_()).toBeTruthy());
    press(within(window_()).getAllByRole("link")[2] as HTMLElement);
    expect(address()).toContain("level=closer");
    await waitFor(() => expect(window_().dataset["level"]).toBe("closer"));
    expect(within(levels()).getByText("Ближе").getAttribute("aria-current")).toBe("true");
    await waitFor(() => expect(address()).toContain("at="));
    act(() => window.history.back());
    await waitFor(() => expect(window_().dataset["level"]).toBe("far"));
  });

  it("has names as links near the window only, one of them in the order of the keys", async () => {
    await open(`/sample/branches?level=near&person=${start}`);
    await waitFor(() => expect(window_().dataset["level"]).toBe("near"));
    const people = within(window_()).getAllByRole("link");
    expect(people.length).toBeGreaterThan(5);
    expect(people.length).toBeLessThan(150);
    const [stop, ...rest] = people.filter(({ tabIndex }) => tabIndex === 0);
    expect(rest).toEqual([]);
    expect(stop?.dataset["press"]).toBe(`p:${start}`);
    expect(stop?.getAttribute("aria-current")).toBe("true");
    expect(stop?.getAttribute("href")).toBe(`/sample/person/${start}`);
  });

  it("is walked by the arrows, and Esc goes away a step", async () => {
    await open(`/sample/branches?level=near&person=${start}`);
    await waitFor(() => expect(window_().dataset["level"]).toBe("near"));
    const stop = window_().querySelector<HTMLElement>('a[tabindex="0"]') as HTMLElement;
    stop.focus();
    fireEvent.keyDown(stop, { key: "ArrowUp" });
    await waitFor(() => expect(document.activeElement).not.toBe(stop));
    const parent = document.activeElement as HTMLElement;
    const parents = relativesOf(sample.snapshot, start)?.parents.map(({ person }) => `p:${person}`);
    expect(parents).toContain(parent.dataset["press"]);
    fireEvent.keyDown(parent, { key: "Escape" });
    await waitFor(() => expect(window_().dataset["level"]).toBe("closer"));
    fireEvent.keyDown(window_(), { key: "Escape" });
    await waitFor(() => expect(window_().dataset["level"]).toBe("far"));
  });

  it("is a sheet with a way back on the phone", async () => {
    setWidth(360);
    await open(`/sample/branches?person=${start}`);
    // jsdom knows no media queries, so the styles of the phone are not on.
    const back = document.querySelector("[aria-label='К древу']") as HTMLElement;
    expect(back.getAttribute("href")).toBe(`/sample/tree/${start}`);
  });
});
