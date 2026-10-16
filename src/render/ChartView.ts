import { renderIssues } from "./errorView";
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

/** Used only when neither the element nor Flint knows how big the chart is. */
const SNAPSHOT_FALLBACK: PixelSize = { width: 600, height: 400 };

export class ChartView {
  private instance: ChartInstance | undefined;
  private canvas: HTMLElement | undefined;
  private issues: HTMLElement | undefined;
  private shown: ChartPayload | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly host: ChartHost,
    private readonly renderer: ChartRenderer,
  ) {}

  /** Draws the chart, optionally with non-fatal notes underneath it. */
  show(chart: ChartPayload, warnings: BlockIssue[] = [], source = ""): void {
    const canvas = this.ensureCanvas();
    if (chart.height !== undefined) canvas.style.height = `${chart.height}px`;
    if (chart.width !== undefined) canvas.style.maxWidth = `${chart.width}px`;

    this.instance ??= this.host.init(canvas, this.renderer);
    this.instance.setOption(chart.option, true);
    this.shown = chart;

    this.ensureIssues();
    renderIssues(this.issues!, { errors: [], warnings, source });
  }

  /** Replaces the chart with a problem report, releasing the instance first. */
  showIssues(report: IssueReport): void {
    this.releaseInstance();
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
    const instance = this.host.init(document.createElement("div"), "canvas", this.snapshotSize());
    try {
      instance.setOption({ ...option, animation: false }, true);
      return instance.getDataURL({
        type: "png",
        pixelRatio: options.pixelRatio,
        backgroundColor: options.backgroundColor,
      });
    } finally {
      instance.dispose();
    }
  }

  /** The only exit. Idempotent. */
  destroy(): void {
    this.releaseInstance();
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
      width: width > 0 ? width : this.shown?.width ?? SNAPSHOT_FALLBACK.width,
      height: height > 0 ? height : this.shown?.height ?? SNAPSHOT_FALLBACK.height,
    };
  }

  private ensureCanvas(): HTMLElement {
    if (this.canvas === undefined) {
      const canvas = document.createElement("div");
      canvas.className = "flint-chart-canvas";
      this.container.insertBefore(canvas, this.issues ?? null);
      this.canvas = canvas;
    }
    return this.canvas;
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
