import { ChartView } from "./ChartView";
import { readBackground, readPalette } from "./palette";
import { applyObsidianTheme } from "../chart/applyObsidianTheme";
import { buildChart } from "../chart/pipeline";
import { exportAppearance } from "../commands/exportPng";
import type { ChartActions, ChartHost, ChartRenderer } from "./ChartView";
import type { BuiltChart } from "../chart/pipeline";
import type { PngOptions, PngSource } from "../commands/exportPng";
import type { VaultReader } from "../data/resolveRows";
import type { BlockIssue, Size } from "../types";

/**
 * One `flint` code block: renders it, remembers which vault files it read so it
 * can refresh when they change, and tears the chart down when the note closes.
 *
 * Settings are read at render time rather than captured, so changing the
 * renderer in preferences takes effect on charts that are already on screen.
 */
export interface ControllerSettings {
  renderer: ChartRenderer;
  showRecommendationNotes: boolean;
  /** Used for whichever of `width` / `height` a block leaves out. */
  defaultSize: Size;
}

export interface ControllerDeps {
  parseYaml(text: string): unknown;
  reader: VaultReader;
  host: ChartHost;
  settings(): ControllerSettings;
  /**
   * Opens the chart's actions (copy, save). `anchor` is the button when it was
   * clicked, undefined for a right-click on the chart. Omit for no button.
   */
  onActions?(event: MouseEvent, controller: BlockController, anchor: HTMLElement | undefined): void;
  /** Draws the actions button's icon. */
  decorateActions?(button: HTMLElement): void;
}

export class BlockController implements PngSource {
  private view: ChartView | undefined;
  private viewRenderer: ChartRenderer | undefined;
  private dependencies = new Set<string>();
  private built: BuiltChart | undefined;

  constructor(
    private readonly container: HTMLElement,
    private readonly source: string,
    private readonly sourcePath: string,
    private readonly deps: ControllerDeps,
  ) {}

  dependsOn(path: string): boolean {
    return this.dependencies.has(path);
  }

  notePath(): string {
    return this.sourcePath;
  }

  title(): string | undefined {
    return this.built?.title;
  }

  /**
   * The chart as a PNG data URL, whichever renderer draws it on screen, inked
   * for the background asked for. The theme is read again here, so an export
   * after a theme switch matches what the note now shows.
   */
  pngDataUrl(options: PngOptions): string | undefined {
    if (this.built === undefined) return undefined;
    const { palette, backgroundColor } = exportAppearance(
      options.background,
      readPalette(this.container),
      readBackground(this.container),
    );
    return this.view?.snapshot({
      pixelRatio: options.scale,
      backgroundColor,
      option: applyObsidianTheme(this.built.baseOption, palette),
    });
  }

  async render(): Promise<void> {
    const settings = this.deps.settings();
    const view = this.ensureView(settings.renderer);

    this.dependencies = new Set();
    const tracking: VaultReader = {
      resolve: (path, from) => {
        const resolved = this.deps.reader.resolve(path, from);
        if (resolved !== undefined) this.dependencies.add(resolved);
        return resolved;
      },
      read: (path) => this.deps.reader.read(path),
    };

    const result = await buildChart(this.source, {
      parseYaml: this.deps.parseYaml,
      reader: tracking,
      palette: readPalette(this.container),
      sourcePath: this.sourcePath,
      defaultSize: settings.defaultSize,
    });

    if (!result.ok) {
      this.built = undefined;
      view.showIssues({ errors: result.errors, warnings: [], source: this.source });
      return;
    }
    this.built = result.value;

    const warnings = result.warnings.filter(
      (issue: BlockIssue) =>
        settings.showRecommendationNotes || !(issue.key === "chartType" && result.value.recommended),
    );
    view.show(result.value, warnings, this.source);
  }

  resize(): void {
    this.view?.resize();
  }

  destroy(): void {
    this.view?.destroy();
    this.view = undefined;
    this.viewRenderer = undefined;
    this.built = undefined;
  }

  /** A renderer change means a new ECharts instance, so the old one is disposed. */
  private ensureView(renderer: ChartRenderer): ChartView {
    if (this.view !== undefined && this.viewRenderer === renderer) return this.view;
    this.view?.destroy();
    this.view = new ChartView(this.container, this.deps.host, renderer, this.actions());
    this.viewRenderer = renderer;
    return this.view;
  }

  private actions(): ChartActions | undefined {
    const open = this.deps.onActions;
    if (open === undefined) return undefined;
    return {
      label: "Chart actions",
      onClick: (event, anchor) => open(event, this, anchor),
      ...(this.deps.decorateActions !== undefined ? { decorate: this.deps.decorateActions } : {}),
    };
  }
}
