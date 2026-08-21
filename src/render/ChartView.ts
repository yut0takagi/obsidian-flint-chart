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
  init(element: HTMLElement, renderer: ChartRenderer): ChartInstance;
}

export type ChartRenderer = "canvas" | "svg";

export interface ChartPayload {
  option: Record<string, unknown>;
  width?: number;
  height?: number;
}

export class ChartView {
  private instance: ChartInstance | undefined;
  private canvas: HTMLElement | undefined;
  private issues: HTMLElement | undefined;

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

  dataUrl(options?: Record<string, unknown>): string | undefined {
    return this.instance?.getDataURL(options);
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
