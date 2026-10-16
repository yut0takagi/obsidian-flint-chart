import { describe, expect, it } from "vitest";
import { FLINT_BASE_SIZE, FLINT_MAX_STRETCH, normalizeBlock } from "../src/parse/normalizeBlock";

const registry = {
  chartTypes: ["Bar Chart", "Line Chart", "Gauge Chart", "Sankey Diagram"],
  allChannels: new Set([
    "x", "y", "x2", "y2", "color", "size", "opacity", "order", "detail",
    "group", "column", "row", "open", "high", "low", "close", "goal",
  ]),
  channelsFor: (chartType: string): string[] | undefined =>
    ({
      "Bar Chart": ["x", "y", "color", "opacity", "column", "row"],
      "Line Chart": ["x", "y", "color", "column", "row"],
      "Gauge Chart": ["size", "column"],
      "Sankey Diagram": ["x", "y", "size"],
    })[chartType],
};

const ok = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  if (!r.ok) throw new Error(`expected ok, got errors: ${JSON.stringify(r.errors)}`);
  return r.value as T;
};

describe("normalizeBlock — shorthand form", () => {
  it("lifts top-level channels into encodings and expands field shorthand", () => {
    const block = ok<any>(normalizeBlock({
      chartType: "Bar Chart",
      x: "quarter",
      y: "revenue",
      data: [{ quarter: "Q1", revenue: 10 }],
    }, registry));

    expect(block.chartType).toBe("Bar Chart");
    expect(block.encodings).toEqual({ x: { field: "quarter" }, y: { field: "revenue" } });
    expect(block.data).toEqual({ kind: "rows", rows: [{ quarter: "Q1", revenue: 10 }] });
  });

  it("passes an object encoding through untouched", () => {
    const block = ok<any>(normalizeBlock({
      chartType: "Bar Chart",
      x: { field: "quarter", sort: "descending" },
      y: "revenue",
      data: [],
    }, registry));
    expect(block.encodings.x).toEqual({ field: "quarter", sort: "descending" });
  });

  it("accepts `types` as an alias of semantic_types, both string and annotation values", () => {
    const block = ok<any>(normalizeBlock({
      chartType: "Bar Chart",
      x: "quarter",
      types: { quarter: "Quarter", rating: { semanticType: "Rating", intrinsicDomain: [1, 5] } },
      data: [],
    }, registry));
    expect(block.semanticTypes).toEqual({
      quarter: "Quarter",
      rating: { semanticType: "Rating", intrinsicDomain: [1, 5] },
    });
  });

  it("maps width/height to baseSize and maxWidth/maxHeight to canvasSize", () => {
    const block = ok<any>(normalizeBlock({
      chartType: "Bar Chart", x: "a", width: 640, height: 400, maxWidth: 900, maxHeight: 600, data: [],
    }, registry));
    expect(block.baseSize).toEqual({ width: 640, height: 400 });
    expect(block.canvasSize).toEqual({ width: 900, height: 600 });
  });

  it("resolves the chart type case-insensitively and without the trailing noun", () => {
    expect(ok<any>(normalizeBlock({ chartType: "bar chart", x: "a", data: [] }, registry)).chartType).toBe("Bar Chart");
    expect(ok<any>(normalizeBlock({ chart: "sankey", x: "a", data: [] }, registry)).chartType).toBe("Sankey Diagram");
    expect(ok<any>(normalizeBlock({ type: "LINE", x: "a", data: [] }, registry)).chartType).toBe("Line Chart");
  });

  it("leaves chartType undefined when omitted, so it can be recommended later", () => {
    const block = ok<any>(normalizeBlock({ x: "a", y: "b", data: [] }, registry));
    expect(block.chartType).toBeUndefined();
  });
});

describe("normalizeBlock — data sources", () => {
  it("treats a multi-line string `data` as raw CSV/TSV text", () => {
    const block = ok<any>(normalizeBlock({
      chartType: "Bar Chart", x: "a", data: "a,b\n1,2\n3,4",
    }, registry));
    expect(block.data).toEqual({ kind: "text", text: "a,b\n1,2\n3,4" });
  });

  it("reads `data.values` in full Flint form", () => {
    const block = ok<any>(normalizeBlock({
      chart_spec: { chartType: "Bar Chart", encodings: { x: { field: "a" } } },
      data: { values: [{ a: 1 }] },
    }, registry));
    expect(block.data).toEqual({ kind: "rows", rows: [{ a: 1 }] });
  });

  it("turns `source` into a file source and strips a wikilink wrapper", () => {
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", source: "data/sales.csv" }, registry)).data)
      .toEqual({ kind: "file", path: "data/sales.csv" });
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", source: "[[Sales Notes]]", table: "Q3" }, registry)).data)
      .toEqual({ kind: "file", path: "Sales Notes", table: "Q3" });
  });

  it("accepts `data.url` in full Flint form as a file source", () => {
    expect(ok<any>(normalizeBlock({
      chart_spec: { chartType: "Bar Chart", encodings: { x: { field: "a" } } },
      data: { url: "data/sales.csv" },
    }, registry)).data).toEqual({ kind: "file", path: "data/sales.csv" });
  });

  it("reports no data source as kind none rather than an error", () => {
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a" }, registry)).data).toEqual({ kind: "none" });
  });
});

describe("normalizeBlock — full Flint form", () => {
  it("passes a ChartAssemblyInput through without applying shorthand rules", () => {
    const block = ok<any>(normalizeBlock({
      data: { values: [{ quarter: "Q1", revenue: 10 }] },
      semantic_types: { quarter: "Quarter", revenue: "Price" },
      field_display_names: { revenue: "Revenue (JPY)" },
      chart_spec: {
        chartType: "Line Chart",
        title: "Sales",
        subtitle: "by quarter",
        encodings: { x: { field: "quarter" }, y: { field: "revenue" } },
        baseSize: { width: 480, height: 320 },
        canvasSize: { width: 900, height: 600 },
        chartProperties: { logScale_y: true },
      },
      theme_spec: "economist",
    }, registry));

    expect(block.chartType).toBe("Line Chart");
    expect(block.title).toBe("Sales");
    expect(block.subtitle).toBe("by quarter");
    expect(block.encodings).toEqual({ x: { field: "quarter" }, y: { field: "revenue" } });
    expect(block.semanticTypes).toEqual({ quarter: "Quarter", revenue: "Price" });
    expect(block.fieldDisplayNames).toEqual({ revenue: "Revenue (JPY)" });
    expect(block.baseSize).toEqual({ width: 480, height: 320 });
    expect(block.canvasSize).toEqual({ width: 900, height: 600 });
    expect(block.chartProperties).toEqual({ logScale_y: true });
    expect(block.themeSpec).toBe("economist");
  });

  it("does not treat a top-level channel key as an encoding when chart_spec is present", () => {
    const block = ok<any>(normalizeBlock({
      chart_spec: { chartType: "Bar Chart", encodings: { x: { field: "a" } } },
      data: { values: [] },
    }, registry));
    expect(block.encodings).toEqual({ x: { field: "a" } });
  });
});

describe("normalizeBlock — errors", () => {
  it("rejects a non-object block", () => {
    const r = normalizeBlock("just a string", registry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/mapping|object/i);
  });

  it("rejects an empty block", () => {
    const r = normalizeBlock({}, registry);
    expect(r.ok).toBe(false);
  });

  it("rejects an unknown chart type and lists near matches", () => {
    const r = normalizeBlock({ chartType: "Barr Chart", x: "a", data: [] }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.message).toContain("Barr Chart");
      expect(r.errors[0]!.message).toContain("Bar Chart");
      expect(r.errors[0]!.key).toBe("chartType");
    }
  });

  it("rejects an unknown top-level key and suggests the closest channel", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: "a", colour: "region", data: [] }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.message).toContain("colour");
      expect(r.errors[0]!.message).toContain("color");
      expect(r.errors[0]!.key).toBe("colour");
    }
  });

  it("warns when a channel is not supported by the chosen chart type", () => {
    const r = normalizeBlock({ chartType: "Gauge Chart", x: "a", size: "v", data: [] }, registry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]!.message).toContain("Gauge Chart");
      expect(r.warnings[0]!.message).toContain("size, column");
      expect(r.warnings[0]!.key).toBe("x");
    }
  });

  it("warns that `theme` has no effect on the ECharts backend", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: "a", theme: "economist", data: [] }, registry);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.warnings[0]!.key).toBe("theme");
      expect(r.warnings[0]!.message).toMatch(/Vega-Lite|no effect/i);
    }
  });

  it("rejects an encoding object without a field", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: { sort: "ascending" }, data: [] }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/field/);
  });

  it("rejects a non-numeric width", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: "a", width: "wide", data: [] }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe("width");
  });

  it("rejects rows that are not objects", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: "a", data: [1, 2, 3] }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe("data");
  });

  it("rejects `table` without a `source`", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: "a", table: "Q3" }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.key).toBe("table");
  });

  it("collects several errors instead of stopping at the first", () => {
    const r = normalizeBlock({ chartType: "Nope Chart", colour: "region", width: "wide" }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe("normalizeBlock — data source edge cases", () => {
  it("rejects a single-line `data` string and points at `source`", () => {
    const r = normalizeBlock({ chartType: "Bar Chart", x: "a", data: "sales.csv" }, registry);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors[0]!.key).toBe("data");
      expect(r.errors[0]!.message).toContain("source");
    }
  });

  it("splits a heading out of a wikilink source", () => {
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", source: "[[Sales Notes#Q3|Q3 sales]]" }, registry)).data)
      .toEqual({ kind: "file", path: "Sales Notes", table: "Q3" });
  });
});

describe("normalizeBlock — default size", () => {
  const defaults = { defaultSize: { width: 560, height: 340 } };

  it("uses the default size when the block sets neither width nor height", () => {
    const block = ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", data: [] }, registry, defaults));
    expect(block.baseSize).toEqual({ width: 560, height: 340 });
  });

  it("fills only the side the block leaves out", () => {
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", width: 640, data: [] }, registry, defaults)).baseSize)
      .toEqual({ width: 640, height: 340 });
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", height: 400, data: [] }, registry, defaults)).baseSize)
      .toEqual({ width: 560, height: 400 });
  });

  it("applies the default to a pasted full-form spec that has no baseSize", () => {
    const block = ok<any>(normalizeBlock({
      chart_spec: { chartType: "Bar Chart", encodings: { x: { field: "a" } } },
      data: { values: [] },
    }, registry, defaults));
    expect(block.baseSize).toEqual({ width: 560, height: 340 });
  });

  it("completes a half-written full-form baseSize instead of dropping it", () => {
    const block = ok<any>(normalizeBlock({
      chart_spec: { chartType: "Bar Chart", encodings: { x: { field: "a" } }, baseSize: { width: 700 } },
      data: { values: [] },
    }, registry, defaults));
    expect(block.baseSize).toEqual({ width: 700, height: 340 });
  });

  it("leaves the size to Flint when there is no default and the block sets none", () => {
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", data: [] }, registry)).baseSize).toBeUndefined();
  });

  it("without a default, fills the missing side with Flint's own default rather than a made-up one", () => {
    expect(ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", width: 640, data: [] }, registry)).baseSize)
      .toEqual({ width: 640, height: FLINT_BASE_SIZE.height });
  });

  it("does not let a one-sided ceiling clamp the other side harder than Flint would", () => {
    const block = ok<any>(normalizeBlock({ chartType: "Bar Chart", x: "a", maxWidth: 900, data: [] }, registry, defaults));
    expect(block.canvasSize).toEqual({ width: 900, height: Math.round(340 * FLINT_MAX_STRETCH) });
  });
});
