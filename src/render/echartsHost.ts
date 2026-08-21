import * as echarts from "echarts";
import type { ChartHost, ChartInstance, ChartRenderer } from "./ChartView";

/**
 * The only module that touches ECharts directly. Kept behind `ChartHost` so the
 * view logic — including disposal — is testable without a real canvas.
 */
export const echartsHost: ChartHost = {
  init(element: HTMLElement, renderer: ChartRenderer): ChartInstance {
    return echarts.init(element, undefined, {
      renderer,
      width: "auto",
      height: "auto",
    }) as unknown as ChartInstance;
  },
};
