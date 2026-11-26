import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { parseSamplePath } from "../../src/shared/sample-path";
import { sessionQuery } from "../access/session";
import { useState } from "react";
import { Home } from "./home";
import { LanguageProvider } from "./language";
import { Pages } from "./pages";
import { useAddress, useBackKey } from "./router";
import { colorSchemeManager, cssVariables, theme } from "./theme";

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  useBackKey();
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariables}
      colorSchemeManager={colorSchemeManager}
      // The browser's theme until the visitor picks one, as with the language.
      defaultColorScheme="auto"
    >
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <Screen />
        </LanguageProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}

function Screen() {
  const { path, search } = useAddress();
  // Whenever the app opens it asks who is signed in: that also gives the cookie again. The
  // example is open to anybody and asks nobody.
  useQuery({ ...sessionQuery, enabled: parseSamplePath(path) === null });
  return path === "/" ? <Home /> : <Pages path={path} search={search} />;
}
