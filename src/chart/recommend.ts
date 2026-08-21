import { ecRecommendChartTypes } from "flint-chart/echarts";
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
