import { describe, expect, it } from "vitest";
import { MAX_CHART_PX, MAX_EXPORT_AREA, MAX_EXPORT_SIDE, capChartPx, exportPixelRatio } from "../src/limits";

describe("capChartPx", () => {
  it("keeps sizes the browser can draw and caps the rest", () => {
    expect(capChartPx(640)).toBe(640);
    expect(capChartPx(MAX_CHART_PX)).toBe(MAX_CHART_PX);
    expect(capChartPx(1e9)).toBe(MAX_CHART_PX);
  });
});

describe("exportPixelRatio", () => {
  const bitmap = (size: { width: number; height: number }, ratio: number) => ({
    width: size.width * ratio,
    height: size.height * ratio,
  });

  it("keeps the requested scale for an ordinary chart", () => {
    expect(exportPixelRatio({ width: 800, height: 400 }, 3)).toBe(3);
  });

  it("lowers the scale so neither side of the image passes the limit", () => {
    const ratio = exportPixelRatio({ width: MAX_CHART_PX, height: 300 }, 4);
    expect(bitmap({ width: MAX_CHART_PX, height: 300 }, ratio).width).toBeLessThanOrEqual(MAX_EXPORT_SIDE);
    expect(ratio).toBeGreaterThan(1);
  });

  it("lowers the scale so the image's area stays within what phones can allocate", () => {
    const size = { width: MAX_CHART_PX, height: MAX_CHART_PX };
    const { width, height } = bitmap(size, exportPixelRatio(size, 4));
    expect(width * height).toBeLessThanOrEqual(MAX_EXPORT_AREA);
  });

  it("never returns a ratio that is not a positive number", () => {
    for (const size of [{ width: 0, height: 0 }, { width: NaN, height: 10 }, { width: 1e9, height: 1e9 }]) {
      const ratio = exportPixelRatio(size, 4);
      expect(Number.isFinite(ratio) && ratio > 0).toBe(true);
    }
  });
});
