import type { ReactNode } from "react";

/** Drawn signs, for the eye only: the words stand beside them or in the label of the control. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="1.25em"
      height="1.25em"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const SearchIcon = () => (
  <Icon>
    <circle cx="8.8" cy="8.8" r="5.4" />
    <path d="M12.9 12.9 17 17" />
  </Icon>
);

export const ThemeIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="6.6" />
    <path d="M10 3.4a6.6 6.6 0 0 1 0 13.2z" fill="currentColor" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M5 5 15 15M15 5 5 15" />
  </Icon>
);

export const BackIcon = () => (
  <Icon>
    <path d="M12 4.5 6.5 10 12 15.5" />
  </Icon>
);

/** The sign of a union. */
export const UnionIcon = () => (
  <svg width="0.8em" height="0.5em" viewBox="0 0 16 10" aria-hidden="true">
    <g fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="5.4" cy="5" r="4.1" />
      <circle cx="10.6" cy="5" r="4.1" />
    </g>
  </svg>
);
