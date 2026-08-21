/**
 * Recolours a Flint-produced ECharts option to match the current Obsidian theme.
 *
 * Flint's `theme_spec` only affects its Vega-Lite backend — the ECharts
 * assembler ignores it — so chrome colours have to be applied here. Flint also
 * leaves axis label colours unset (ECharts' dark-grey defaults then apply) and
 * hard-codes some neutral text fills, both of which are unreadable on a dark
 * background.
 *
 * The data palette (`option.color`, `series[].itemStyle.color`) is never touched.
 */

export interface ChartPalette {
  /** Primary text: titles, axis names, legend. */
  text: string;
  /** Secondary text: tick labels. */
  muted: string;
  /** Axis lines, ticks, tooltip border. */
  border: string;
  /** Grid / split lines behind the marks. */
  grid: string;
  /** Tooltip background. */
  surface: string;
  fontFamily: string;
}

/** Neutral inks Flint hard-codes, which we are free to replace. */
const NEUTRAL_INKS = new Set([
  "#000", "#000000", "black",
  "#333", "#333333",
  "#666", "#666666",
  "#999", "#999999",
]);

const AXIS_KEYS = ["xAxis", "yAxis", "radiusAxis", "angleAxis", "singleAxis", "parallelAxis"] as const;

export function applyObsidianTheme(
  option: Record<string, unknown>,
  palette: ChartPalette,
): Record<string, unknown> {
  const out = clone(option);

  out.backgroundColor = "transparent";
  out.textStyle = { ...asRecord(out.textStyle), color: palette.text, fontFamily: palette.fontFamily };

  for (const key of AXIS_KEYS) {
    if (out[key] === undefined) continue;
    out[key] = mapAxes(out[key], (axis) => styleAxis(axis, palette));
  }

  if (out.legend !== undefined) {
    out.legend = mapAxes(out.legend, (legend) => ({
      ...legend,
      textStyle: { ...asRecord(legend.textStyle), color: palette.text },
    }));
  }

  if (out.tooltip !== undefined) {
    const tooltip = asRecord(out.tooltip);
    out.tooltip = {
      ...tooltip,
      backgroundColor: palette.surface,
      borderColor: palette.border,
      textStyle: { ...asRecord(tooltip.textStyle), color: palette.text },
    };
  }

  if (out.title !== undefined) {
    out.title = mapAxes(out.title, (title) => ({
      ...title,
      textStyle: { ...asRecord(title.textStyle), color: palette.text },
      subtextStyle: { ...asRecord(title.subtextStyle), color: palette.muted },
    }));
  }

  if (out.radar !== undefined) {
    out.radar = mapAxes(out.radar, (radar) => ({
      ...radar,
      // `axisName`, not `name`: a component's `name` is its identifier, and
      // writing an object there makes ECharts reject the whole radar.
      axisName: { ...asRecord(radar.axisName), color: palette.text },
      axisLine: lineStyled(radar.axisLine, palette.border),
      splitLine: lineStyled(radar.splitLine, palette.grid),
    }));
  }

  if (out.calendar !== undefined) {
    out.calendar = mapAxes(out.calendar, (calendar) => ({
      ...calendar,
      dayLabel: { ...asRecord(calendar.dayLabel), color: palette.muted },
      monthLabel: { ...asRecord(calendar.monthLabel), color: palette.muted },
      yearLabel: { ...asRecord(calendar.yearLabel), color: palette.text },
      splitLine: lineStyled(calendar.splitLine, palette.border),
    }));
  }

  if (out.visualMap !== undefined) {
    out.visualMap = mapAxes(out.visualMap, (visualMap) => ({
      ...visualMap,
      textStyle: { ...asRecord(visualMap.textStyle), color: palette.text },
    }));
  }

  if (out.graphic !== undefined) {
    out.graphic = mapAxes(out.graphic, (element) => recolourText(element, palette.text));
  }

  return out;
}

function styleAxis(axis: Record<string, unknown>, palette: ChartPalette): Record<string, unknown> {
  return {
    ...axis,
    axisLabel: { ...asRecord(axis.axisLabel), color: palette.muted },
    nameTextStyle: { ...asRecord(axis.nameTextStyle), color: palette.text },
    axisLine: lineStyled(axis.axisLine, palette.border),
    axisTick: lineStyled(axis.axisTick, palette.border),
    splitLine: lineStyled(axis.splitLine, palette.grid),
  };
}

function lineStyled(value: unknown, color: string): Record<string, unknown> {
  const node = asRecord(value);
  return { ...node, lineStyle: { ...asRecord(node.lineStyle), color } };
}

/** Only replaces the neutral inks Flint hard-codes, leaving intentional colour alone. */
function recolourText(element: Record<string, unknown>, color: string): Record<string, unknown> {
  const style = asRecord(element.style);
  const fill = style.fill;
  if (typeof fill !== "string" || !NEUTRAL_INKS.has(fill.toLowerCase())) return element;
  return { ...element, style: { ...style, fill: color } };
}

/** ECharts accepts most of these components as either one object or an array. */
function mapAxes(
  value: unknown,
  transform: (node: Record<string, unknown>) => Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) return value.map((entry) => transform(asRecord(entry)));
  return transform(asRecord(value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function clone(option: Record<string, unknown>): Record<string, unknown> {
  return { ...option };
}
