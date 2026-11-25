import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Asked, listen } from "../../web/tree/map/gestures";

let element: HTMLElement;
let link: HTMLElement;
let stop: () => void;
let asked: { [K in keyof Asked]: ReturnType<typeof vi.fn> };
let pressed: ReturnType<typeof vi.fn<() => void>>;

beforeEach(() => {
  vi.useFakeTimers();
  element = document.createElement("div");
  link = element.appendChild(document.createElement("a"));
  element.setPointerCapture = vi.fn();
  element.hasPointerCapture = () => false;
  pressed = vi.fn<() => void>();
  link.addEventListener("click", pressed);
  asked = { pan: vi.fn(), zoom: vi.fn(), rest: vi.fn(), begin: vi.fn() };
  stop = listen(element, asked as Asked);
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

function finger(type: string, x: number, y: number, id = 1): void {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.assign(event, { pointerId: id, pointerType: "touch" });
  link.dispatchEvent(event);
}

function press(): void {
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }));
}

function wheel(init: WheelEventInit): void {
  element.dispatchEvent(new WheelEvent("wheel", { cancelable: true, bubbles: true, ...init }));
}

describe("a press", () => {
  it("fires, also with an unsteady hand", () => {
    finger("pointerdown", 100, 100);
    finger("pointermove", 103, 102);
    finger("pointerup", 103, 102);
    press();
    expect(pressed).toHaveBeenCalledOnce();
    expect(asked.pan).not.toHaveBeenCalled();
    expect(asked.rest).not.toHaveBeenCalled();
  });

  it("does not fire after a drag, and fires the next time", () => {
    finger("pointerdown", 100, 100);
    finger("pointermove", 140, 100);
    finger("pointerup", 140, 100);
    press();
    expect(pressed).not.toHaveBeenCalled();
    finger("pointerdown", 100, 100);
    finger("pointerup", 100, 100);
    press();
    expect(pressed).toHaveBeenCalledOnce();
  });

  it("of a key fires after a drag too", () => {
    finger("pointerdown", 100, 100);
    finger("pointermove", 140, 100);
    finger("pointerup", 140, 100);
    link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 0 }));
    expect(pressed).toHaveBeenCalledOnce();
  });
});

describe("a drag", () => {
  it("follows the finger all the way", () => {
    finger("pointerdown", 100, 100);
    for (let x = 102; x <= 160; x += 2) finger("pointermove", x, 100 + (x - 100) / 2);
    finger("pointerup", 160, 130);
    const sum = asked.pan.mock.calls.reduce(([x, y], [dx, dy]) => [x + dx, y + dy], [0, 0]);
    expect(sum).toEqual([60, 30]);
    expect(asked.rest).toHaveBeenCalledOnce();
    expect(element.setPointerCapture).toHaveBeenCalled();
  });

  it("is not of a hand that went elsewhere", () => {
    finger("pointermove", 160, 130);
    finger("pointerup", 160, 130);
    expect(asked.pan).not.toHaveBeenCalled();
    expect(asked.rest).not.toHaveBeenCalled();
  });
});

it("two fingers bring the map closer about the middle between them", () => {
  finger("pointerdown", 100, 100, 1);
  finger("pointerdown", 200, 100, 2);
  finger("pointermove", 250, 100, 2);
  expect(asked.zoom).toHaveBeenCalledWith(1.5, 175, 100);
  expect(asked.pan).toHaveBeenCalledWith(25, 0);
  finger("pointerdown", 900, 900, 3);
  finger("pointermove", 950, 900, 3);
  expect(asked.zoom).toHaveBeenCalledOnce();
  finger("pointerup", 250, 100, 2);
  expect(asked.rest).not.toHaveBeenCalled();
  finger("pointerup", 100, 100, 1);
  expect(asked.rest).toHaveBeenCalledOnce();
  press();
  expect(pressed).not.toHaveBeenCalled();
});

describe("a wheel", () => {
  it("of a mouse zooms, and rests when it is still", () => {
    wheel({ deltaY: -100, clientX: 30, clientY: 40 });
    expect(asked.zoom).toHaveBeenCalledWith(expect.closeTo(Math.exp(0.25)), 30, 40);
    vi.advanceTimersByTime(100);
    wheel({ deltaY: -100 });
    vi.advanceTimersByTime(100);
    expect(asked.rest).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(asked.rest).toHaveBeenCalledOnce();
  });

  it("of two fingers on a pad pans, and zooms when they pinch", () => {
    wheel({ deltaX: 12, deltaY: 7.5 });
    expect(asked.pan).toHaveBeenCalledWith(-12, -7.5);
    wheel({ deltaY: 3.25, ctrlKey: true });
    expect(asked.zoom).toHaveBeenCalledOnce();
  });

  it("with Shift goes sideways", () => {
    wheel({ deltaY: 100, shiftKey: true });
    expect(asked.pan).toHaveBeenCalledWith(-100, 0);
  });
});

it("stops when told", () => {
  stop();
  wheel({ deltaY: -100 });
  finger("pointerdown", 100, 100);
  expect(asked.begin).not.toHaveBeenCalled();
});
