import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
  return path === "/" ? <Home /> : <Pages path={path} search={search} />;
}
