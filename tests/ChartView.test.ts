// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ChartView } from "../src/render/ChartView";
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

  it("returns a data URL once a chart exists and undefined before that", () => {
    const { host } = fakeHost();
    const view = new ChartView(document.createElement("div"), host, "canvas");
    expect(view.dataUrl()).toBeUndefined();
    view.show(chart);
    expect(view.dataUrl()).toBe("data:image/png;base64,AAA");
  });

  it("renders warnings alongside the chart rather than replacing it", () => {
    const el = document.createElement("div");
    const { host } = fakeHost();
    const view = new ChartView(el, host, "canvas");
    view.show(chart, [{ message: "careful", key: "theme" }]);
    expect(el.querySelector(".flint-chart-canvas")).not.toBeNull();
    expect(el.textContent).toContain("careful");
  });

  it("passes the configured renderer through to the host", () => {
    const { host } = fakeHost();
    new ChartView(document.createElement("div"), host, "svg").show(chart);
    expect(host.init).toHaveBeenCalledWith(expect.anything(), "svg");
  });
});
