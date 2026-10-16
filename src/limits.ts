/**
 * How big a chart may get. Sizes come from the block text, so a typo such as
 * `width: 100000` must not make the plugin allocate a canvas the browser
 * cannot hold — that freezes the note on every render and every export.
 */

/**
 * Largest side of a chart, in CSS pixels. Wider than any screen, and 4096²
 * is the canvas area iOS Safari will allocate at all.
 */
export const MAX_CHART_PX = 4096;

/** Largest side of an exported bitmap, after the export scale. */
export const MAX_EXPORT_SIDE = 8192;

/** Largest exported bitmap, in pixels: the same iOS canvas area limit. */
export const MAX_EXPORT_AREA = MAX_CHART_PX * MAX_CHART_PX;

export function capChartPx(value: number): number {
  return Math.min(value, MAX_CHART_PX);
}

/**
 * The export scale to use for a chart of `size`: the one asked for, lowered
 * when the bitmap would pass either limit above.
 */
export function exportPixelRatio(size: { width: number; height: number }, requested: number): number {
  const width = positive(size.width);
  const height = positive(size.height);
  const ratio = Math.min(
    positive(requested),
    MAX_EXPORT_SIDE / width,
    MAX_EXPORT_SIDE / height,
    Math.sqrt(MAX_EXPORT_AREA / (width * height)),
  );
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
}

function positive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}
