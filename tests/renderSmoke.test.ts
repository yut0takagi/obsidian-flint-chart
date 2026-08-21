// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import * as echarts from "echarts";
import { buildChart } from "../src/chart/pipeline";
import { ChartView } from "../src/render/ChartView";
import type { ChartHost, ChartInstance } from "../src/render/ChartView";
import type { PipelineDeps } from "../src/chart/pipeline";

/**
 * End-to-end proof that a block actually paints: real ECharts, SVG renderer, in
 * a DOM. Everything above this only checked that we produce an option object.
 */
const host: ChartHost = {
  init: (element) =>
    echarts.init(element, undefined, {
      renderer: "svg",
      width: 600,
      height: 360,
    }) as unknown as ChartInstance,
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

const render = async (block: string): Promise<string> => {
  const result = await buildChart(block, deps);
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

const DATA = `
data:
  - { quarter: Q1, revenue: 1200, region: East }
  - { quarter: Q2, revenue: 1580, region: East }
  - { quarter: Q3, revenue: 990, region: East }
  - { quarter: Q1, revenue: 800, region: West }
  - { quarter: Q2, revenue: 1120, region: West }
  - { quarter: Q3, revenue: 1310, region: West }
`;

describe("render smoke — real ECharts output", () => {
  it("paints a bar chart with the category labels and the themed text colour", async () => {
    const svg = await render(`chartType: Bar Chart\nx: quarter\ny: revenue\ncolor: region\n${DATA}`);
    expect(svg).toContain("<svg");
    expect(svg).toContain("Q1");
    expect(svg).toContain("#dcddde");
    expect(svg.length).toBeGreaterThan(2000);
  });

  for (const chartType of [
    "Line Chart",
    "Area Chart",
    "Stacked Bar Chart",
    "Grouped Bar Chart",
    "Scatter Plot",
    "Heatmap",
    "Pie Chart",
    "Radar Chart",
  ]) {
    it(`paints a ${chartType}`, async () => {
      // Channel sets differ per chart type: Pie takes size/color, not x/y.
      const encodings = chartType === "Pie Chart"
        ? "color: region\nsize: revenue"
        : chartType === "Grouped Bar Chart"
          ? "x: quarter\ny: revenue\ngroup: region"
          : "x: quarter\ny: revenue\ncolor: region";
      const svg = await render(`chartType: ${chartType}\n${encodings}\n${DATA}`);
      expect(svg).toContain("<svg");
      expect(svg.length).toBeGreaterThan(800);
    });
  }

  it("paints a chart whose type was recommended from the data alone", async () => {
    const svg = await render(`x: quarter\ny: revenue\n${DATA}`);
    expect(svg).toContain("<svg");
  });
});
