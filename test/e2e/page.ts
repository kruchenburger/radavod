import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test as base } from "@playwright/test";

/**
 * Every test also fails when the page asks another site for anything or reports an error, and a
 * quiet one when anything is written to the console as an error.
 */
export const test = base.extend<{ outside: void; isQuiet: boolean }>({
  isQuiet: [false, { option: true }],
  outside: [
    async ({ context, baseURL, isQuiet }, use, info) => {
      const origin = new URL(baseURL ?? "").origin;
      const asked: string[] = [];
      const errors: string[] = [];
      context.on("request", (request) => asked.push(request.url()));
      context.on("page", (page) => page.on("websocket", (socket) => asked.push(socket.url())));
      context.on("weberror", (error) => errors.push(String(error.error())));
      context.on("console", (message) => {
        if (isQuiet && message.type() === "error") errors.push(message.text());
      });
      await use();
      if (info.expectedStatus === "skipped") return;
      const isOwn = (url: string) => url.startsWith("data:") || new URL(url).origin === origin;
      expect(asked.length, "requests seen").toBeGreaterThan(0);
      expect(asked.filter((url) => !isOwn(url))).toEqual([]);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export async function expectAccessible(page: Page): Promise<void> {
  const { violations, passes } = await new AxeBuilder({ page }).analyze();
  expect(passes.length, "rules that found something to check").toBeGreaterThan(5);
  const grave = violations.filter(({ impact }) => impact === "serious" || impact === "critical");
  expect(grave.map(({ id, nodes }) => ({ id, nodes: nodes.map(({ html }) => html) }))).toEqual([]);
}

export async function expectNoSideScroll(page: Page): Promise<void> {
  // The width that does not fit, also where a page hides it.
  const widths = await page.evaluate(
    "({ content: document.documentElement.scrollWidth, window: window.innerWidth })",
  );
  const width = page.viewportSize()?.width;
  expect(widths).toEqual({ content: width, window: width });
}

export const theme = (page: Page) => page.locator("html").getAttribute("data-mantine-color-scheme");
