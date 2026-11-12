import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Strict refresh cookies require the same site as api.ameskinder.com.
if (import.meta.env.PROD && window.location.hostname.endsWith(".vercel.app")) {
  window.location.replace(
    `https://ameskinder.com${window.location.pathname}${window.location.search}${window.location.hash}`,
  );
} else
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
