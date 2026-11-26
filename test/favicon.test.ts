import { expect, it } from "vitest";
import { app } from "../src/worker/app";
import type { Env } from "../src/worker/env";

it("sends whoever asks for the old icon to the one the page names", async () => {
  // Assets come first; the worker hears only what is not a file.
  const res = await app.request("/favicon.ico", {}, {} as Env);
  expect(res.status).toBe(301);
  expect(res.headers.get("location")).toBe("/favicon.svg");
});
