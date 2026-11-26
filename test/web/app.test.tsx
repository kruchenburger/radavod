import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "../../web/app/app";

const healthy = { status: "ok", version: "1.2.3", tree: "ok", access: "ok" };

let timeout: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  timeout = vi.spyOn(AbortSignal, "timeout");
  answerWith(Response.json(healthy));
  useBrowserLanguages("ru-RU");
});

it("shows the name, one sentence and the version", async () => {
  render(<App />);
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Radavod");
  expect(screen.getByText("Закрытый сайт с древом вашей семьи.")).toBeTruthy();
  expect(await screen.findByText("Версия 1.2.3")).toBeTruthy();
  expect(fetch).toHaveBeenCalledWith("/health", expect.anything());
});

it("starts in the language of the browser", () => {
  useBrowserLanguages("en-US", "ru");
  render(<App />);
  expect(screen.getByText("A private website for your family tree.")).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");
});

it("starts in Russian for a Belarusian or a Ukrainian browser", () => {
  useBrowserLanguages("be", "en");
  render(<App />);
  expect(document.documentElement.lang).toBe("ru");
});

it("starts in English when the browser speaks neither", () => {
  useBrowserLanguages("pl", "de");
  render(<App />);
  expect(document.documentElement.lang).toBe("en");
});

it("switches the language and remembers it", () => {
  const { unmount } = render(<App />);
  fireEvent.click(screen.getByRole("radio", { name: "English" }));
  expect(screen.getByText("A private website for your family tree.")).toBeTruthy();
  expect(document.documentElement.lang).toBe("en");

  unmount();
  render(<App />);
  expect(document.documentElement.lang).toBe("en");
  expect(radio("English").checked).toBe(true);
});

it("ignores a remembered language it does not have", () => {
  localStorage.setItem("radavod.language", "constructor");
  render(<App />);
  expect(document.documentElement.lang).toBe("ru");
});

it("is light until told otherwise, and remembers", () => {
  const { unmount } = render(<App />);
  expect(theme()).toBe("light");
  fireEvent.click(radio("Тёмная"));
  expect(theme()).toBe("dark");

  unmount();
  render(<App />);
  expect(theme()).toBe("dark");
  fireEvent.click(radio("Светлая"));
  expect(theme()).toBe("light");
});

it("follows the theme of the browser until told otherwise", () => {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        matches: query === "(prefers-color-scheme: dark)",
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
  render(<App />);
  expect(theme()).toBe("dark");
  expect(radio("Тёмная").checked).toBe(true);
  fireEvent.click(radio("Светлая"));
  expect(theme()).toBe("light");
});

it("works where the browser forbids storage", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("localStorage", {
    getItem: forbidden,
    setItem: forbidden,
    removeItem: forbidden,
    clear() {},
  });
  render(<App />);
  fireEvent.click(radio("English"));
  fireEvent.click(radio("Dark"));
  expect(document.documentElement.lang).toBe("en");
  expect(theme()).toBe("dark");
});

it("says that it is waiting for the server", () => {
  vi.stubGlobal("fetch", () => new Promise(() => {}));
  render(<App />);
  expect(status()).toBe("Проверяем связь с сервером");
});

it("has a text of its own for data that is down", async () => {
  answerWith(Response.json({ ...healthy, status: "error", tree: "error" }, { status: 503 }));
  render(<App />);
  await waitFor(() =>
    expect(status()).toBe("Древо не открывается: хранилище не отвечает. Напишите хранителю."),
  );
  expect(screen.getByText("Версия 1.2.3")).toBeTruthy();
});

it.each([
  ["a page", () => Promise.resolve(new Response("<html>", { status: 502 }))],
  ["another answer", () => Promise.resolve(Response.json({ version: 1 }))],
])("has a text of its own for a server that answers with %s", async (_, fetch) => {
  vi.stubGlobal("fetch", fetch);
  render(<App />);
  await waitFor(() =>
    expect(status()).toBe("Сервер ответил с ошибкой. Обновите страницу или напишите хранителю."),
  );
});

it("does not wait for a silent server forever", () => {
  render(<App />);
  const [, options] = vi.mocked(fetch).mock.calls[0] ?? [];
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  expect(timeout).toHaveBeenCalledWith(10_000);
});

it.each([
  ["no connection", () => Promise.reject(new TypeError("Failed to fetch"))],
  ["an answer cut off", () => Promise.resolve({ text: () => Promise.reject(new TypeError()) })],
  ["too long a wait", () => Promise.reject(new DOMException("", "TimeoutError"))],
])("has a text of its own for a server that does not answer: %s", async (_, fetch) => {
  vi.stubGlobal("fetch", fetch);
  render(<App />);
  await waitFor(
    () => expect(status()).toBe("Сервер не ответил. Проверьте интернет и обновите страницу."),
    { timeout: 4000 },
  );
});

it("is operated with native controls that have names", () => {
  render(<App />);
  expect(screen.getByRole("main")).toBeTruthy();
  for (const name of ["Язык", "Тема"]) {
    const group = screen.getByRole("radiogroup", { name });
    expect(group.querySelectorAll("input[type=radio]:not([tabindex='-1'])")).toHaveLength(2);
  }
  expect(screen.getByText("English").getAttribute("lang")).toBe("en");
});

function answerWith(response: Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(response.clone())),
  );
}

function useBrowserLanguages(...languages: string[]) {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(languages);
}

function radio(name: string) {
  return screen.getByRole("radio", { name }) as HTMLInputElement;
}

function theme() {
  return document.documentElement.getAttribute("data-mantine-color-scheme");
}

function status() {
  return screen.getByRole("status").textContent;
}

function forbidden(): never {
  throw new DOMException("denied", "SecurityError");
}
