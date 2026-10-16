// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { load } from "js-yaml";
import { BlockController } from "../src/render/BlockController";
import { buildChart } from "../src/chart/pipeline";
import type { ControllerSettings } from "../src/render/BlockController";
import { LIGHT_PALETTE } from "../src/render/palette";
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

describe("BlockController — PNG export appearance", () => {
  const recordingHost = () => {
    const instances: ChartInstance[] = [];
    const host: ChartHost = {
      init: vi.fn(() => {
        const instance: ChartInstance = {
          setOption: vi.fn(),
          resize: vi.fn(),
          dispose: vi.fn(),
          getDataURL: vi.fn(() => "data:image/png;base64,AAAA"),
        };
        instances.push(instance);
        return instance;
      }),
    };
    return { host, instances };
  };

  const setup = async (title = "") => {
    const { host, instances } = recordingHost();
    const container = document.createElement("div");
    document.body.appendChild(container);
    // A dark theme, as Obsidian would expose it.
    container.style.setProperty("--text-normal", "#dcddde");
    container.style.setProperty("--background-primary", "#1e1e1e");
    const onActions = vi.fn();
    const controller = new BlockController(container, `${title}${BLOCK}`, "Sales.md", {
      parseYaml: (text) => load(text),
      reader: { resolve: () => undefined, read: async () => "" },
      host,
      settings: () => settings(),
      onActions,
    });
    await controller.render();
    return { controller, instances, container, onActions };
  };

  const snapshotCall = (instance: ChartInstance) => {
    const [option] = (instance.setOption as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const [request] = (instance.getDataURL as ReturnType<typeof vi.fn>).mock.calls[0]!;
    return { option: option as Record<string, any>, request: request as Record<string, unknown> };
  };

  it("paints the note's background behind the theme's ink for `theme`", async () => {
    const { controller, instances } = await setup();
    controller.pngDataUrl({ scale: 2, background: "theme" });
    const { option, request } = snapshotCall(instances[1]!);
    expect(request.backgroundColor).toBe("#1e1e1e");
    expect(option.textStyle.color).toBe("#dcddde");
  });

  it("re-inks the chart dark on white for `white`, leaving the data colours alone", async () => {
    const { controller, instances } = await setup();
    controller.pngDataUrl({ scale: 2, background: "white" });
    const onScreen = (instances[0]!.setOption as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, any>;
    const { option, request } = snapshotCall(instances[1]!);
    expect(request.backgroundColor).toBe("#ffffff");
    expect(option.textStyle.color).toBe(LIGHT_PALETTE.text);
    expect(option.color).toEqual(onScreen.color);
    expect(option.series).toEqual(onScreen.series);
  });

  it("keeps a transparent background for `transparent`", async () => {
    const { controller, instances } = await setup();
    controller.pngDataUrl({ scale: 2, background: "transparent" });
    expect(snapshotCall(instances[1]!).request.backgroundColor).toBe("transparent");
  });

  it("knows the block's title, for naming the file", async () => {
    expect((await setup("title: Quarterly revenue\n")).controller.title()).toBe("Quarterly revenue");
    expect((await setup()).controller.title()).toBeUndefined();
  });

  it("hands the actions button to the plugin along with itself", async () => {
    const { controller, container, onActions } = await setup();
    container.querySelector<HTMLElement>(".flint-chart-actions")!.click();
    expect(onActions).toHaveBeenCalledWith(expect.any(MouseEvent), controller, expect.any(HTMLElement));
  });
});
