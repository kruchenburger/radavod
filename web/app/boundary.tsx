import { Component, type ReactNode } from "react";

type BoundaryProps = { children: ReactNode; fallback: ReactNode };

/** Says it in words when a screen breaks or its code does not come. React has no hook for it. */
export class Boundary extends Component<BoundaryProps, { isBroken: boolean }> {
  override state = { isBroken: false };

  static getDerivedStateFromError(): { isBroken: boolean } {
    return { isBroken: true };
  }

  override render(): ReactNode {
    return this.state.isBroken ? this.props.fallback : this.props.children;
  }
}
