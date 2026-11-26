import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  nickname: null,
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
  // What the server says of a link: a join link without a name or a nickname is an old one.
  const invitation = (body: object) => ({
    "POST /api/invitation": { body: { name: null, nickname: null, nameOptional: false, ...body } },
  });

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
      ...invitation({ kind: "join", role: "reader", family: "Oaks", canLink: true }),
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
    serve(invitation({ kind: "join", role: "editor", family: "Oaks", canLink: false }));
    open("/join", `#${secret}`);
    await screen.findByText("Вас приглашают редактором.");
    expect(screen.queryByRole("button", { name: "Привязать этот браузер" })).toBeNull();
  });

  it("brings an account back without asking a name", async () => {
    const asked = serve({
      ...invitation({
        kind: "recovery",
        role: "editor",
        family: "Oaks",
        canLink: false,
        nameOptional: true,
      }),
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

  it("puts the name the keeper wrote in the field, and sends the one written", async () => {
    const asked = serve({
      ...invitation({
        kind: "join",
        role: "editor",
        family: "Oaks",
        canLink: false,
        name: "Dina",
        nickname: null,
        nameOptional: true,
      }),
      "POST /api/passkey/register/options": { body: { flow: "f", options: {} } },
      "POST /api/passkey/register/verify": { body: ann },
      "GET /api/members": { body: { members: [] } },
    });
    open("/join", `#${secret}`);
    const name = await screen.findByRole("textbox", { name: /Ваше имя/u });
    expect((name as HTMLInputElement).value).toBe("Dina");
    expect(
      screen.getByText("Это имя написал тот, кто вас пригласил. Его можно изменить."),
    ).toBeTruthy();
    fireEvent.blur(name);
    expect(screen.queryByText("Напишите ваше имя.")).toBeNull();
    // Emptied, the field says what stays; written again, who wrote the name.
    type(/Ваше имя/u, " ");
    expect(screen.getByText("Если оставить поле пустым, останется «Dina».")).toBeTruthy();
    expect(
      screen.queryByText("Это имя написал тот, кто вас пригласил. Его можно изменить."),
    ).toBeNull();
    type(/Ваше имя/u, "Dina Oak");
    expect(
      screen.getByText("Это имя написал тот, кто вас пригласил. Его можно изменить."),
    ).toBeTruthy();
    press("Создать ключ доступа");
    await waitFor(() => expect(window.location.pathname).toBe("/family"));
    expect(asked.find(({ key }) => key === "POST /api/passkey/register/options")?.body).toEqual({
      secret,
      name: "Dina Oak",
    });
  });

  it("asks a name of an old link that has neither a name nor a nickname", async () => {
    serve(invitation({ kind: "join", role: "editor", family: "Oaks", canLink: false }));
    open("/join", `#${secret}`);
    const button = await screen.findByRole("button", { name: "Создать ключ доступа" });
    expect(button).toHaveProperty("disabled", true);
    type(/Ваше имя/u, "Dina");
    expect(button).toHaveProperty("disabled", false);
  });

  it("says which nickname waits for whom writes no name, and lets them leave it empty", async () => {
    const asked = serve({
      ...invitation({
        kind: "join",
        role: "editor",
        family: "Oaks",
        canLink: false,
        name: null,
        nickname: { adjective: "rabid", creature: "owl" },
        nameOptional: true,
      }),
      "POST /api/passkey/register/options": { body: { flow: "f", options: {} } },
      "POST /api/passkey/register/verify": { body: ann },
      "GET /api/members": { body: { members: [] } },
    });
    open("/join", `#${secret}`);
    expect(
      await screen.findByText(
        "Если оставить поле пустым, родные увидят вас как «Бешеная Сова». Имя можно написать позже в учётной записи.",
      ),
    ).toBeTruthy();
    fireEvent.blur(field(/Ваше имя/u));
    expect(screen.queryByText("Напишите ваше имя.")).toBeNull();
    press("Создать ключ доступа");
    await waitFor(() => expect(window.location.pathname).toBe("/family"));
    expect(asked.find(({ key }) => key === "POST /api/passkey/register/options")?.body).toEqual({
      secret,
    });
  });

  it("in a messenger, sends to a real browser and keeps the reader's other way in", async () => {
    webauthn.supports = false;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 Telegram-Android/11");
    const asked = serve(
      invitation({ kind: "join", role: "reader", family: "Oaks", canLink: true }),
    );
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

describe("a messenger's own browser", () => {
  it("is sent to a real one even when it says it can make passkeys, and shows the link when it cannot copy", async () => {
    webauthn.supports = true;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 WhatsApp/2.24");
    vi.stubGlobal(
      "navigator",
      Object.assign(Object.create(navigator), {
        clipboard: { writeText: () => Promise.reject(new Error("closed")) },
      }),
    );
    serve({
      "POST /api/invitation": {
        body: {
          kind: "join",
          role: "editor",
          family: "Oaks",
          canLink: false,
          name: null,
          nickname: null,
          nameOptional: false,
        },
      },
    });
    open("/join", `#${secret}`);
    await screen.findByText(/Внутри мессенджера ключ доступа не создать/u);
    expect(screen.queryByRole("button", { name: "Создать ключ доступа" })).toBeNull();
    press("Скопировать ссылку");
    const field = await screen.findByRole("textbox", { name: "Ссылка" });
    expect((field as HTMLInputElement).value).toContain(`/join#${secret}`);
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
        nickname: null,
        role: "keeper",
        version: 1,
        revokedAt: null,
        credentials: [
          {
            id: "p1",
            member: ann.member,
            kind: "passkey",
            label: "phone",
            createdAt: 1_800_000_000_000,
            lastUsedAt: 1_800_000_000_000,
            revokedAt: null,
          },
        ],
      },
      {
        id: "member_Gran111111111111111111",
        name: "Gran",
        nickname: null,
        role: "reader",
        version: 1,
        revokedAt: null,
        credentials: [
          {
            id: "d1",
            member: ann.member,
            createdAt: 1_800_000_000_000,
            kind: "device",
            label: "",
            lastUsedAt: 1_800_000_000_000,
            revokedAt: null,
          },
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
          .some(({ textContent }) => textContent?.endsWith("Вход: Ann, страна неизвестна")),
      ).toBe(true),
    );
    press("Создать приглашение");
    const link = await screen.findByRole("textbox", { name: "Ссылка" });
    expect((link as HTMLInputElement).value).toBe(`${window.location.origin}/join#${secret}`);
    expect(screen.getByText(/Больше она не появится, скопируйте её сейчас\./u)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Отключить вход" })[1] as HTMLElement);
    expect(
      await screen.findByText(
        "Gran больше не сможет войти. Журнал правок сохранит всё, что было сделано.",
      ),
    ).toBeTruthy();
  });

  it("invite one person by the name a keeper writes, or by a nickname when it is empty", async () => {
    const asked = serve({
      "GET /api/session": { body: ann },
      "GET /api/members": { body: roster },
      "GET /api/members/log": { body: { log: [] } },
      "POST /api/members/invitations": {
        status: 201,
        body: { id: "i", secret, expiresAt: 1_800_000_000_000 },
      },
    });
    open("/family");
    expect(await screen.findByText("Каждому родственнику нужна своя ссылка.")).toBeTruthy();
    expect(
      screen.getByText(
        "Можно не писать: тогда родственник получит шуточное имя и сможет написать своё.",
      ),
    ).toBeTruthy();
    press("Создать приглашение");
    await screen.findByRole("textbox", { name: "Ссылка" });
    type(/Кого вы приглашаете/u, "  Dina ");
    press("Создать приглашение");
    await waitFor(() =>
      expect(asked.filter(({ key }) => key === "POST /api/members/invitations")).toHaveLength(2),
    );
    const sent = asked.filter(({ key }) => key === "POST /api/members/invitations");
    expect(sent.map(({ body }) => body)).toEqual([
      { role: "reader", person: null },
      { role: "reader", person: null, name: "Dina" },
    ]);
  });

  it("call a member and a link by their nickname as by a name, and say what withdrawing costs", async () => {
    const dino = "member_Dino111111111111111111";
    const asked = serve({
      "GET /api/session": { body: ann },
      "GET /api/members": {
        body: {
          members: [
            ...roster.members,
            {
              id: dino,
              name: "",
              nickname: { adjective: "rabid", creature: "owl" },
              role: "reader",
              version: 1,
              revokedAt: null,
              credentials: [],
            },
          ],
          invitations: [
            {
              id: "i1",
              role: "reader",
              person: null,
              by: ann.member,
              expiresAt: 1_800_000_000_000,
              spentAt: null,
              kind: "join",
              member: null,
              name: null,
              nickname: { adjective: "brave", creature: "hedgehog" },
            },
          ],
        },
      },
      "GET /api/members/log": {
        body: {
          log: [
            {
              at: 1_800_000_000_000,
              kind: "sign-in",
              member: dino,
              credential: "d2",
              by: null,
              country: null,
            },
          ],
        },
      },
      "DELETE /api/members/invitations/i1": { status: 204 },
    });
    open("/family");
    expect(await screen.findByText("Бешеная Сова")).toBeTruthy();
    const lines = () => screen.getAllByRole("listitem").map(({ textContent }) => textContent ?? "");
    expect(lines().some((text) => text.startsWith("Храбрый Ёж: читатель, действует до"))).toBe(
      true,
    );
    await waitFor(() =>
      expect(lines().some((text) => text.endsWith("Вход: Бешеная Сова, страна неизвестна"))).toBe(
        true,
      ),
    );
    press("Отозвать");
    expect(screen.getByText("По этой ссылке больше нельзя будет войти.")).toBeTruthy();
    const confirm = screen.getByRole("group", { name: "Отозвать" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Отозвать" }));
    expect(await screen.findByText("Приглашение отозвано")).toBeTruthy();
    expect(asked.map(({ key }) => key)).toContain("DELETE /api/members/invitations/i1");
  });

  it("call a link with neither a name nor a nickname by its role alone", async () => {
    const link = {
      role: "reader",
      person: null,
      by: ann.member,
      expiresAt: 1_800_000_000_000,
      kind: "join",
      member: null,
      // An old link, or one whose name went with the person it was for.
      name: null,
      nickname: null,
    };
    serve({
      "GET /api/session": { body: ann },
      "GET /api/members": {
        body: {
          members: roster.members,
          invitations: [
            { ...link, id: "i1", spentAt: null },
            { ...link, id: "i2", spentAt: 1_700_000_000_000 },
          ],
        },
      },
      "GET /api/members/log": { body: { log: [] } },
    });
    open("/family");
    await screen.findByText("Gran");
    const lines = screen.getAllByRole("listitem").map(({ textContent }) => textContent ?? "");
    expect(lines.some((text) => text.startsWith("читатель, действует до"))).toBe(true);
    expect(lines.some((text) => text.startsWith("читатель, ссылка использована"))).toBe(true);
    expect(lines.some((text) => text.startsWith(":"))).toBe(false);
  });

  it("show only names and roles to a reader", async () => {
    serve({
      "GET /api/session": { body: { ...ann, role: "reader" } },
      "GET /api/members": {
        body: { members: [{ id: ann.member, name: "Ann", nickname: null, role: "keeper" }] },
      },
    });
    open("/family");
    await screen.findByText("Ann");
    expect(screen.queryByText("Пригласить")).toBeNull();
    expect(screen.queryByRole("button", { name: "Отключить вход" })).toBeNull();
  });
});

describe("one's own account", () => {
  const account = {
    canAddPasskey: false,
    member: {
      id: ann.member,
      name: "Gran",
      nickname: null,
      role: "reader",
      person: null,
      createdAt: 1_800_000_000_000,
      revokedAt: null,
    },
    credentials: [
      {
        id: "d1",
        member: ann.member,
        createdAt: 1_800_000_000_000,
        kind: "device",
        label: "tablet",
        lastUsedAt: 1_800_000_000_000,
        revokedAt: null,
      },
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
    // Signing out of a linked browser is asked once more, with its cost.
    press("Выйти");
    expect(
      screen.getByText("В этом браузере вы больше не войдёте без новой ссылки от хранителя."),
    ).toBeTruthy();
    press("Отмена");
    press("Удалить учётную запись");
    expect(screen.getByText(/«удалённая учётная запись»/u)).toBeTruthy();
    press("Удалить навсегда");
    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(asked.map(({ key }) => key)).toContain("DELETE /api/account");
  });

  it("stays signed in when signing out did not reach the server, and says so", async () => {
    serve({
      "GET /api/session": { body: ann },
      "GET /api/account": { body: { ...account, canAddPasskey: true } },
    });
    open("/account");
    press(await screen.findByRole("button", { name: "Выйти" }).then(() => "Выйти"));
    expect((await alert()).textContent).toBe("Сервер не ответил. Проверьте интернет и повторите.");
    expect(window.location.pathname).toBe("/account");
  });

  it("asks a member called by a nickname to write a name, and calls them by it", async () => {
    const nickname = { adjective: "rabid", creature: "owl" };
    const asked = serve({
      "GET /api/session": { body: { ...ann, name: "", nickname, role: "reader" } },
      "GET /api/account": {
        body: { ...account, member: { ...account.member, name: "", nickname } },
      },
      "POST /api/account/name": { status: 204 },
    });
    open("/account");
    expect(await screen.findByText("Бешеная Сова")).toBeTruthy();
    expect(screen.getByText("Это шуточное имя. Напишите настоящее.")).toBeTruthy();
    const save = screen.getByRole("button", { name: "Сохранить имя" });
    expect(save).toHaveProperty("disabled", true);
    type(/Ваше имя/u, " Dina ");
    press("Сохранить имя");
    expect(await screen.findByText("Теперь ваше имя: Dina")).toBeTruthy();
    expect(asked.find(({ key }) => key === "POST /api/account/name")?.body).toEqual({
      name: "Dina",
    });
    // What the page knows of the member is asked again.
    await waitFor(() => {
      const keys = asked.map(({ key }) => key);
      expect(keys.filter((key) => key === "GET /api/account").length).toBeGreaterThan(1);
      expect(keys.filter((key) => key === "GET /api/session").length).toBeGreaterThan(1);
    });
  });

  it("is in English too", async () => {
    localStorage.setItem("radavod.language", "en");
    serve({
      "GET /api/session": { body: { ...ann, via: "passkey" } },
      "GET /api/account": { body: { ...account, credentials: [], canAddPasskey: true } },
    });
    open("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeTruthy();
    expect(screen.queryByText(/without a new link from a keeper/u)).toBeNull();
  });
});
