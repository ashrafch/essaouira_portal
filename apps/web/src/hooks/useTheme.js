import { useCallback, useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "essaouira_portal_theme";

function getSystemTheme() {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

export function getInitialTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    // storage unavailable — fall through to system preference
  }
  return getSystemTheme();
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === "dark" ? "dark" : "light";
}

/**
 * Theme state with persistence.
 * The initial value is whatever index.html applied before first paint;
 * toggling persists the explicit choice in localStorage.
 * While no explicit choice is stored, follows the OS preference live.
 */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    const applied = document.documentElement.dataset.theme;
    return applied === "dark" ? "dark" : "light";
  });

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Follow system preference changes as long as the user hasn't chosen.
  useEffect(() => {
    let media;
    try {
      media = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    function onChange(event) {
      let stored = null;
      try {
        stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        // ignore
      }
      if (stored !== "dark" && stored !== "light") {
        setTheme(event.matches ? "dark" : "light");
      }
    }
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore storage failures
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
