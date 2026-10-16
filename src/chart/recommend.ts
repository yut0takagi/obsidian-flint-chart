import { ecRecommendChartTypes, ecRecommendCharts } from "flint-chart/echarts";
import type { Row, SemanticTypeValue } from "../types";

/**
 * Lets an author write only data and encodings. When `chartType` is absent we
 * ask Flint what its data supports and take the first suggestion.
 */
export function recommendFrom(
  requested: string | undefined,
  rows: Row[],
  semanticTypes: Record<string, SemanticTypeValue>,
): { chartType: string | undefined; recommended: boolean } {
  if (requested !== undefined) return { chartType: requested, recommended: false };
  if (rows.length === 0) return { chartType: undefined, recommended: true };

  try {
    const suggestions = ecRecommendChartTypes(rows, asStrings(semanticTypes));
    const first = Array.isArray(suggestions) ? suggestions[0] : undefined;
    return { chartType: typeof first === "string" ? first : undefined, recommended: true };
  } catch {
    return { chartType: undefined, recommended: true };
  }
}

/** A chart type with columns already bound to its channels. */
export interface ChartSuggestion {
  chartType: string;
  /** Channel → column name. */
  encodings: Record<string, string>;
}

/**
 * Ranked chart types for `rows`, each with its channels filled in, for the
 * "create a chart from this table" command. Flint drops any suggestion whose
 * required channels it cannot fill.
 */
export function recommendCharts(
  rows: Row[],
  semanticTypes: Record<string, SemanticTypeValue>,
  max: number,
): ChartSuggestion[] {
  if (rows.length === 0 || max <= 0) return [];
  try {
    const suggestions = ecRecommendCharts(rows, asStrings(semanticTypes), { max });
    if (!Array.isArray(suggestions)) return [];
    return suggestions.filter(isSuggestion).slice(0, max);
  } catch {
    return [];
  }
}

function isSuggestion(value: unknown): value is ChartSuggestion {
  if (value === null || typeof value !== "object") return false;
  const { chartType, encodings } = value as Record<string, unknown>;
  return (
    typeof chartType === "string" &&
    encodings !== null &&
    typeof encodings === "object" &&
    Object.values(encodings as Record<string, unknown>).every((column) => typeof column === "string")
  );
}

/** Flint's recommender takes bare type names, not annotation objects. */
function asStrings(semanticTypes: Record<string, SemanticTypeValue>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [field, value] of Object.entries(semanticTypes)) {
    out[field] = typeof value === "string" ? value : value.semanticType;
  }
  return out;
}

/** Kept as the descriptive name used by callers and tests. */
export const resolveChartType = recommendFrom;
