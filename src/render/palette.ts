import type { ChartPalette } from "../chart/applyObsidianTheme";

/**
 * Reads the live Obsidian theme instead of branching on light/dark, so any
 * community theme the reader has installed is honoured.
 */
const FALLBACK: ChartPalette = {
  text: "#2e3338",
  muted: "#6e7079",
  border: "#dcddde",
  grid: "#e9e9e9",
  surface: "#ffffff",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

export function readPalette(element: HTMLElement): ChartPalette {
  const style = getComputedStyle(element);
  const read = (name: string, fallback: string): string => {
    const value = style.getPropertyValue(name).trim();
    return value === "" ? fallback : value;
  };
  return {
    text: read("--text-normal", FALLBACK.text),
    muted: read("--text-muted", FALLBACK.muted),
    border: read("--background-modifier-border", FALLBACK.border),
    grid: read("--background-modifier-border", FALLBACK.grid),
    surface: read("--background-secondary", FALLBACK.surface),
    fontFamily: read("--font-interface", FALLBACK.fontFamily),
  };
}
