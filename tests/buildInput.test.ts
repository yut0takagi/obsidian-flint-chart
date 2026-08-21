import { describe, expect, it } from "vitest";
import { buildInput } from "../src/chart/buildInput";
import type { FlintBlock } from "../src/types";

const base: FlintBlock = {
  chartType: "Bar Chart",
  encodings: { x: { field: "quarter" }, y: { field: "revenue" } },
  semanticTypes: {},
  data: { kind: "rows", rows: [] },
};

const rows = [{ quarter: "Q1", revenue: 1200 }, { quarter: "Q2", revenue: 1580 }];

describe("buildInput", () => {
  it("assembles a ChartAssemblyInput with inferred semantic types", () => {
    const input = buildInput(base, rows, "Bar Chart");
    expect(input.data).toEqual({ values: rows });
    expect(input.chart_spec.chartType).toBe("Bar Chart");
    expect(input.chart_spec.encodings).toEqual({ x: { field: "quarter" }, y: { field: "revenue" } });
    expect(input.semantic_types).toEqual({ quarter: "Quarter", revenue: "Price" });
  });

  it("uses the chart type it is given, not the one on the block", () => {
    expect(buildInput({ ...base, chartType: undefined }, rows, "Line Chart").chart_spec.chartType)
      .toBe("Line Chart");
  });

  it("lets explicit semantic types override inference", () => {
    const block = { ...base, semanticTypes: { revenue: "Amount" } };
    expect(buildInput(block, rows, "Bar Chart").semantic_types).toEqual({
      quarter: "Quarter", revenue: "Amount",
    });
  });

  it("carries title, subtitle, sizes, properties and display names through", () => {
    const input = buildInput({
      ...base,
      title: "Sales",
      subtitle: "by quarter",
      baseSize: { width: 640, height: 400 },
      canvasSize: { width: 900, height: 600 },
      chartProperties: { cornerRadius: 4 },
      fieldDisplayNames: { revenue: "Revenue (JPY)" },
      themeSpec: "economist",
    }, rows, "Bar Chart");

    expect(input.chart_spec.title).toBe("Sales");
    expect(input.chart_spec.subtitle).toBe("by quarter");
    expect(input.chart_spec.baseSize).toEqual({ width: 640, height: 400 });
    expect(input.chart_spec.canvasSize).toEqual({ width: 900, height: 600 });
    expect(input.chart_spec.chartProperties).toEqual({ cornerRadius: 4 });
    expect(input.field_display_names).toEqual({ revenue: "Revenue (JPY)" });
    expect(input.theme_spec).toBe("economist");
  });

  it("omits optional keys rather than sending undefined", () => {
    const input = buildInput(base, rows, "Bar Chart");
    expect("title" in input.chart_spec).toBe(false);
    expect("theme_spec" in input).toBe(false);
    expect("field_display_names" in input).toBe(false);
  });

  it("lets a caller-supplied theme fill in when the block has none", () => {
    expect(buildInput(base, rows, "Bar Chart", { ink: {} }).theme_spec).toEqual({ ink: {} });
  });

  it("prefers the theme written in the block over the caller's", () => {
    expect(buildInput({ ...base, themeSpec: "economist" }, rows, "Bar Chart", { ink: {} }).theme_spec)
      .toBe("economist");
  });
});
