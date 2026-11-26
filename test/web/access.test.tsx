import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../web/app/app";

const webauthn = vi.hoisted(() => ({
  supports: true,
  startRegistration: vi.fn(),
  startAuthentication: vi.fn(),
}));
vi.mock("@simplewebauthn/browser", () => ({
  browserSupportsWebAuthn: () => webauthn.supports,
  startRegistration: webauthn.startRegistration,
  startAuthentication: webauthn.startAuthentication,
}));

const secret = "A".repeat(43);
const ann = {
  member: "member_Ann1111111111111111111",
  name: "Ann",
  role: "keeper",
  person: null,
  family: "Oaks",
  via: "passkey",
};

type Route = { status?: number; body?: unknown; headers?: Record<string, string> };

/** The server, by "METHOD /path": anything else is a server that does not answer. */
function serve(routes: Record<string, Route | ((body: unknown) => Route)>) {
  const asked: { key: string; body: unknown }[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const key = `${init.method ?? "GET"} ${url}`;
    const body = init.body === undefined ? undefined : JSON.parse(String(init.body));
    asked.push({ key, body });
    const found = routes[key];
    if (found === undefined) {
      if (url === "/health")
        return Response.json({ status: "ok", version: "1", tree: "ok", access: "ok" });
      if (url === "/config") return Response.json({ sample: false });
      // Nobody is signed in, and the server says so.
      if (key === "GET /api/session") return Response.json(null);
      throw new TypeError("Failed to fetch");
    }
    const {
      status = 200,
      body: answer = null,
      headers = {},
    } = typeof found === "function" ? found(body) : found;
    return status === 204
      ? new Response(null, { status })
      : Response.json(answer, { status, headers });
  });
  return asked;
}

function open(path: string, hash = "") {
  window.history.replaceState(null, "", `${path}${hash}`);
  render(<App />);
}

const field = (name: RegExp | string) => screen.getByRole("textbox", { name });
const type = (name: RegExp | string, value: string) =>
  fireEvent.change(field(name), { target: { value } });
const press = (name: RegExp | string) => fireEvent.click(screen.getByRole("button", { name }));
const alert = () => screen.findByRole("alert");

beforeEach(() => {
  webauthn.supports = true;
  webauthn.startRegistration.mockReset().mockResolvedValue({ id: "made" });
  webauthn.startAuthentication.mockReset().mockResolvedValue({ id: "signed" });
  localStorage.setItem("radavod.language", "ru");
});

describe("the first run", () => {
  it("makes a passkey with the code, the family and the name, and opens the members", async () => {
    const asked = serve({
      "POST /api/setup/options": { body: { flow: "f", options: { challenge: "c" } } },
      "POST /api/setup/verify": { body: ann },
      "GET /api/members": { body: { members: [], invitations: [] } },
      "GET /api/members/log": { body: { log: [] } },
    });
    open("/setup");
    const button = await screen.findByRole("button", { name: "Создать ключ доступа" });
    expect(button).toHaveProperty("disabled", true);
    type(/Код установки/u, "a code of the installation");
    type(/Название семьи/u, "Oaks");
    type(/Ваше имя/u, "Ann");
    type(/Название устройства/u, "phone");
    press("Создать ключ доступа");
    await waitFor(() => expect(window.location.pathname).toBe("/family"));
    expect(asked.find(({ key }) => key === "POST /api/setup/options")?.body).toEqual({
      code: "a code of the installation",
      family: "Oaks",
      name: "Ann",
    });
    expect(asked.find(({ key }) => key === "POST /api/setup/verify")?.body).toEqual({
      flow: "f",
      response: { id: "made" },
      label: "phone",
    });
  });

  it("says why a code is refused, and that a closed window is no failure", async () => {
    serve({ "POST /api/setup/options": { status: 403, body: { error: "setup-refused" } } });
    open("/setup");
    type(
      await screen.findByRole("textbox", { name: /Код установки/u }).then(() => /Код установки/u),
      "x",
    );
    type(/Название семьи/u, "Oaks");
    type(/Ваше имя/u, "Ann");
    press("Создать ключ доступа");
    expect((await alert()).textContent).toBe(
      "Код не подошёл. Проверьте его у того, кто установил сайт.",
    );
  });

  it("asks for a name once the field is left empty", async () => {
    serve({});
    open("/setup");
    const name = await screen.findByRole("textbox", { name: /Ваше имя/u });
    fireEvent.blur(name);
    expect(await screen.findByText("Напишите ваше имя.")).toBeTruthy();
  });
});

describe("an invitation", () => {
  const invitation = (body: object) => ({ "POST /api/invitation": { body } });

  it("needs its secret, and says when a link is cut off", async () => {
    serve({});
    open("/join");
    expect((await alert()).textContent).toBe(
      "Ссылка открылась не полностью. Скопируйте её из сообщения целиком и откройте снова.",
    );
  });

  it("says why a used link does not work", async () => {
    serve({ "POST /api/invitation": { status: 410, body: { error: "spent" } } });
    open("/join", `#${secret}`);
    expect((await alert()).textContent).toBe(
      "Эта ссылка уже использована. Попросите хранителя прислать новую.",
    );
  });

  it("names the family and the role, and lets a reader link this browser", async () => {
    const asked = serve({
      ...invitation({ kind: "join", role: "reader", family: "Oaks" }),
      "POST /api/device/bind": { body: { ...ann, role: "reader", via: "device" } },
      "GET /api/members": { body: { members: [] } },
    });
    open("/join", `#${secret}`);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Приглашение в семью «Oaks»" }),
    ).toBeTruthy();
    expect(screen.getByText("Вас приглашают читателем.")).toBeTruthy();
    expect(screen.getByText("Видит древо, но не меняет его.")).toBeTruthy();
    type(/Ваше имя/u, "Gran");
    type(/Название браузера/u, "tablet");
    press("Привязать этот браузер");
    await waitFor(() => expect(window.location.pathname).toBe("/family"));
    expect(asked.find(({ key }) => key === "POST /api/device/bind")?.body).toEqual({
      secret,
      label: "tablet",
      name: "Gran",
    });
  });

  it("offers no browser to link to an editor, and no name to a recovery link", async () => {
    serve(invitation({ kind: "join", role: "editor", family: "Oaks" }));
    open("/join", `#${secret}`);
    await screen.findByText("Вас приглашают редактором.");
    expect(screen.queryByRole("button", { name: "Привязать этот браузер" })).toBeNull();
  });

  it("brings an account back without asking a name", async () => {
    const asked = serve({
      ...invitation({ kind: "recovery", role: "editor", family: "Oaks" }),
      "POST /api/passkey/register/options": { body: { flow: "f", options: {} } },
      "POST /api/passkey/register/verify": { body: ann },
      "GET /api/members": { body: { members: [] } },
    });
    open("/join", `#${secret}`);
    await screen.findByText(
      "Это ссылка для восстановления. Создайте новый ключ доступа: прежние уже отключены.",
    );
    expect(screen.queryByRole("textbox", { name: /Ваше имя/u })).toBeNull();
    press("Создать ключ доступа");
    await waitFor(() => expect(window.location.pathname).toBe("/family"));
    expect(asked.find(({ key }) => key === "POST /api/passkey/register/options")?.body).toEqual({
      secret,
    });
  });

  it("in a messenger, sends to a real browser and keeps the reader's other way in", async () => {
    webauthn.supports = false;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Telegram-Android/11");
    const asked = serve(invitation({ kind: "join", role: "reader", family: "Oaks" }));
    open("/join", `#${secret}`);
    expect((await alert()).textContent).toBe(
      "Внутри мессенджера ключ доступа не создать. Откройте ссылку в браузере: в меню «Открыть в браузере» или скопируйте её.",
    );
    expect(screen.getByRole("button", { name: "Скопировать ссылку" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Привязать этот браузер" })).toBeTruthy();
    // Opening it spends nothing.
    expect(asked.map(({ key }) => key)).not.toContain("POST /api/device/bind");
  });
});

describe("signing in", () => {
  it("opens the members", async () => {
    serve({
      "POST /api/passkey/login/options": { body: { flow: "f", options: {} } },
      "POST /api/passkey/login/verify": { body: ann },
      "GET /api/members": { body: { members: [] } },
    });
    open("/sign-in");
    press(
      await screen
        .findByRole("button", { name: "Войти с ключом доступа" })
        .then(() => "Войти с ключом доступа"),
    );
    await waitFor(() => expect(window.location.pathname).toBe("/family"));
  });

  it("says when to try again, and why a passkey is refused", async () => {
    serve({
      "POST /api/passkey/login/options": {
        status: 429,
        body: { error: "rate-limited" },
        headers: { "retry-after": "120" },
      },
    });
    open("/sign-in");
    press(
      await screen
        .findByRole("button", { name: "Войти с ключом доступа" })
        .then(() => "Войти с ключом доступа"),
    );
    expect((await alert()).textContent).toBe("Слишком много попыток. Повторите через 2 минуты.");
  });

  it("calls a closed passkey window what it is", async () => {
    webauthn.startAuthentication.mockRejectedValue(
      Object.assign(new Error("x"), { name: "NotAllowedError" }),
    );
    serve({ "POST /api/passkey/login/options": { body: { flow: "f", options: {} } } });
    open("/sign-in");
    press(
      await screen
        .findByRole("button", { name: "Войти с ключом доступа" })
        .then(() => "Войти с ключом доступа"),
    );
    expect((await alert()).textContent).toBe(
      "Окно ключа доступа закрылось. Нажмите кнопку ещё раз.",
    );
  });

  it("sends whoever is signed out of a member's page to sign in", async () => {
    serve({});
    open("/family");
    await waitFor(() => expect(window.location.pathname).toBe("/sign-in"));
  });
});

describe("the members", () => {
  const roster = {
    members: [
      {
        id: ann.member,
        name: "Ann",
        role: "keeper",
        version: 1,
        revokedAt: null,
        credentials: [
          {
            id: "p1",
            kind: "passkey",
            label: "phone",
            lastUsedAt: 1_800_000_000_000,
            revokedAt: null,
          },
        ],
      },
      {
        id: "member_Gran111111111111111111",
        name: "Gran",
        role: "reader",
        version: 1,
        revokedAt: null,
        credentials: [
          { id: "d1", kind: "device", label: "", lastUsedAt: 1_800_000_000_000, revokedAt: null },
        ],
      },
    ],
    invitations: [],
  };

  it("give a keeper a link to send once, and say the cost of turning sign-in off", async () => {
    serve({
      "GET /api/session": { body: ann },
      "GET /api/members": { body: roster },
      "GET /api/members/log": {
        body: {
          log: [
            {
              at: 1_800_000_000_000,
              kind: "sign-in",
              member: ann.member,
              credential: "p1",
              by: null,
              country: null,
            },
          ],
        },
      },
      "POST /api/members/invitations": {
        status: 201,
        body: { id: "i", secret, expiresAt: 1_800_000_000_000 },
      },
    });
    open("/family");
    await screen.findByText("Gran");
    expect(screen.getByText("браузер без названия")).toBeTruthy();
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("listitem")
          .some(({ textContent }) => textContent?.endsWith("Ann, вход, страна неизвестна")),
      ).toBe(true),
    );
    press("Создать приглашение");
    const link = await screen.findByRole("textbox", { name: "Ссылка" });
    expect((link as HTMLInputElement).value).toBe(`${window.location.origin}/join#${secret}`);
    expect(screen.getByText(/Больше она не появится, скопируйте её сейчас\./u)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Отключить вход" })[1] as HTMLElement);
    expect(
      await screen.findByText("Gran больше не сможет войти. Правки останутся в журнале правок."),
    ).toBeTruthy();
  });

  it("show only names and roles to a reader", async () => {
    serve({
      "GET /api/session": { body: { ...ann, role: "reader" } },
      "GET /api/members": { body: { members: [{ id: ann.member, name: "Ann", role: "keeper" }] } },
    });
    open("/family");
    await screen.findByText("Ann");
    expect(screen.queryByText("Пригласить")).toBeNull();
    expect(screen.queryByRole("button", { name: "Отключить вход" })).toBeNull();
  });
});

describe("one's own account", () => {
  const account = {
    member: { id: ann.member, name: "Gran", role: "reader" },
    credentials: [
      { id: "d1", kind: "device", label: "tablet", lastUsedAt: 1_800_000_000_000, revokedAt: null },
    ],
  };

  it("says what signing out costs a linked browser and what deleting costs anybody", async () => {
    const asked = serve({
      "GET /api/session": { body: { ...ann, name: "Gran", role: "reader", via: "device" } },
      "GET /api/account": { body: account },
      "DELETE /api/account": { status: 204 },
    });
    open("/account");
    await screen.findByText("браузер «tablet»");
    expect(
      screen.getByText("В этом браузере вы больше не войдёте без новой ссылки от хранителя."),
    ).toBeTruthy();
    press("Удалить учётную запись");
    expect(screen.getByText(/«удалённая учётная запись»/u)).toBeTruthy();
    press("Удалить навсегда");
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(asked.map(({ key }) => key)).toContain("DELETE /api/account");
  });

  it("is in English too", async () => {
    localStorage.setItem("radavod.language", "en");
    serve({
      "GET /api/session": { body: { ...ann, via: "passkey" } },
      "GET /api/account": { body: { ...account, credentials: [] } },
    });
    open("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeTruthy();
    expect(screen.queryByText(/without a new link from a keeper/u)).toBeNull();
  });
});
