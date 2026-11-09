import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { startRum } from "./telemetry";
import "./styles.css";

startRum();
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
