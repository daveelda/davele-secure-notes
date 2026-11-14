"use client";

import React, { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";

import { THEME_STORAGE_KEY } from "@/lib/theme";

export type Theme = "light" | "dark" | "system";
const DEFAULT_THEME: Theme = "dark";
const THEME_EVENT = "davele-theme-change";

type ThemeContextType = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME,
  resolvedTheme: "dark",
  setTheme: () => {},
});

function readStoredTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === "light" || saved === "dark" || saved === "system") return saved;
  } catch {
    // Storage unavailable (private mode, blocked site data) — fall back to default.
  }
  return DEFAULT_THEME;
}

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") return systemPrefersDark() ? "dark" : "light";
  return theme;
}

function applyToDocument(theme: Theme, animate: boolean) {
  const root = document.documentElement;
  const isDark = resolve(theme) === "dark";
  if (animate) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 260);
  }
  root.classList.toggle("dark", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
}

// Theme lives in localStorage (an external store) so every consumer stays in
// sync, including across tabs, without hydration mismatches.
function subscribe(callback: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) callback();
  };
  window.addEventListener(THEME_EVENT, callback);
  window.addEventListener("storage", onStorage);
  media.addEventListener("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    window.removeEventListener("storage", onStorage);
    media.removeEventListener("change", callback);
  };
}

function getSnapshot(): string {
  const theme = readStoredTheme();
  return `${theme}:${resolve(theme)}`;
}

function getServerSnapshot(): string {
  return `${DEFAULT_THEME}:dark`;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, resolvedTheme] = snapshot.split(":") as [Theme, "light" | "dark"];

  // Keep <html> in sync with the store (covers system changes and other tabs).
  useEffect(() => {
    applyToDocument(theme, false);
  }, [theme, resolvedTheme]);

  const setTheme = useCallback((newTheme: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Ignore storage failures; the theme still applies for this session.
    }
    applyToDocument(newTheme, true);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const options: { value: Theme; label: string; icon: React.ReactNode }[] = [
    {
      value: "light",
      label: "Light",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
        </svg>
      ),
    },
    {
      value: "dark",
      label: "Dark",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      ),
    },
    {
      value: "system",
      label: "System",
      icon: (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect width="20" height="14" x="2" y="3" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      ),
    },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex items-center gap-0.5 rounded-lg border border-line bg-sunken p-0.5 ${className}`}
    >
      {options.map((o) => {
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${o.label} theme`}
            onClick={() => setTheme(o.value)}
            className={`flex h-7 w-8 items-center justify-center rounded-md transition-all duration-150 ${
              active
                ? "bg-elevated text-accent-text shadow-soft ring-1 ring-line"
                : "text-subtle hover:text-fg"
            }`}
          >
            {o.icon}
            <span className="sr-only">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
