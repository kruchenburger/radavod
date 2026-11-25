import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { Home } from "./home";
import { LanguageProvider } from "./language";
import { colorSchemeManager, cssVariables, theme } from "./theme";

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariables}
      colorSchemeManager={colorSchemeManager}
      defaultColorScheme="light"
    >
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <Home />
        </LanguageProvider>
      </QueryClientProvider>
    </MantineProvider>
  );
}
