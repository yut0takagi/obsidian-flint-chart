import type { ChartRenderer } from "../render/ChartView";

export interface FlintChartSettings {
  renderer: ChartRenderer;
  defaultWidth: number;
  defaultHeight: number;
  /** Vault folder PNG exports are written to. Empty means beside the note. */
  exportFolder: string;
  exportScale: number;
  /** Show the note saying a chart type was chosen automatically. */
  showRecommendationNotes: boolean;
}

export const DEFAULT_SETTINGS: FlintChartSettings = {
  renderer: "canvas",
  defaultWidth: 560,
  defaultHeight: 340,
  exportFolder: "",
  exportScale: 2,
  showRecommendationNotes: true,
};
