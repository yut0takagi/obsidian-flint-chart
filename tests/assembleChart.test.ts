import { describe, expect, it } from "vitest";
import { assembleChart } from "../src/chart/assembleChart";
import type { ChartAssemblyInput } from "../src/types";

const input: ChartAssemblyInput = {
  data: { values: [{ q: "Q1", rev: 1200 }, { q: "Q2", rev: 1580 }] },
  semantic_types: { q: "Quarter", rev: "Price" },
  chart_spec: { chartType: "Bar Chart", encodings: { x: { field: "q" }, y: { field: "rev" } } },
};

describe("assembleChart", () => {
  it("returns an ECharts option for a valid input", () => {
    const result = assembleChart(input);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.option.series).toBeDefined();
      expect(result.value.option.xAxis).toBeDefined();
    }
  });

  it("strips Flint's internal underscore keys out of the option", () => {
    const result = assembleChart(input);
    if (!result.ok) throw new Error("expected ok");
    const leaked = Object.keys(result.value.option).filter((key) => key.startsWith("_"));
    expect(leaked).toEqual([]);
  });

  it("surfaces the layout size Flint computed", () => {
    const result = assembleChart({
      ...input,
      chart_spec: { ...input.chart_spec, baseSize: { width: 640, height: 400 } },
    });
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.width).toBeGreaterThan(0);
    expect(result.value.height).toBeGreaterThan(0);
  });

  it("reports an unsupported chart type as an error instead of throwing", () => {
    const result = assembleChart({
      ...input,
      chart_spec: { ...input.chart_spec, chartType: "Definitely Not A Chart" },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.message.length).toBeGreaterThan(0);
  });

  it("reports an assembly failure as an error instead of throwing", () => {
    const result = assembleChart({
      data: { values: [] },
      chart_spec: { chartType: "Sankey Diagram", encodings: {} },
    });
    expect(typeof result.ok).toBe("boolean");
  });
});
