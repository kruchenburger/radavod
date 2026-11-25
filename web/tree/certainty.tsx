import type { Certainty } from "../../src/shared/tree";
import { useLanguage } from "../app/language";
import classes from "./certainty.module.css";

const shapes: Record<Certainty, React.ReactNode> = {
  confirmed: <circle cx="7" cy="7" r="5" fill="currentColor" />,
  "one-source": (
    <>
      <circle cx="7" cy="7" r="5" />
      <path d="M7 2a5 5 0 0 1 0 10z" fill="currentColor" />
    </>
  ),
  hypothesis: <circle cx="7" cy="7" r="5" strokeDasharray="2.2 1.8" />,
  contradiction: (
    <path d="M6 2a5 5 0 0 0 0 10zM8 2a5 5 0 0 1 0 10z" fill="currentColor" stroke="none" />
  ),
  unresolved: (
    <>
      <circle cx="7" cy="7" r="5" />
      <path d="M4.5 7h5" />
    </>
  ),
};

/** How well a fact is known: a shape and a word. */
export function CertaintyMark({ of }: { of: Certainty }) {
  const { t } = useLanguage();
  return (
    <span className={classes.mark} data-certainty={of}>
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        aria-hidden="true"
      >
        {shapes[of]}
      </svg>
      {t(`certainty.${of}`)}
    </span>
  );
}
