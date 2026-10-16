// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { load } from "js-yaml";
import { BlockController } from "../src/render/BlockController";
import { buildChart } from "../src/chart/pipeline";
import type { ControllerSettings } from "../src/render/BlockController";
import type { ChartHost, ChartInstance } from "../src/render/ChartView";

const fakeHost = (): ChartHost => ({
  init: vi.fn(
    (): ChartInstance => ({
      setOption: vi.fn(),
      resize: vi.fn(),
      dispose: vi.fn(),
      getDataURL: vi.fn(() => "data:image/png;base64,AAAA"),
    }),
  ),
});

const BLOCK = `
chartType: Bar Chart
x: quarter
y: revenue
data:
  - { quarter: Q1, revenue: 1200 }
  - { quarter: Q2, revenue: 1580 }
`;

const settings = (overrides: Partial<ControllerSettings> = {}): ControllerSettings => ({
  renderer: "canvas",
  showRecommendationNotes: true,
  defaultSize: { width: 560, height: 340 },
  ...overrides,
});

const mount = async (source: string, chosen: ControllerSettings): Promise<HTMLElement> => {
  const container = document.createElement("div");
  const controller = new BlockController(container, source, "note.md", {
    parseYaml: (text) => load(text),
    reader: { resolve: () => undefined, read: async () => "" },
    host: fakeHost(),
    settings: () => chosen,
  });
  await controller.render();
  return container.querySelector<HTMLElement>(".flint-chart-canvas")!;
};

const heightFor = async (source: string): Promise<string> => {
  const built = await buildChart(source, {
    parseYaml: (text) => load(text),
    reader: { resolve: () => undefined, read: async () => "" },
    palette: { text: "#000", muted: "#000", border: "#000", grid: "#000", surface: "#fff", fontFamily: "x" },
    sourcePath: "note.md",
  });
  if (!built.ok) throw new Error("expected ok");
  return `${built.value.height}px`;
};

describe("BlockController — default size setting", () => {
  it("draws a block without a size at the height from the settings", async () => {
    const canvas = await mount(BLOCK, settings({ defaultSize: { width: 560, height: 600 } }));
    expect(canvas.style.height).toBe(await heightFor(`${BLOCK}\nwidth: 560\nheight: 600`));
  });

  it("lets the block's own height win over the setting", async () => {
    const canvas = await mount(`${BLOCK}\nheight: 200`, settings({ defaultSize: { width: 560, height: 600 } }));
    expect(canvas.style.height).toBe(await heightFor(`${BLOCK}\nwidth: 560\nheight: 200`));
  });
});
