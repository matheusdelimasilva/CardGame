import "@fontsource/pixelify-sans/600.css";
import "@fontsource/pixelify-sans/700.css";
import "@fontsource/vt323/400.css";
import "./styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
