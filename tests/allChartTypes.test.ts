// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import * as echarts from "echarts";
import { buildChart } from "../src/chart/pipeline";
import { chartTypes } from "../src/chart/templates";
import { ChartView } from "../src/render/ChartView";
import type { ChartHost, ChartInstance } from "../src/render/ChartView";
import type { PipelineDeps } from "../src/chart/pipeline";

/**
 * Every chart type Flint's ECharts backend advertises, actually painted.
 * The structural charts here (sankey, treemap, sunburst, gauge, calendar) are
 * the reason this plugin bundles ECharts rather than Vega-Lite, so they need to
 * be held to the same standard as the everyday ones.
 */

const host: ChartHost = {
  init: (element) =>
    echarts.init(element, undefined, { renderer: "svg", width: 640, height: 400 }) as unknown as ChartInstance,
};

const deps: PipelineDeps = {
  parseYaml: (text) => load(text),
  reader: { resolve: () => undefined, read: async () => "" },
  palette: {
    text: "#dcddde", muted: "#999999", border: "#444444",
    grid: "#333333", surface: "#1e1e1e", fontFamily: "Inter",
  },
  sourcePath: "note.md",
};

const ROWS = `
types:
  period: Quarter
  group: Category
  target: Category
  value: Quantity
  rank: Rank
  day: Date
  begins: Date
  ends: Date
  open: Price
  high: Price
  low: Price
  close: Price
data:
  - { period: Q1, group: East, target: Retail, value: 1200, rank: 1, day: 2026-01-05, begins: 2026-01-01, ends: 2026-01-09, open: 10, high: 16, low: 9, close: 14 }
  - { period: Q2, group: East, target: Online, value: 1580, rank: 2, day: 2026-02-11, begins: 2026-01-06, ends: 2026-01-14, open: 14, high: 18, low: 12, close: 17 }
  - { period: Q3, group: East, target: Retail, value: 990,  rank: 3, day: 2026-03-19, begins: 2026-01-12, ends: 2026-01-22, open: 17, high: 19, low: 13, close: 15 }
  - { period: Q1, group: West, target: Online, value: 800,  rank: 3, day: 2026-04-02, begins: 2026-01-03, ends: 2026-01-11, open: 15, high: 17, low: 11, close: 13 }
  - { period: Q2, group: West, target: Retail, value: 1120, rank: 1, day: 2026-05-08, begins: 2026-01-08, ends: 2026-01-18, open: 13, high: 20, low: 12, close: 19 }
  - { period: Q3, group: West, target: Online, value: 1310, rank: 2, day: 2026-06-23, begins: 2026-01-15, ends: 2026-01-26, open: 19, high: 22, low: 16, close: 21 }
`;

/** Channel bindings chosen from each template's declared channel set. */
const ENCODINGS: Record<string, string> = {
  "Scatter Plot": "x: value\ny: rank\ncolor: group",
  "Regression": "x: value\ny: rank",
  "Connected Scatter Plot": "x: value\ny: rank\norder: rank\ncolor: group",
  "Ranged Dot Plot": "x: value\ny: period\ncolor: group",
  "Boxplot": "x: group\ny: value",
  "Strip Plot": "x: group\ny: value",
  "Bar Chart": "x: period\ny: value\ncolor: group",
  "Grouped Bar Chart": "x: period\ny: value\ngroup: group",
  "Stacked Bar Chart": "x: period\ny: value\ncolor: group",
  "Lollipop Chart": "x: period\ny: value",
  "Pyramid Chart": "x: value\ny: period\ncolor: group",
  "Heatmap": "x: period\ny: group\ncolor: value",
  "Calendar Heatmap": "x: day\ncolor: value",
  "Line Chart": "x: period\ny: value\ncolor: group",
  "Bump Chart": "x: period\ny: rank\ncolor: group",
  "Slope Chart": "x: period\ny: value\ncolor: group",
  "Area Chart": "x: period\ny: value\ncolor: group",
  "Streamgraph": "x: period\ny: value\ncolor: group",
  "Range Area Chart": "x: period\ny: low\ny2: high",
  "Pie Chart": "color: group\nsize: value",
  "Funnel Chart": "y: target\nsize: value",
  "Treemap": "color: group\nsize: value\ndetail: target",
  "Sunburst Chart": "color: group\nsize: value\ngroup: target",
  "Tree": "color: group\ndetail: target\nsize: value",
  "Histogram": "x: value",
  "Density Plot": "x: value",
  "ECDF Plot": "x: value",
  "Parallel Coordinates": "color: group\ndetail: target",
  "Candlestick Chart": "x: day\nopen: open\nhigh: high\nlow: low\nclose: close",
  "Waterfall Chart": "x: period\ny: value",
  "Gantt Chart": "y: target\nx: begins\nx2: ends\ncolor: group",
  "Bullet Chart": "y: target\nx: value\ngoal: rank",
  "Radar Chart": "x: period\ny: value\ncolor: group",
  "Rose Chart": "x: period\ny: value\ncolor: group",
  "Gauge Chart": "size: value",
  "Sankey Diagram": "x: group\ny: target\nsize: value",
  "Network Graph": "x: group\ny: target\nsize: value",
};

const paint = async (chartType: string): Promise<string> => {
  const result = await buildChart(`chartType: ${chartType}\n${ENCODINGS[chartType]}\n${ROWS}`, deps);
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("; "));
  const container = document.createElement("div");
  document.body.appendChild(container);
  const view = new ChartView(container, host, "svg");
  view.show(result.value);
  const svg = container.querySelector("svg")?.outerHTML ?? "";
  view.destroy();
  container.remove();
  return svg;
};

describe("every chart type paints", () => {
  it("has a binding for every chart type the backend advertises", () => {
    expect(chartTypes.filter((type) => ENCODINGS[type] === undefined)).toEqual([]);
  });

  for (const chartType of Object.keys(ENCODINGS)) {
    it(chartType, async () => {
      const svg = await paint(chartType);
      expect(svg).toContain("<svg");
      expect(svg.length).toBeGreaterThan(600);
    });
  }
});
