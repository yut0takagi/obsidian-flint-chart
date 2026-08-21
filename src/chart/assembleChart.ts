import { assembleECharts } from "flint-chart/echarts";
import type { BlockIssue, ChartAssemblyInput, Result } from "../types";

type FlintInput = Parameters<typeof assembleECharts>[0];

/**
 * The single place this plugin calls into Flint.
 *
 * Flint returns the ECharts option with its own layout metadata mixed in under
 * `_`-prefixed keys. We split those out: the option stays clean, and the
 * computed size becomes the initial container size.
 *
 * Keep every Flint-version quirk inside this file.
 */

export interface AssembledChart {
  option: Record<string, unknown>;
  width?: number;
  height?: number;
  dataLength?: number;
}

export function assembleChart(input: ChartAssemblyInput): Result<AssembledChart> {
  let raw: Record<string, unknown>;
  try {
    // Boundary cast: our `theme_spec` stays `unknown` because it comes from
    // user-written YAML. Flint types it as `string | ThemeSpec`. Keeping the
    // cast here is the point of this adapter.
    raw = assembleECharts(input as FlintInput) as Record<string, unknown>;
  } catch (error) {
    return { ok: false, errors: [describe(error, input.chart_spec.chartType)] };
  }
  if (raw === null || typeof raw !== "object") {
    return {
      ok: false,
      errors: [{ message: `Flint returned no chart for "${input.chart_spec.chartType}".` }],
    };
  }

  const option: Record<string, unknown> = {};
  const meta: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("_")) meta[key] = value;
    else option[key] = value;
  }

  return {
    ok: true,
    value: {
      option,
      ...numeric("width", meta._width),
      ...numeric("height", meta._height),
      ...numeric("dataLength", meta._dataLength),
    },
    warnings: [],
  };
}

function numeric<K extends string>(key: K, value: unknown): Partial<Record<K, number>> {
  return typeof value === "number" && Number.isFinite(value)
    ? ({ [key]: value } as Record<K, number>)
    : {};
}

function describe(error: unknown, chartType: string): BlockIssue {
  const detail = error instanceof Error ? error.message : String(error);
  return { message: `Could not build "${chartType}": ${detail}`, key: "chartType" };
}
