import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { go, useBackKey } from "../../web/app/router";

function Keys() {
  useBackKey();
  return (
    <>
      <input aria-label="field" />
      <textarea aria-label="text" />
      <select aria-label="choice" />
      <div contentEditable suppressContentEditableWarning>
        <span>editable</span>
      </div>
      <button type="button">plain</button>
    </>
  );
}

const backspace = (target: Element | Document = document.body, more = {}) =>
  fireEvent.keyDown(target, { key: "Backspace", ...more });
const path = () => window.location.pathname;

beforeEach(() => {
  // A visit starts here, with no step of the app behind it.
  window.history.replaceState(null, "", "/sample");
});

it("goes one step back inside the app", async () => {
  render(<Keys />);
  go("/sample/tree/a");
  go("/sample/tree/b");
  expect(backspace()).toBe(false);
  await waitFor(() => expect(path()).toBe("/sample/tree/a"));
  expect(backspace()).toBe(false);
  await waitFor(() => expect(path()).toBe("/sample"));
});

it("never leaves the site from the first page of a visit", async () => {
  render(<Keys />);
  expect(backspace()).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(path()).toBe("/sample");
});

it("keeps the steps when a place is replaced", async () => {
  render(<Keys />);
  go("/sample/tree/a");
  go("/sample/tree/a?siblings=open", "replace");
  expect(backspace()).toBe(false);
  await waitFor(() => expect(path()).toBe("/sample"));
});

it.each(["field", "text", "choice"])("leaves the key to whoever types in a %s", (name) => {
  const { getByLabelText } = render(<Keys />);
  go("/sample/tree/a");
  expect(backspace(getByLabelText(name))).toBe(true);
  expect(path()).toBe("/sample/tree/a");
});

it("leaves the key to editable text", () => {
  const { getByText } = render(<Keys />);
  go("/sample/tree/a");
  expect(backspace(getByText("editable"))).toBe(true);
  expect(path()).toBe("/sample/tree/a");
});

it.each([
  ["Ctrl", { ctrlKey: true }],
  ["Alt", { altKey: true }],
  ["Meta", { metaKey: true }],
  ["Shift", { shiftKey: true }],
  ["a composition", { isComposing: true }],
])("does nothing with %s", (_, more) => {
  const { getByText } = render(<Keys />);
  go("/sample/tree/a");
  expect(backspace(getByText("plain"), more)).toBe(true);
  expect(path()).toBe("/sample/tree/a");
});

it("does nothing when a screen took the key already", async () => {
  const { getByText } = render(<Keys />);
  go("/sample/tree/a");
  const button = getByText("plain");
  button.addEventListener("keydown", (event) => event.preventDefault());
  backspace(button);
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(path()).toBe("/sample/tree/a");
});
