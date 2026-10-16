import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { buildChart } from "../src/chart/pipeline";
import type { PipelineDeps } from "../src/chart/pipeline";
import type { ChartPalette } from "../src/chart/applyObsidianTheme";

const palette: ChartPalette = {
  text: "#dcddde", muted: "#999", border: "#444", grid: "#333",
  surface: "#1e1e1e", fontFamily: "Inter",
};

const files: Record<string, string> = {
  "data/sales.csv": "quarter,revenue\nQ1,1200\nQ2,1580\nQ3,990",
  "Notes/Sales.md": "## Q3\n\n| Region | Revenue |\n|---|---|\n| Kanto | 1580 |\n| Kansai | 1120 |\n",
};

const deps: PipelineDeps = {
  parseYaml: (text) => load(text),
  reader: {
    resolve: (path) => (path in files ? path : undefined),
    read: async (path) => files[path]!,
  },
  palette,
  sourcePath: "note.md",
};

const BLOCK = `
chartType: Bar Chart
title: Quarterly revenue
x: quarter
y: revenue
data:
  - { quarter: Q1, revenue: 1200 }
  - { quarter: Q2, revenue: 1580 }
`;

describe("buildChart — happy paths", () => {
  it("turns a shorthand block into a themed ECharts option", async () => {
    const r = await buildChart(BLOCK, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.chartType).toBe("Bar Chart");
    expect(r.value.option.series).toBeDefined();
    expect(r.value.option.backgroundColor).toBe("transparent");
    expect((r.value.option.textStyle as any).color).toBe("#dcddde");
  });

  it("infers semantic types so `types:` is optional", async () => {
    const r = await buildChart(BLOCK, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.option.yAxis).toBeDefined();
  });

  it("recommends a chart type when the block omits one", async () => {
    const r = await buildChart("x: quarter\ny: revenue\nsource: data/sales.csv", deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.recommended).toBe(true);
      expect(typeof r.value.chartType).toBe("string");
    }
  });

  it("reads rows from a CSV file in the vault", async () => {
    const r = await buildChart("chartType: Line Chart\nx: quarter\ny: revenue\nsource: data/sales.csv", deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rowCount).toBe(3);
  });

  it("reads rows from a Markdown table under a heading", async () => {
    const r = await buildChart(
      "chartType: Bar Chart\nx: Region\ny: Revenue\nsource: '[[Notes/Sales.md#Q3]]'",
      deps,
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.rowCount).toBe(2);
  });

  it("accepts a full Flint ChartAssemblyInput pasted verbatim", async () => {
    const r = await buildChart(`
data:
  values:
    - { quarter: Q1, revenue: 1200 }
    - { quarter: Q2, revenue: 1580 }
semantic_types: { quarter: Quarter, revenue: Price }
chart_spec:
  chartType: Line Chart
  encodings:
    x: { field: quarter }
    y: { field: revenue }
`, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.chartType).toBe("Line Chart");
  });

  it("passes the size Flint computed back to the caller", async () => {
    const r = await buildChart(`${BLOCK}\nwidth: 640\nheight: 400`, deps);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.width).toBeGreaterThan(0);
      expect(r.value.height).toBeGreaterThan(0);
    }
  });

  it("draws a block without a size at the configured default size", async () => {
    const fromDefault = await buildChart(BLOCK, { ...deps, defaultSize: { width: 800, height: 500 } });
    const explicit = await buildChart(`${BLOCK}\nwidth: 800\nheight: 500`, deps);
    if (!fromDefault.ok || !explicit.ok) throw new Error("expected ok");
    expect({ width: fromDefault.value.width, height: fromDefault.value.height })
      .toEqual({ width: explicit.value.width, height: explicit.value.height });
  });

  it("takes the side a block leaves out from the configured default", async () => {
    const half = await buildChart(`${BLOCK}\nwidth: 800`, { ...deps, defaultSize: { width: 560, height: 500 } });
    const explicit = await buildChart(`${BLOCK}\nwidth: 800\nheight: 500`, deps);
    if (!half.ok || !explicit.ok) throw new Error("expected ok");
    expect(half.value.height).toBe(explicit.value.height);
  });

  it("draws an oversized block at the cap and passes the note on, as it does the chart-type note", async () => {
    const r = await buildChart(`${BLOCK}\nwidth: 100000\nheight: 100000`, deps);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.key)).toEqual(expect.arrayContaining(["width", "height"]));
    const capped = await buildChart(`${BLOCK}\nwidth: 4096\nheight: 4096`, deps);
    if (!capped.ok) throw new Error("expected ok");
    expect([r.value.width, r.value.height]).toEqual([capped.value.width, capped.value.height]);
  });

  it("carries block warnings through to the caller", async () => {
    const r = await buildChart(`${BLOCK}\ntheme: economist`, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.some((w) => w.key === "theme")).toBe(true);
  });
});

describe("buildChart — failures", () => {
  it("reports a YAML syntax error without throwing", async () => {
    const r = await buildChart("chartType: [unclosed\n  x: a", deps);
    expect(r.ok).toBe(false);
  });

  it("reports an empty block", async () => {
    const r = await buildChart("   \n  \n", deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message.length).toBeGreaterThan(0);
  });

  it("reports an unknown chart type with suggestions", async () => {
    const r = await buildChart("chartType: Barr Chart\nx: a\ndata:\n  - { a: 1 }", deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toContain("Bar Chart");
  });

  it("reports a missing source file", async () => {
    const r = await buildChart("chartType: Bar Chart\nx: a\nsource: nope.csv", deps);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toContain("nope.csv");
  });

  it("reports a block with no data", async () => {
    const r = await buildChart("chartType: Bar Chart\nx: a\ny: b", deps);
    expect(r.ok).toBe(false);
  });
});
