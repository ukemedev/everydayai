import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import "./index.css";

window.addEventListener("error", (event) => {
  fetch("/api/devbot/capture-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageUrl: window.location.href,
      errorMessage: event.message,
      errorStack: event.error?.stack,
      component: "window.onerror",
      severity: "error",
    }),
  }).catch(() => {});
});

window.addEventListener("unhandledrejection", (event) => {
  fetch("/api/devbot/capture-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pageUrl: window.location.href,
      errorMessage: (event.reason as Error)?.message ?? String(event.reason),
      errorStack: (event.reason as Error)?.stack,
      component: "unhandledRejection",
      severity: "error",
    }),
  }).catch(() => {});
});

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <AuthProvider>
      <App />
    </AuthProvider>
  </ErrorBoundary>
);
