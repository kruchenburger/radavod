import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TablePreview } from "../../src/shared/exchange";
import { App } from "../../web/app/app";

const keeper = {
  member: "member_Ann1111111111111111111",
  name: "Ann",
  nickname: null,
  role: "keeper",
  person: null,
  family: "Oaks",
  via: "passkey",
  mayImport: true,
};

const preview: TablePreview = {
  people: [
    {
      row: 1,
      given: "Сымон",
      patronymic: "Антонавіч",
      surname: "Лазовік",
      maiden: null,
      born: "12 Март 1898",
      died: "14.5.1961",
      living: "no",
    },
    {
      row: 2,
      given: "Ганна",
      patronymic: "Пятроўна",
      surname: "Лазовік",
      maiden: "Карніловіч",
      born: "Май 1902",
      died: null,
      living: "unknown",
    },
  ],
  unions: 1,
  parents: 0,
  births: 2,
  deaths: 1,
  sources: 0,
  left: { statuses: 2, notes: 0 },
  problems: [{ row: 2, code: "unknown-month", value: "Янврь" }],
};

type Route = { status?: number; body?: unknown };

/** The server, by "METHOD /path"; what it was asked, with the bodies. */
function serve(routes: Record<string, Route>) {
  const asked: { key: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    asked.push({ key, body: init.body === undefined ? undefined : JSON.parse(String(init.body)) });
    if (url === "/health") {
      return Response.json({ status: "ok", version: "1", tree: "ok", access: "ok" });
    }
    if (url === "/config") return Response.json({ sample: false });
    const found = routes[key];
    if (found === undefined) throw new TypeError("Failed to fetch");
    return Response.json(found.body ?? null, { status: found.status ?? 200 });
  });
  return asked;
}

const table = "1,Лазовік,Сымон\n";

async function choose(content: BlobPart) {
  const input = await screen.findByLabelText("Файл таблицы");
  fireEvent.change(input, { target: { files: [new File([content], "family.csv")] } });
}

beforeEach(() => {
  localStorage.setItem("radavod.language", "ru");
  window.history.replaceState(null, "", "/import");
});

describe("the import of a table", () => {
  it("shows a keeper what will be added and every problem, and adds it when asked", async () => {
    const asked = serve({
      "GET /api/session": { body: keeper },
      "POST /api/import/table/preview": { body: preview },
      "POST /api/import/table": { status: 201, body: { people: 2 } },
    });
    render(<App />);
    const link = await screen.findByRole("link", { name: "Импорт" });
    expect(link.getAttribute("aria-current")).toBe("page");
    await choose(table);
    expect(await screen.findByText("2 человека")).toBeTruthy();
    expect(screen.getByText("1 союз")).toBeTruthy();
    expect(screen.getByText("Столбцы «анкета» и «заметки» не переносятся.")).toBeTruthy();
    expect(screen.getByText("Лазовік Карніловіч Ганна Пятроўна")).toBeTruthy();
    expect(
      screen.getByText(
        "Строка 2: месяц «Янврь» не прочитан. Дата рождения останется как в таблице.",
      ),
    ).toBeTruthy();
    // Nothing is added before the button.
    expect(asked.map(({ key }) => key)).not.toContain("POST /api/import/table");

    fireEvent.click(screen.getByRole("button", { name: "Добавить в древо" }));
    expect((await screen.findByRole("status")).textContent).toContain(
      "В древо добавлены 2 человека",
    );
    const sent = asked.filter(({ key }) => key.startsWith("POST /api/import/table"));
    expect(sent).toEqual([
      { key: "POST /api/import/table/preview", body: { text: table } },
      { key: "POST /api/import/table", body: { text: table } },
    ]);
  });

  it("says why a table is refused, and lets another file be chosen", async () => {
    serve({
      "GET /api/session": { body: keeper },
      "POST /api/import/table/preview": { status: 409, body: { error: "tree-not-empty" } },
    });
    render(<App />);
    await choose(table);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "В древе уже есть люди. Таблицу можно добавить только в древо, где ещё никого нет.",
    );
    expect(screen.getByLabelText("Файл таблицы")).toBeTruthy();
  });

  it("does not send a file that is not in UTF-8", async () => {
    const asked = serve({ "GET /api/session": { body: keeper } });
    render(<App />);
    // «Ян» in Windows-1251.
    await choose(new Uint8Array([0xdf, 0xed]));
    expect((await screen.findByRole("alert")).textContent).toContain("Файл не в кодировке UTF-8.");
    expect(asked.map(({ key }) => key)).not.toContain("POST /api/import/table/preview");
  });

  it("is not offered to an editor, and says who may do it", async () => {
    serve({ "GET /api/session": { body: { ...keeper, role: "editor", mayImport: false } } });
    render(<App />);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Это может сделать только хранитель.",
    );
    expect(screen.queryByRole("link", { name: "Импорт" })).toBeNull();
    await waitFor(() => expect(screen.queryByLabelText("Файл таблицы")).toBeNull());
  });
});
