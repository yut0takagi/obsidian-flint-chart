import { describe, expect, it } from "vitest";
import { applyObsidianTheme } from "../src/chart/applyObsidianTheme";
import type { ChartPalette } from "../src/chart/applyObsidianTheme";

const dark: ChartPalette = {
  text: "#dcddde",
  muted: "#999999",
  border: "#444444",
  grid: "#333333",
  surface: "#1e1e1e",
  fontFamily: "Inter",
};

describe("applyObsidianTheme", () => {
  it("makes the canvas transparent so the note background shows through", () => {
    expect(applyObsidianTheme({}, dark).backgroundColor).toBe("transparent");
  });

  it("sets the global text colour and font", () => {
    const option = applyObsidianTheme({}, dark) as any;
    expect(option.textStyle.color).toBe("#dcddde");
    expect(option.textStyle.fontFamily).toBe("Inter");
  });

  it("colours axis labels, names, lines, ticks and grid lines", () => {
    const option = applyObsidianTheme({ xAxis: { axisLabel: { fontSize: 12 }, nameTextStyle: {} } }, dark) as any;
    expect(option.xAxis.axisLabel.color).toBe("#999999");
    expect(option.xAxis.axisLabel.fontSize).toBe(12);
    expect(option.xAxis.nameTextStyle.color).toBe("#dcddde");
    expect(option.xAxis.axisLine.lineStyle.color).toBe("#444444");
    expect(option.xAxis.axisTick.lineStyle.color).toBe("#444444");
    expect(option.xAxis.splitLine.lineStyle.color).toBe("#333333");
  });

  it("handles an axis given as an array", () => {
    const option = applyObsidianTheme({ yAxis: [{}, {}] }, dark) as any;
    expect(option.yAxis).toHaveLength(2);
    expect(option.yAxis[1].axisLabel.color).toBe("#999999");
  });

  it("colours the legend and the tooltip", () => {
    const option = applyObsidianTheme({ legend: {}, tooltip: {} }, dark) as any;
    expect(option.legend.textStyle.color).toBe("#dcddde");
    expect(option.tooltip.textStyle.color).toBe("#dcddde");
    expect(option.tooltip.backgroundColor).toBe("#1e1e1e");
    expect(option.tooltip.borderColor).toBe("#444444");
  });

  it("recolours Flint's hard-coded neutral text fill", () => {
    const option = applyObsidianTheme(
      { graphic: [{ type: "text", style: { text: "region", fill: "#333" } }] },
      dark,
    ) as any;
    expect(option.graphic[0].style.fill).toBe("#dcddde");
  });

  it("leaves a deliberate non-neutral fill alone", () => {
    const option = applyObsidianTheme(
      { graphic: [{ type: "text", style: { text: "up", fill: "#5470c6" } }] },
      dark,
    ) as any;
    expect(option.graphic[0].style.fill).toBe("#5470c6");
  });

  it("never touches the series palette", () => {
    const series = [{ type: "bar", itemStyle: { color: "#5470c6" } }];
    const option = applyObsidianTheme({ series, color: ["#5470c6"] }, dark) as any;
    expect(option.series[0].itemStyle.color).toBe("#5470c6");
    expect(option.color).toEqual(["#5470c6"]);
  });

  it("colours radar, calendar and visualMap chrome when present", () => {
    const option = applyObsidianTheme({
      radar: { axisName: { fontSize: 12 } },
      calendar: { dayLabel: {}, monthLabel: {}, yearLabel: {} },
      visualMap: { },
    }, dark) as any;
    // ECharts names the radar label option `axisName`; the `name` key on a
    // component is its identifier and must stay a string.
    expect(option.radar.axisName.color).toBe("#dcddde");
    expect(option.radar.axisName.fontSize).toBe(12);
    expect(option.radar.name).toBeUndefined();
    expect(option.calendar.dayLabel.color).toBe("#999999");
    expect(option.calendar.monthLabel.color).toBe("#999999");
    expect(option.calendar.yearLabel.color).toBe("#dcddde");
    expect(option.visualMap.textStyle.color).toBe("#dcddde");
  });

  it("does not mutate the option it was given", () => {
    const original = { xAxis: { axisLabel: {} } };
    const copy = JSON.parse(JSON.stringify(original));
    applyObsidianTheme(original, dark);
    expect(original).toEqual(copy);
  });
});
