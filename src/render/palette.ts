import type { ChartPalette } from "../chart/applyObsidianTheme";

/**
 * Reads the live Obsidian theme instead of branching on light/dark, so any
 * community theme the reader has installed is honoured.
 */
/** Obsidian's default light ink. Also what a chart is re-inked with for a white PNG. */
export const LIGHT_PALETTE: ChartPalette = {
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
    text: read("--text-normal", LIGHT_PALETTE.text),
    muted: read("--text-muted", LIGHT_PALETTE.muted),
    border: read("--background-modifier-border", LIGHT_PALETTE.border),
    grid: read("--background-modifier-border", LIGHT_PALETTE.grid),
    surface: read("--background-secondary", LIGHT_PALETTE.surface),
    fontFamily: read("--font-interface", LIGHT_PALETTE.fontFamily),
  };
}

/** The note's own background, painted behind a PNG exported with the theme. */
export function readBackground(element: HTMLElement): string {
  const value = getComputedStyle(element).getPropertyValue("--background-primary").trim();
  return value === "" ? "#ffffff" : value;
}
