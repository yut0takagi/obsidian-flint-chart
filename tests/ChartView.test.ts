// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ChartView } from "../src/render/ChartView";
import { MAX_CHART_PX, MAX_EXPORT_AREA } from "../src/limits";
import type { ChartHost, ChartInstance } from "../src/render/ChartView";

const fakeHost = () => {
  const instances: ChartInstance[] = [];
  const host: ChartHost = {
    init: vi.fn(() => {
      const instance: ChartInstance = {
        setOption: vi.fn(),
        resize: vi.fn(),
        dispose: vi.fn(),
        getDataURL: vi.fn(() => "data:image/png;base64,AAA"),
      };
      instances.push(instance);
      return instance;
    }),
  };
  return { host, instances };
};

const chart = { option: { series: [] }, width: 480, height: 320 };

describe("ChartView", () => {
  it("creates one chart instance and sets the option", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    expect(host.init).toHaveBeenCalledTimes(1);
    expect(instances[0]!.setOption).toHaveBeenCalledWith({ series: [] }, true);
  });

  it("reuses the instance when the block re-renders", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    view.show(chart);
    expect(host.init).toHaveBeenCalledTimes(1);
    expect(instances[0]!.setOption).toHaveBeenCalledTimes(2);
  });

  it("sizes the canvas element from the layout Flint computed", () => {
    const el = document.createElement("div");
    const { host } = fakeHost();
    new ChartView(el, host, "canvas").show(chart);
    const canvas = el.querySelector<HTMLElement>(".flint-chart-canvas");
    expect(canvas).not.toBeNull();
    expect(canvas!.style.height).toBe("320px");
  });

  it("disposes the instance on destroy", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    view.destroy();
    expect(instances[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it("is safe to destroy twice and disposes only once", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    view.destroy();
    view.destroy();
    expect(instances[0]!.dispose).toHaveBeenCalledTimes(1);
  });

  it("is safe to destroy before anything was shown", () => {
    const { host } = fakeHost();
    expect(() => new ChartView(document.createElement("div"), host, "canvas").destroy()).not.toThrow();
  });

  it("disposes the chart when switching to an error report", () => {
    const { host, instances } = fakeHost();
    const el = document.createElement("div");
    const view = new ChartView(el, host, "canvas");
    view.show(chart);
    view.showIssues({ errors: [{ message: "bad" }], warnings: [], source: "" });
    expect(instances[0]!.dispose).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain("bad");
  });

  it("re-creates a chart after an error report", () => {
    const { host } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    view.showIssues({ errors: [{ message: "bad" }], warnings: [], source: "" });
    view.show(chart);
    expect(host.init).toHaveBeenCalledTimes(2);
  });

  it("forwards resize only while a chart exists", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.resize();
    view.show(chart);
    view.resize();
    view.destroy();
    view.resize();
    expect(instances[0]!.resize).toHaveBeenCalledTimes(1);
  });

  it("has nothing to snapshot before a chart is shown, or after it is replaced by an error", () => {
    const { host } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    expect(view.snapshot({ pixelRatio: 2, backgroundColor: "transparent" })).toBeUndefined();
    view.show(chart);
    view.showIssues({ errors: [{ message: "bad" }], warnings: [], source: "" });
    expect(view.snapshot({ pixelRatio: 2, backgroundColor: "transparent" })).toBeUndefined();
  });

  it("snapshots on a fresh canvas instance, even when the view draws with SVG", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "svg");
    view.show(chart);
    const url = view.snapshot({ pixelRatio: 3, backgroundColor: "#ffffff" });

    expect(url).toBe("data:image/png;base64,AAA");
    expect(host.init).toHaveBeenLastCalledWith(expect.anything(), "canvas", { width: 480, height: 320 });
    const [onScreen, offScreen] = instances;
    expect(onScreen!.getDataURL).not.toHaveBeenCalled();
    expect(offScreen!.getDataURL).toHaveBeenCalledWith({ type: "png", pixelRatio: 3, backgroundColor: "#ffffff" });
  });

  it("snapshots the finished chart, not a frame of its entry animation", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    view.snapshot({ pixelRatio: 1, backgroundColor: "transparent" });
    expect(instances[1]!.setOption).toHaveBeenCalledWith({ series: [], animation: false }, true);
  });

  it("can snapshot a differently styled option without touching the one on screen", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    view.snapshot({ pixelRatio: 1, backgroundColor: "#fff", option: { series: [], textStyle: { color: "#000" } } });
    expect(instances[1]!.setOption).toHaveBeenCalledWith(
      { series: [], textStyle: { color: "#000" }, animation: false }, true,
    );
    expect(instances[0]!.setOption).toHaveBeenCalledTimes(1);
  });

  it("disposes the snapshot instance straight away and keeps the chart on screen", () => {
    const { host, instances } = fakeHost();
    const el = document.createElement("div");
    const view = new ChartView(el, host, "canvas");
    view.show(chart);
    view.snapshot({ pixelRatio: 1, backgroundColor: "transparent" });
    expect(instances[1]!.dispose).toHaveBeenCalledTimes(1);
    expect(instances[0]!.dispose).not.toHaveBeenCalled();
    expect(el.querySelectorAll(".flint-chart-canvas")).toHaveLength(1);
  });

  it("disposes the snapshot instance even when drawing it throws", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show(chart);
    (host.init as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const broken: ChartInstance = {
        setOption: vi.fn(() => {
          throw new Error("boom");
        }),
        resize: vi.fn(),
        dispose: vi.fn(),
        getDataURL: vi.fn(),
      };
      instances.push(broken);
      return broken;
    });
    expect(() => view.snapshot({ pixelRatio: 1, backgroundColor: "transparent" })).toThrow("boom");
    expect(instances[1]!.dispose).toHaveBeenCalledTimes(1);
  });

  it("renders warnings alongside the chart rather than replacing it", () => {
    const el = document.createElement("div");
    const { host } = fakeHost();
    const view = new ChartView(el, host, "canvas");
    view.show(chart, [{ message: "careful", key: "theme" }]);
    expect(el.querySelector(".flint-chart-canvas")).not.toBeNull();
    expect(el.textContent).toContain("careful");
  });

  it("offers an actions button only while a chart is shown", () => {
    const { host } = fakeHost();
    const el = document.createElement("div");
    const onClick = vi.fn();
    const view = new ChartView(el, host, "canvas", { label: "Chart actions", onClick });
    expect(el.querySelector(".flint-chart-actions")).toBeNull();

    view.show(chart);
    const button = el.querySelector<HTMLButtonElement>("button.flint-chart-actions")!;
    expect(button.getAttribute("aria-label")).toBe("Chart actions");
    button.click();
    expect(onClick).toHaveBeenCalledWith(expect.any(MouseEvent), button);

    view.showIssues({ errors: [{ message: "bad" }], warnings: [], source: "" });
    expect(el.querySelector(".flint-chart-actions")).toBeNull();
    view.show(chart);
    view.destroy();
    expect(el.querySelector(".flint-chart-actions")).toBeNull();
  });

  it("keeps a click on the actions button from reaching the editor", () => {
    const { host } = fakeHost();
    const el = document.createElement("div");
    const outside = vi.fn();
    el.addEventListener("click", outside);
    el.addEventListener("mousedown", outside);
    new ChartView(el, host, "canvas", { label: "Chart actions", onClick: vi.fn() }).show(chart);
    const button = el.querySelector<HTMLElement>(".flint-chart-actions")!;
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    button.click();
    expect(outside).not.toHaveBeenCalled();
  });

  it("opens the same actions from a right-click on the chart", () => {
    const { host } = fakeHost();
    const el = document.createElement("div");
    const onClick = vi.fn();
    new ChartView(el, host, "canvas", { label: "Chart actions", onClick }).show(chart);
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    el.querySelector(".flint-chart-canvas")!.dispatchEvent(event);
    expect(onClick).toHaveBeenCalledWith(event, undefined);
    expect(event.defaultPrevented).toBe(true);
  });

  it("lets the host draw the button's icon", () => {
    const { host } = fakeHost();
    const el = document.createElement("div");
    const decorate = vi.fn((button: HTMLElement) => button.setAttribute("data-icon", "image"));
    new ChartView(el, host, "canvas", { label: "Chart actions", onClick: vi.fn(), decorate }).show(chart);
    expect(el.querySelector(".flint-chart-actions")!.getAttribute("data-icon")).toBe("image");
  });

  it("never sizes the chart element past the drawing limit, whatever Flint computed", () => {
    const el = document.createElement("div");
    const { host } = fakeHost();
    new ChartView(el, host, "canvas").show({ option: { series: [] }, width: 1e6, height: 1e6 });
    const canvas = el.querySelector<HTMLElement>(".flint-chart-canvas")!;
    expect(canvas.style.height).toBe(`${MAX_CHART_PX}px`);
    expect(canvas.style.maxWidth).toBe(`${MAX_CHART_PX}px`);
  });

  it("caps the snapshot canvas and its scale, so an export cannot ask for a giant bitmap", () => {
    const { host, instances } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    view.show({ option: { series: [] }, width: 1e6, height: 1e6 });
    view.snapshot({ pixelRatio: 4, backgroundColor: "transparent" });
    const size = (host.init as ReturnType<typeof vi.fn>).mock.calls[1]![2] as { width: number; height: number };
    const [request] = (instances[1]!.getDataURL as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const ratio = (request as { pixelRatio: number }).pixelRatio;
    expect(size.width).toBeLessThanOrEqual(MAX_CHART_PX);
    expect(size.height).toBeLessThanOrEqual(MAX_CHART_PX);
    expect(size.width * ratio * size.height * ratio).toBeLessThanOrEqual(MAX_EXPORT_AREA);
  });

  it("passes the configured renderer through to the host", () => {
    const { host } = fakeHost();
    new ChartView(document.createElement("div"), host, "svg").show(chart);
    expect(host.init).toHaveBeenCalledWith(expect.anything(), "svg");
  });
});
