import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { app } from "../src/worker/app";
import type { Env } from "../src/worker/env";

const page = "<!doctype html>";
const asked: string[] = [];

function envWith(sample: unknown): Env {
  const fetch = (request: Request): Promise<Response> => {
    asked.push(new URL(request.url).pathname);
    return Promise.resolve(new Response(page, { headers: { "content-type": "text/html" } }));
  };
  return { ASSETS: { fetch }, SAMPLE: sample } as unknown as Env;
}

const on = envWith("on");
const screens = [
  "/sample",
  "/sample/tree/p1",
  "/sample/tree/p1?siblings=1",
  "/sample/branches",
  "/sample/branches?level=near&at=p1_0_0",
  "/sample/person/p1",
  "/sample/list/p1",
  "/sample/generations",
  "/sample/generations/p1",
];

it("is off unless an installation turns it on", async () => {
  const res = await exports.default.fetch("https://x/config");
  expect([res.status, await res.json()]).toEqual([200, { sample: false }]);
});

describe.each([
  ["on", true],
  ["off", false],
  ["ON", false],
  ["true", false],
  ["", false],
  [undefined, false],
])("SAMPLE is %j", (value, isOn) => {
  it(`says so in the config: ${isOn}`, async () => {
    const res = await app.request("/config", {}, envWith(value));
    expect(await res.json()).toEqual({ sample: isOn });
    // A change of the setting is seen at once.
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it.each(screens)("answers %s as it should", async (path) => {
    const res = await app.request(path, {}, envWith(value));
    expect(res.status).toBe(isOn ? 200 : 404);
    expect((await res.text()) === page).toBe(isOn);
  });
});

it.each([
  ["on", 200],
  ["off", 404],
])("the tree itself is closed with the rest: %s", async (value, status) => {
  asked.length = 0;
  const res = await app.request("/sample/tree.json", {}, envWith(value));
  expect(res.status).toBe(status);
  expect(asked).toEqual(value === "on" ? ["/sample/tree.json"] : []);
});

it("serves the page of the app, whatever the address", async () => {
  asked.length = 0;
  await app.request("/sample/person/p1", {}, on);
  expect(asked).toEqual(["/"]);
});

it.each([
  "/sample/",
  "/sample/tree",
  "/sample/tree/",
  "/sample/tree/p1/more",
  "/sample/branches/b1",
  "/sample/people",
  "/sample/tree/a b",
  "/samples",
  "/tree/p1",
])("knows no screen at %s", async (path) => {
  expect((await app.request(path, {}, on)).status).toBe(404);
});

it.each(["POST", "PUT", "DELETE"])("takes nothing by %s", async (method) => {
  expect((await app.request("/sample", { method }, on)).status).toBe(404);
});

it("is still closed to data", async () => {
  expect((await app.request("/api/tree", {}, on)).status).toBe(401);
});
