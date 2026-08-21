import { describe, expect, it } from "vitest";
import { allChannels, chartTypes, channelsFor, registry } from "../src/chart/templates";

describe("templates — derived from Flint's ECharts registry", () => {
  it("exposes every chart type the backend supports", () => {
    expect(chartTypes).toContain("Bar Chart");
    expect(chartTypes).toContain("Sankey Diagram");
    expect(chartTypes).toContain("Calendar Heatmap");
    expect(chartTypes.length).toBeGreaterThanOrEqual(30);
  });

  it("exposes the union of encoding channels", () => {
    for (const channel of ["x", "y", "color", "size", "column", "row", "detail", "group"]) {
      expect(allChannels.has(channel)).toBe(true);
    }
    expect(allChannels.has("nope")).toBe(false);
  });

  it("reports the channels a single chart type accepts", () => {
    expect(channelsFor("Gauge Chart")).toEqual(["size", "column"]);
    expect(channelsFor("Bar Chart")).toContain("x");
  });

  it("returns undefined for an unknown chart type", () => {
    expect(channelsFor("Nope Chart")).toBeUndefined();
  });

  it("is sorted so error messages stay stable", () => {
    expect([...chartTypes]).toEqual([...chartTypes].sort());
  });

  it("satisfies the shape normalizeBlock expects", () => {
    expect(registry.chartTypes).toBe(chartTypes);
    expect(registry.allChannels).toBe(allChannels);
    expect(registry.channelsFor("Bar Chart")).toEqual(channelsFor("Bar Chart"));
  });
});
