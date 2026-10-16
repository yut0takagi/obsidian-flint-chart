import { describe, expect, it } from "vitest";
import { chartTypes } from "../src/chart/templates";
import { recommendCharts, resolveChartType } from "../src/chart/recommend";

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

describe("recommendCharts", () => {
  it("suggests several chart types, each with columns bound to channels", () => {
    const suggestions = recommendCharts(
      [
        { quarter: "Q1", revenue: 1200, region: "East" },
        { quarter: "Q2", revenue: 1580, region: "East" },
        { quarter: "Q1", revenue: 800, region: "West" },
      ],
      { quarter: "Quarter", revenue: "Price", region: "Category" },
      3,
    );
    expect(suggestions.length).toBeGreaterThan(1);
    expect(suggestions.length).toBeLessThanOrEqual(3);
    for (const suggestion of suggestions) {
      expect(chartTypes).toContain(suggestion.chartType);
      expect(Object.keys(suggestion.encodings).length).toBeGreaterThan(0);
      for (const column of Object.values(suggestion.encodings)) {
        expect(["quarter", "revenue", "region"]).toContain(column);
      }
    }
  });

  it("returns nothing for no rows, and never throws on odd data", () => {
    expect(recommendCharts([], {}, 4)).toEqual([]);
    expect(() => recommendCharts([{ a: null }], { a: { semanticType: "Unknown" } }, 4)).not.toThrow();
  });
});
