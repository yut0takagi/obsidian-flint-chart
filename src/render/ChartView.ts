import { renderIssues } from "./errorView";
import { capChartPx, exportPixelRatio } from "../limits";
import type { IssueReport } from "./errorView";
import type { BlockIssue } from "../types";

/**
 * Owns one chart inside one code block: creates the ECharts instance, keeps it
 * across re-renders, and — the part that matters — always disposes it.
 *
 * ECharts instances hold a canvas, listeners and an animation loop. An
 * undisposed one leaks for as long as the vault stays open, so `destroy()` is
 * the single exit and is safe to call more than once.
 *
 * The host is injected so this file needs neither `echarts` nor `obsidian`.
 */

export interface ChartInstance {
  setOption(option: Record<string, unknown>, notMerge?: boolean): void;
  resize(): void;
  dispose(): void;
  getDataURL(options?: Record<string, unknown>): string;
}

export interface ChartHost {
  /** Without `size` the chart follows the element; with it, the element may be detached. */
  init(element: HTMLElement, renderer: ChartRenderer, size?: PixelSize): ChartInstance;
}

export interface PixelSize {
  width: number;
  height: number;
}

export type ChartRenderer = "canvas" | "svg";

export interface ChartPayload {
  option: Record<string, unknown>;
  width?: number;
  height?: number;
}

export interface SnapshotOptions {
  pixelRatio: number;
  backgroundColor: string;
  /** Draw this option instead of the one on screen, e.g. restyled for a white page. */
  option?: Record<string, unknown>;
}

/** A button over the chart, plus right-click on it, that opens the chart's actions. */
export interface ChartActions {
  label: string;
  /** `anchor` is the button when it was clicked, undefined for a right-click on the chart. */
  onClick(event: MouseEvent, anchor: HTMLElement | undefined): void;
  /** Draws the button's icon; without it the button shows an ellipsis. */
  decorate?(button: HTMLElement): void;
}

/** Used only when neither the element nor Flint knows how big the chart is. */
const SNAPSHOT_FALLBACK: PixelSize = { width: 600, height: 400 };

export class ChartView {
  private instance: ChartInstance | undefined;
  private canvas: HTMLElement | undefined;
  private issues: HTMLElement | undefined;
  private shown: ChartPayload | undefined;
  private actionsButton: HTMLElement | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly host: ChartHost,
    private readonly renderer: ChartRenderer,
    private readonly actions?: ChartActions,
  ) {}

  /** Draws the chart, optionally with non-fatal notes underneath it. */
  show(chart: ChartPayload, warnings: BlockIssue[] = [], source = ""): void {
    const canvas = this.ensureCanvas();
    // Flint may stretch a chart past the size the block asked for; hold it to the limit.
    if (chart.height !== undefined) canvas.style.height = `${capChartPx(chart.height)}px`;
    if (chart.width !== undefined) canvas.style.maxWidth = `${capChartPx(chart.width)}px`;

    this.instance ??= this.host.init(canvas, this.renderer);
    this.instance.setOption(chart.option, true);
    this.shown = chart;
    this.ensureActionsButton();

    this.ensureIssues();
    renderIssues(this.issues!, { errors: [], warnings, source });
  }

  /** Replaces the chart with a problem report, releasing the instance first. */
  showIssues(report: IssueReport): void {
    this.releaseInstance();
    this.removeActionsButton();
    this.canvas?.remove();
    this.canvas = undefined;
    this.ensureIssues();
    renderIssues(this.issues!, report);
  }

  resize(): void {
    this.instance?.resize();
  }

  /**
   * Paints the chart once more on a detached canvas and returns it as a PNG
   * data URL. The on-screen instance is never read: the SVG renderer can only
   * return SVG, whatever `type` is asked for, and a canvas still running its
   * entry animation would be caught half-drawn.
   */
  snapshot(options: SnapshotOptions): string | undefined {
    if (this.instance === undefined || this.shown === undefined) return undefined;
    const option = options.option ?? this.shown.option;
    const size = this.snapshotSize();
    const instance = this.host.init(document.createElement("div"), "canvas", size);
    try {
      instance.setOption({ ...option, animation: false }, true);
      return instance.getDataURL({
        type: "png",
        pixelRatio: exportPixelRatio(size, options.pixelRatio),
        backgroundColor: options.backgroundColor,
      });
    } finally {
      instance.dispose();
    }
  }

  /** The only exit. Idempotent. */
  destroy(): void {
    this.releaseInstance();
    this.removeActionsButton();
    this.canvas?.remove();
    this.canvas = undefined;
    this.issues?.remove();
    this.issues = undefined;
  }

  private releaseInstance(): void {
    this.instance?.dispose();
    this.instance = undefined;
    this.shown = undefined;
  }

  /** What the reader sees, falling back to the size Flint laid the chart out at. */
  private snapshotSize(): PixelSize {
    const width = this.canvas?.clientWidth ?? 0;
    const height = this.canvas?.clientHeight ?? 0;
    return {
      width: capChartPx(width > 0 ? width : this.shown?.width ?? SNAPSHOT_FALLBACK.width),
      height: capChartPx(height > 0 ? height : this.shown?.height ?? SNAPSHOT_FALLBACK.height),
    };
  }

  private ensureCanvas(): HTMLElement {
    if (this.canvas === undefined) {
      const canvas = document.createElement("div");
      canvas.className = "flint-chart-canvas";
      const actions = this.actions;
      if (actions !== undefined) {
        canvas.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          actions.onClick(event, undefined);
        });
      }
      this.container.insertBefore(canvas, this.issues ?? null);
      this.canvas = canvas;
    }
    return this.canvas;
  }

  /**
   * A sibling of the chart element rather than a child: ECharts owns that
   * element's contents and may clear them.
   */
  private ensureActionsButton(): void {
    const actions = this.actions;
    if (actions === undefined || this.actionsButton !== undefined) return;
    const button = document.createElement("button");
    button.className = "flint-chart-actions clickable-icon";
    button.setAttribute("aria-label", actions.label);
    button.textContent = "\u22ef";
    actions.decorate?.(button);
    // In Live Preview the editor would otherwise take the press and move the
    // cursor into the block, swapping the chart for its source.
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.onClick(event, button);
    });
    this.container.insertBefore(button, this.container.firstChild);
    this.actionsButton = button;
  }

  private removeActionsButton(): void {
    this.actionsButton?.remove();
    this.actionsButton = undefined;
  }

  private ensureIssues(): HTMLElement {
    if (this.issues === undefined) {
      const issues = document.createElement("div");
      this.container.appendChild(issues);
      this.issues = issues;
    }
    return this.issues;
  }
}
