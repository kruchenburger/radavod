import { Component, createRef, type ReactNode } from "react";

type MovingProps = {
  /** Cards move when it changes. Other changes of the layout, as of the window, happen at once. */
  centre: string;
  className?: string | undefined;
  children: ReactNode;
  /** Brings the new centre into view before anything is seen. */
  onArrive: (root: HTMLElement, isFirst: boolean) => void;
};

const move = { duration: 240, easing: "ease-out" };
const fade = { duration: 120, delay: move.duration, fill: "backwards" as const };

type Places = Map<string, DOMRect>;

/**
 * Takes cards from where they are to where they stand now: elements with `data-key`, matched by it.
 * A new change takes them from the middle of the way. What has `data-late` comes after the movement.
 */
export class Moving extends Component<MovingProps> {
  readonly #root = createRef<HTMLDivElement>();
  #running: Animation[] = [];

  override componentDidMount(): void {
    if (this.#root.current) this.props.onArrive(this.#root.current, true);
  }

  // The only moment when the old places are still on the screen, mid-movement included.
  override getSnapshotBeforeUpdate({ centre }: MovingProps): Places | null {
    return centre === this.props.centre ? null : this.#places();
  }

  override componentDidUpdate(_: MovingProps, __: unknown, before: Places | null): void {
    const root = this.#root.current;
    if (before === null || root === null) return;
    for (const animation of this.#running) animation.cancel();
    this.#running = [];
    this.props.onArrive(root, false);
    if (prefersStill() || root.animate === undefined) return;
    const after = this.#places();
    for (const card of cardsOf(root)) {
      const key = card.dataset["key"] ?? "";
      const [from, to] = [before.get(key), after.get(key)];
      if (from === undefined || to === undefined) {
        this.#running.push(card.animate({ opacity: [0, 1] }, fade));
        continue;
      }
      const [dx, dy] = [from.left - to.left, from.top - to.top];
      if (dx === 0 && dy === 0) continue;
      // Over the place the card already has by its own transform.
      const frames = { translate: [`${dx}px ${dy}px`, "0px 0px"] };
      this.#running.push(card.animate(frames, move));
    }
    for (const late of root.querySelectorAll<HTMLElement>("[data-late]")) {
      this.#running.push(late.animate({ opacity: [0, 1] }, fade));
    }
  }

  override componentWillUnmount(): void {
    for (const animation of this.#running) animation.cancel();
  }

  #places(): Places {
    const root = this.#root.current;
    if (root === null) return new Map();
    return new Map(
      cardsOf(root).map((card) => [card.dataset["key"] ?? "", card.getBoundingClientRect()]),
    );
  }

  override render(): ReactNode {
    return (
      <div ref={this.#root} className={this.props.className}>
        {this.props.children}
      </div>
    );
  }
}

const cardsOf = (root: HTMLElement): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>("[data-key]"),
];

export const prefersStill = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
