import { inferSemanticTypes } from "../data/inferSemanticTypes";
import type { ChartAssemblyInput, FlintBlock, Row } from "../types";

/**
 * Turns a normalised block plus resolved rows into Flint's `ChartAssemblyInput`.
 *
 * `chartType` is passed in rather than read off the block because it may have
 * been recommended from the data when the author left it out.
 */
export function buildInput(
  block: FlintBlock,
  rows: Row[],
  chartType: string,
  fallbackTheme?: unknown,
): ChartAssemblyInput {
  const semanticTypes = inferSemanticTypes(rows, block.semanticTypes);
  const theme = block.themeSpec ?? fallbackTheme;

  return {
    data: { values: rows },
    ...(Object.keys(semanticTypes).length > 0 ? { semantic_types: semanticTypes } : {}),
    ...(block.fieldDisplayNames !== undefined ? { field_display_names: block.fieldDisplayNames } : {}),
    chart_spec: {
      chartType,
      ...(block.title !== undefined ? { title: block.title } : {}),
      ...(block.subtitle !== undefined ? { subtitle: block.subtitle } : {}),
      encodings: block.encodings,
      ...(block.baseSize !== undefined ? { baseSize: block.baseSize } : {}),
      ...(block.canvasSize !== undefined ? { canvasSize: block.canvasSize } : {}),
      ...(block.chartProperties !== undefined ? { chartProperties: block.chartProperties } : {}),
    },
    ...(theme !== undefined ? { theme_spec: theme } : {}),
  };
}
