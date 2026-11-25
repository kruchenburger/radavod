import "@fontsource-variable/alegreya";
import "@fontsource-variable/alegreya/wght-italic.css";
import "@fontsource/alegreya-sans/400.css";
import "@fontsource/alegreya-sans/500.css";
import "@mantine/core/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";

const root = document.getElementById("root");
if (!root) throw new Error("no-root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
