import { describe, expect, it } from "vitest";
import { tableImported, tablePreview } from "../../src/shared/exchange";
import family from "../exchange/family-table.csv?raw";
import { Family } from "./family";

const preview = "/api/import/table/preview";
const apply = "/api/import/table";

describe("importing a table over HTTP", () => {
  it("shows a keeper what will be added, then adds it once", async () => {
    const { keeper } = await Family.withRoles();
    const seen = await keeper.json("POST", preview, { body: { text: family } });
    expect(seen.status).toBe(200);
    const told = tablePreview.parse(seen.body);
    expect(told.people).toHaveLength(44);
    expect(told.problems.length).toBeGreaterThan(0);

    const done = await keeper.json("POST", apply, { body: { text: family } });
    expect(done.status).toBe(201);
    expect(tableImported.parse(done.body)).toEqual({ people: 44 });

    // The tree has people now: a table goes only into an empty one.
    for (const path of [preview, apply]) {
      expect(await keeper.json("POST", path, { body: { text: family } })).toEqual({
        status: 409,
        body: { error: "tree-not-empty" },
      });
    }
  });

  it("is for a keeper alone", async () => {
    const { editor, reader } = await Family.withRoles();
    for (const browser of [editor, reader]) {
      for (const path of [preview, apply]) {
        expect(await browser.json("POST", path, { body: { text: family } })).toEqual({
          status: 403,
          body: { error: "forbidden" },
        });
      }
    }
  });

  it("refuses what is no table, and a request from another site", async () => {
    const { keeper } = await Family.withRoles();
    expect(await keeper.json("POST", preview, { body: { text: ",,\n" } })).toEqual({
      status: 400,
      body: { error: "empty-table" },
    });
    expect(await keeper.json("POST", preview, { body: { text: "x".repeat(2_000_001) } })).toEqual({
      status: 413,
      body: { error: "too-large" },
    });
    expect(await keeper.json("POST", apply, { body: { text: "ж".repeat(4_500_000) } })).toEqual({
      status: 413,
      body: { error: "too-large" },
    });
    expect(await keeper.json("POST", preview, { body: { file: family } })).toEqual({
      status: 400,
      body: { error: "bad-request" },
    });
    const elsewhere = await keeper.json("POST", apply, {
      body: { text: family },
      origin: "https://elsewhere.test",
    });
    expect(elsewhere.status).toBe(403);
  });
});
