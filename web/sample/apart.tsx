import { Fragment, type ReactNode } from "react";
import { dot } from "../tree/layout/around-text";

/**
 * The parts of a line about a person, a dot between them: dates told in words run on into a
 * place or a branch otherwise. The dot is for the eye; a reader hears the parts apart anyway.
 */
export function apart(parts: ReactNode[]): ReactNode[] {
  return parts
    .filter((part) => part !== null && part !== false && part !== undefined)
    .map((part, i) => (
      // The parts of one line never change places, so their order is a key.
      <Fragment key={i}>
        {i > 0 && (
          <>
            {" "}
            <span aria-hidden="true">{dot}</span>{" "}
          </>
        )}
        {part}
      </Fragment>
    ));
}
