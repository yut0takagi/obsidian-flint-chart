import { applyObsidianTheme } from "./applyObsidianTheme";
import { assembleChart } from "./assembleChart";
import { buildInput } from "./buildInput";
import { recommendFrom } from "./recommend";
import { registry } from "./templates";
import { normalizeBlock } from "../parse/normalizeBlock";
import { inferSemanticTypes } from "../data/inferSemanticTypes";
import { resolveRows } from "../data/resolveRows";
import type { ChartPalette } from "./applyObsidianTheme";
import type { VaultReader } from "../data/resolveRows";
import type { BlockIssue, Result, Size } from "../types";

/**
 * The whole journey from block text to a themed ECharts option, with every
 * outside dependency handed in. Nothing here imports `obsidian`, so the full
 * path is covered by unit tests.
 */

export interface PipelineDeps {
  /** Obsidian's `parseYaml` in production; `js-yaml`'s `load` in tests. */
  parseYaml(text: string): unknown;
  reader: VaultReader;
  palette: ChartPalette;
  /** Path of the note holding the block, for resolving relative links. */
  sourcePath: string;
  /** Size for blocks that leave `width` / `height` out (the plugin setting). */
  defaultSize?: Size;
}

export interface BuiltChart {
  /** Ready to draw in the note: recoloured for the current theme. */
  option: Record<string, unknown>;
  /** Flint's option before theming, so an export can be re-inked for another page. */
  baseOption: Record<string, unknown>;
  chartType: string;
  title?: string;
  /** True when the chart type was chosen for the author rather than written. */
  recommended: boolean;
  rowCount: number;
  width?: number;
  height?: number;
}

export async function buildChart(text: string, deps: PipelineDeps): Promise<Result<BuiltChart>> {
  let raw: unknown;
  try {
    raw = deps.parseYaml(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ message: `This block is not valid YAML: ${detail}` }] };
  }
  if (raw === null || raw === undefined) {
    return {
      ok: false,
      errors: [{ message: "This flint block is empty. Add at least a chart type and some data." }],
    };
  }

  const normalized = normalizeBlock(raw, registry, {
    ...(deps.defaultSize !== undefined ? { defaultSize: deps.defaultSize } : {}),
  });
  if (!normalized.ok) return normalized;
  const block = normalized.value;
  const warnings: BlockIssue[] = [...normalized.warnings];

  const rows = await resolveRows(block.data, deps.reader, deps.sourcePath);
  if (!rows.ok) return rows;
  warnings.push(...rows.warnings);

  const semanticTypes = inferSemanticTypes(rows.value, block.semanticTypes);
  const { chartType, recommended } = recommendFrom(block.chartType, rows.value, semanticTypes);
  if (chartType === undefined) {
    return {
      ok: false,
      errors: [{
        message: "Could not work out a chart type from this data. Add `chartType:` explicitly.",
        key: "chartType",
      }],
    };
  }
  if (recommended) {
    warnings.push({
      message: `No \`chartType\` given, so "${chartType}" was chosen from the data.`,
      key: "chartType",
    });
  }

  const assembled = assembleChart(buildInput(block, rows.value, chartType));
  if (!assembled.ok) return assembled;

  return {
    ok: true,
    value: {
      option: applyObsidianTheme(assembled.value.option, deps.palette),
      baseOption: assembled.value.option,
      chartType,
      ...(block.title !== undefined ? { title: block.title } : {}),
      recommended,
      rowCount: rows.value.length,
      ...(assembled.value.width !== undefined ? { width: assembled.value.width } : {}),
      ...(assembled.value.height !== undefined ? { height: assembled.value.height } : {}),
    },
    warnings,
  };
}
