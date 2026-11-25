/** What fingers, a mouse and a wheel ask of the map, in pixels from the corner of the element. */
export type Asked = {
  pan: (dx: number, dy: number) => void;
  zoom: (factor: number, px: number, py: number) => void;
  /** A gesture is over, or a wheel has been still for a moment. */
  rest: (px: number, py: number) => void;
  /** The first thing of a gesture: whatever moves on its own has to stop. */
  begin: () => void;
};

/** Less than this is a press with an unsteady hand. */
const slack = 6;
const wheelRest = 180;

/** Listens until the returned function is called. A press after a drag does not fire. */
export function listen(element: HTMLElement, asked: Asked): () => void {
  const fingers = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null;
  let isDragging = false;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;

  const placeOf = (event: MouseEvent): { x: number; y: number } => {
    const { left, top } = element.getBoundingClientRect();
    return { x: event.clientX - left, y: event.clientY - top };
  };
  const middle = (): { x: number; y: number; spread: number } => {
    const all = [...fingers.values()];
    const x = all.reduce((sum, finger) => sum + finger.x, 0) / all.length;
    const y = all.reduce((sum, finger) => sum + finger.y, 0) / all.length;
    const [a, b] = all;
    const spread = a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
    return { x, y, spread };
  };

  const onDown = (event: PointerEvent): void => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (fingers.size === 0) {
      isDragging = false;
      start = placeOf(event);
      asked.begin();
    }
    if (fingers.size < 2) fingers.set(event.pointerId, placeOf(event));
    if (fingers.size === 2) isDragging = true;
  };
  const onMove = (event: PointerEvent): void => {
    if (!fingers.has(event.pointerId)) return;
    const before = middle();
    fingers.set(event.pointerId, placeOf(event));
    const now = middle();
    if (!isDragging) {
      if (start === null || Math.hypot(now.x - start.x, now.y - start.y) < slack) {
        // The way so far is not lost: it is made up for when the drag begins.
        fingers.set(event.pointerId, { x: before.x, y: before.y });
        return;
      }
      isDragging = true;
    }
    // Only now: a captured pointer would take the press away from the link under it.
    if (!element.hasPointerCapture(event.pointerId)) element.setPointerCapture(event.pointerId);
    asked.pan(now.x - before.x, now.y - before.y);
    if (before.spread > 0 && now.spread > 0) asked.zoom(now.spread / before.spread, now.x, now.y);
  };
  const onUp = (event: PointerEvent): void => {
    if (!fingers.delete(event.pointerId)) return;
    if (fingers.size === 0 && isDragging) {
      const { x, y } = placeOf(event);
      asked.rest(x, y);
    }
  };
  const onClick = (event: MouseEvent): void => {
    // A press of a key is a click without a place.
    if (!isDragging || event.detail === 0) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    asked.begin();
    const { x, y } = placeOf(event);
    if (event.ctrlKey || isMouseWheel(event)) {
      const delta =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE ? event.deltaY * 33 : event.deltaY;
      const most = event.ctrlKey && !isMouseWheel(event) ? 40 : 120;
      asked.zoom(
        Math.exp(-Math.max(-most, Math.min(most, delta)) / (event.ctrlKey ? 100 : 400)),
        x,
        y,
      );
    } else if (event.shiftKey && event.deltaX === 0) asked.pan(-event.deltaY, 0);
    else asked.pan(-event.deltaX, -event.deltaY);
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => asked.rest(x, y), wheelRest);
  };
  const onDragStart = (event: Event): void => event.preventDefault();

  element.addEventListener("pointerdown", onDown);
  element.addEventListener("pointermove", onMove);
  element.addEventListener("pointerup", onUp);
  element.addEventListener("pointercancel", onUp);
  // A press that slips off the map without a drag. A captured pointer does not leave.
  element.addEventListener("pointerleave", onUp);
  element.addEventListener("click", onClick, { capture: true });
  element.addEventListener("wheel", onWheel, { passive: false });
  element.addEventListener("dragstart", onDragStart);
  return () => {
    clearTimeout(wheelTimer);
    element.removeEventListener("pointerdown", onDown);
    element.removeEventListener("pointermove", onMove);
    element.removeEventListener("pointerup", onUp);
    element.removeEventListener("pointercancel", onUp);
    element.removeEventListener("pointerleave", onUp);
    element.removeEventListener("click", onClick, { capture: true });
    element.removeEventListener("wheel", onWheel);
    element.removeEventListener("dragstart", onDragStart);
  };
}

/** A wheel goes by notches and straight; two fingers on a pad go as they like and scroll. */
function isMouseWheel({ deltaMode, deltaX, deltaY, shiftKey }: WheelEvent): boolean {
  if (shiftKey) return false;
  if (deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return true;
  return deltaX === 0 && Math.abs(deltaY) >= 50 && Number.isInteger(deltaY);
}
