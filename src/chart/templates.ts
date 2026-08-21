import { ecAllTemplateDefs } from "flint-chart/echarts";
import type { TemplateRegistry } from "../parse/normalizeBlock";

/**
 * The chart vocabulary, read out of Flint's own ECharts template registry
 * rather than hard-coded, so it tracks whatever version is installed.
 */

interface TemplateDef {
  chart: string;
  channels?: unknown[];
}

const defs = ecAllTemplateDefs as unknown as TemplateDef[];

const channelsByChart = new Map<string, string[]>(
  defs.map((def) => [def.chart, (def.channels ?? []).map(channelName)]),
);

export const chartTypes: string[] = [...channelsByChart.keys()].sort();

export const allChannels: Set<string> = new Set(
  [...channelsByChart.values()].flat(),
);

export function channelsFor(chartType: string): string[] | undefined {
  return channelsByChart.get(chartType);
}

export const registry: TemplateRegistry = { chartTypes, allChannels, channelsFor };

function channelName(channel: unknown): string {
  if (typeof channel === "string") return channel;
  const record = channel as Record<string, unknown> | null;
  const name = record?.channel ?? record?.name;
  return typeof name === "string" ? name : String(channel);
}
