// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { load } from "js-yaml";
import * as echarts from "echarts";
import { BlockController } from "../src/render/BlockController";
import { exportCharts } from "../src/commands/exportPng";
import type { ExportTarget } from "../src/commands/exportPng";
import type { ChartHost, ChartInstance, ChartRenderer } from "../src/render/ChartView";

/**
 * PNG export from a chart drawn with the SVG renderer.
 *
 * ECharts' SVG renderer ignores `type: "png"` and hands back
 * `data:image/svg+xml;charset=UTF-8,<url-encoded svg>`, which is not base64.
 *
 * The SVG renderer below is the real one. jsdom has no <canvas>, so the canvas
 * renderer is stood in for by an instance returning a genuine 1×1 PNG — which
 * is what a browser canvas returns from `getDataURL({ type: "png" })`.
 */
const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const fakeCanvas = (): ChartInstance => ({
  setOption: vi.fn(),
  resize: vi.fn(),
  dispose: vi.fn(),
  getDataURL: vi.fn(() => ONE_PIXEL_PNG),
});

const host: ChartHost = {
  init: (element: HTMLElement, renderer: ChartRenderer, size?: { width: number; height: number }) =>
    renderer === "svg"
      ? (echarts.init(element, undefined, {
          renderer: "svg",
          width: size?.width ?? 600,
          height: size?.height ?? 360,
        }) as unknown as ChartInstance)
      : fakeCanvas(),
};

/** Decodes like Obsidian's `base64ToArrayBuffer`: strict, so non-base64 input throws. */
const strictBase64 = (base64: string): ArrayBuffer => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const vault = () => {
  const files = new Map<string, ArrayBuffer>();
  const target: ExportTarget = {
    exists: (path) => files.has(path),
    writeBinary: async (path, data) => {
      files.set(path, data);
    },
    ensureFolder: async () => undefined,
    decodeBase64: strictBase64,
  };
  return { files, target };
};

const BLOCK = `
chartType: Bar Chart
x: quarter
y: revenue
data:
  - { quarter: Q1, revenue: 1200 }
  - { quarter: Q2, revenue: 1580 }
`;

const svgController = async (): Promise<BlockController> => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const controller = new BlockController(container, BLOCK, "Sales.md", {
    parseYaml: (text) => load(text),
    reader: { resolve: () => undefined, read: async () => "" },
    host,
    settings: () => ({
      renderer: "svg",
      showRecommendationNotes: true,
      defaultSize: { width: 560, height: 340 },
    }),
  });
  await controller.render();
  return controller;
};

describe("PNG export with the SVG renderer", () => {
  it("draws the chart on screen as SVG", async () => {
    const controller = await svgController();
    expect(document.querySelector(".flint-chart-canvas svg")).not.toBeNull();
    controller.destroy();
  });

  it("writes real PNG bytes for a chart drawn with SVG", async () => {
    const controller = await svgController();
    const { files, target } = vault();
    const outcome = await exportCharts([controller], target, { notePath: "Sales.md", folder: "", scale: 2 });
    expect(outcome.written).toEqual(["Sales-chart-1.png"]);
    const bytes = new Uint8Array(files.get("Sales-chart-1.png")!);
    expect([...bytes.slice(0, 8)]).toEqual(PNG_SIGNATURE);
    controller.destroy();
  });
});
