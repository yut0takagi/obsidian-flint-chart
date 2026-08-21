import { describe, expect, it } from "vitest";
import { chartTypes } from "../src/chart/templates";
import { resolveChartType } from "../src/chart/recommend";

const rows = [
  { quarter: "Q1", revenue: 1200 },
  { quarter: "Q2", revenue: 1580 },
  { quarter: "Q3", revenue: 990 },
];
const types = { quarter: "Quarter", revenue: "Price" };

describe("resolveChartType", () => {
  it("keeps an explicit chart type as-is", () => {
    expect(resolveChartType("Sankey Diagram", rows, types)).toEqual({
      chartType: "Sankey Diagram", recommended: false,
    });
  });

  it("recommends a supported chart type when none was given", () => {
    const result = resolveChartType(undefined, rows, types);
    expect(result.recommended).toBe(true);
    expect(chartTypes).toContain(result.chartType);
  });

  it("returns undefined when there is nothing to recommend from", () => {
    expect(resolveChartType(undefined, [], {}).chartType).toBeUndefined();
  });

  it("never throws on odd data", () => {
    expect(() => resolveChartType(undefined, [{ a: null }], { a: "Unknown" })).not.toThrow();
  });
});
