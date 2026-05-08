import { useEffect, useState } from "react";

export const darkColors = {
  bgPage: "#0a0f1e",
  bgSidebar: "#0d1117",
  bgCard: "#111827",
  bgInput: "#0a0f1e",
  bgHeader: "#0d1117",
  text: "#ffffff",
  textMuted: "rgba(255,255,255,0.55)",
  textFaint: "rgba(255,255,255,0.35)",
  textVeryFaint: "rgba(255,255,255,0.20)",
  border: "rgba(255,255,255,0.08)",
  borderDim: "rgba(255,255,255,0.05)",
  borderSubtle: "rgba(255,255,255,0.10)",
  navActive: "rgba(59,91,252,0.15)",
  navActiveText: "#3b5bfc",
} as const;

export const lightColors = {
  bgPage: "#f8fafc",
  bgSidebar: "#f1f5f9",
  bgCard: "#ffffff",
  bgInput: "#ffffff",
  bgHeader: "#f1f5f9",
  text: "#0f172a",
  textMuted: "#64748b",
  textFaint: "#94a3b8",
  textVeryFaint: "#cbd5e1",
  border: "#e2e8f0",
  borderDim: "#e2e8f0",
  borderSubtle: "#d1d5db",
  navActive: "rgba(59,91,252,0.10)",
  navActiveText: "#3b5bfc",
} as const;

export type ThemeColors = typeof darkColors | typeof lightColors;

function applyThemeToDom(isDark: boolean) {
  const r = document.documentElement;
  r.classList.toggle("light", !isDark);
  r.style.colorScheme = isDark ? "dark" : "light";
  r.style.setProperty("--theme-bg-page",       isDark ? "#0a0f1e" : "#f8fafc");
  r.style.setProperty("--theme-bg-header",      isDark ? "#0d1117" : "#f1f5f9");
  r.style.setProperty("--theme-bg-card",        isDark ? "#111827" : "#ffffff");
  r.style.setProperty("--theme-bg-input",       isDark ? "#0a0f1e" : "#ffffff");
  r.style.setProperty("--theme-bg-bubble",      isDark ? "#1a2235" : "#e8edf5");
  r.style.setProperty("--theme-text-1",         isDark ? "#ffffff"               : "#0f172a");
  r.style.setProperty("--theme-text",           isDark ? "rgba(255,255,255,0.85)": "#1e293b");
  r.style.setProperty("--theme-text-muted",     isDark ? "rgba(255,255,255,0.55)": "#64748b");
  r.style.setProperty("--theme-text-faint",     isDark ? "rgba(255,255,255,0.35)": "#94a3b8");
  r.style.setProperty("--theme-text-vfaint",    isDark ? "rgba(255,255,255,0.20)": "#cbd5e1");
  r.style.setProperty("--theme-border",         isDark ? "rgba(255,255,255,0.08)": "#e2e8f0");
  r.style.setProperty("--theme-border-dim",     isDark ? "rgba(255,255,255,0.05)": "#f1f5f9");
  r.style.setProperty("--theme-border-sub",     isDark ? "rgba(255,255,255,0.10)": "#d1d5db");
}

export function useTheme() {
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      return localStorage.getItem("everydayai-theme") !== "light";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    applyThemeToDom(isDark);
    try { localStorage.setItem("everydayai-theme", isDark ? "dark" : "light"); } catch {}
  }, [isDark]);

  function toggle() { setIsDark((v) => !v); }

  const colors = isDark ? darkColors : lightColors;

  return { isDark, toggle, colors };
}
