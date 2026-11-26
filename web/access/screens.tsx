import type { AccessPage } from "../../src/shared/access";
import { Account } from "./account";
import { Join, Setup, SignIn } from "./entry";
import { Members } from "./members";

/** The pages of signing in and of the members, by their addresses. */
export function AccessScreen({ path }: { path: AccessPage }) {
  switch (path) {
    case "/setup":
      return <Setup />;
    case "/join":
      return <Join />;
    case "/sign-in":
      return <SignIn />;
    case "/family":
      return <Members />;
    case "/account":
      return <Account />;
  }
}
