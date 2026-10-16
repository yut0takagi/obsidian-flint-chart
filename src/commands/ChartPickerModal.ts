import { FuzzySuggestModal, Modal, Platform } from "obsidian";
import type { App, TFile } from "obsidian";
import { channelSummary, suggestionsFor, verifyCandidate } from "./chartFromData";
import type { Candidate, CandidateDeps, DataInput } from "./chartFromData";
import type { ChartHost, ChartInstance } from "../render/ChartView";

/** Each preview is a live ECharts canvas, so phones get fewer of them. */
export function candidateLimit(): number {
  return Platform.isMobile ? 2 : 4;
}

/**
 * Shows Flint's suggestions for a table as small previews and inserts the one
 * the author picks. Candidates are tried one at a time with a pause between,
 * so the modal opens at once and a large table does not freeze it.
 */
export class ChartPickerModal extends Modal {
  private readonly previews: ChartInstance[] = [];
  private closed = false;

  constructor(
    app: App,
    private readonly input: DataInput,
    private readonly deps: CandidateDeps,
    private readonly host: ChartHost,
    private readonly onPick: (candidate: Candidate) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText("Pick a chart");
    this.modalEl.addClass("flint-chart-picker-modal");
    const status = this.contentEl.createDiv({ cls: "flint-chart-picker-status", text: "Trying chart types…" });
    const grid = this.contentEl.createDiv({ cls: "flint-chart-picker" });
    void this.fill(grid, status);
  }

  onClose(): void {
    this.closed = true;
    for (const preview of this.previews) preview.dispose();
    this.previews.length = 0;
    this.contentEl.empty();
  }

  private async fill(grid: HTMLElement, status: HTMLElement): Promise<void> {
    const limit = candidateLimit();
    let shown = 0;
    for (const suggestion of suggestionsFor(this.input.rows, limit)) {
      if (this.closed || shown >= limit) break;
      await nextTask();
      const candidate = await verifyCandidate(suggestion, this.input, this.deps);
      if (this.closed) return;
      if (candidate === undefined) continue;
      this.addCard(grid, candidate);
      shown++;
    }
    if (this.closed) return;
    status.setText(
      shown === 0
        ? "Flint found no chart for this data. It needs a header row and at least one column of numbers or categories."
        : "Pick one to insert it. Every line of the block can be edited afterwards.",
    );
  }

  private addCard(grid: HTMLElement, candidate: Candidate): void {
    const card = grid.createEl("button", { cls: "flint-chart-candidate" });
    card.createDiv({ cls: "flint-chart-candidate-title", text: candidate.suggestion.chartType });
    card.createDiv({ cls: "flint-chart-candidate-channels", text: channelSummary(candidate.suggestion.encodings) });
    const frame = card.createDiv({ cls: "flint-chart-candidate-preview" });
    card.addEventListener("click", () => {
      this.onPick(candidate);
      this.close();
    });
    this.drawPreview(frame, candidate);
  }

  /** Drawn at the size the block will have, then scaled down to the card. */
  private drawPreview(frame: HTMLElement, candidate: Candidate): void {
    const width = candidate.chart.width ?? 560;
    const height = candidate.chart.height ?? 340;
    const scale = Math.min(1, (frame.clientWidth || width) / width);
    const stage = frame.createDiv({ cls: "flint-chart-candidate-stage" });
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.transform = `scale(${scale})`;
    frame.style.height = `${Math.ceil(height * scale)}px`;

    try {
      const preview = this.host.init(stage, "canvas", { width, height });
      this.previews.push(preview);
      preview.setOption({ ...candidate.chart.option, animation: false }, true);
    } catch {
      // The candidate already built once; a preview that will not paint should
      // not stop the author picking it.
      stage.remove();
    }
  }
}

/** Lets the author choose a CSV, TSV or JSON file when the cursor is not in a table. */
export class DataFileModal extends FuzzySuggestModal<TFile> {
  constructor(app: App, private readonly files: TFile[], private readonly onChoose: (file: TFile) => void) {
    super(app);
    this.setPlaceholder("Pick a CSV, TSV or JSON file to chart");
  }

  getItems(): TFile[] {
    return this.files;
  }

  getItemText(file: TFile): string {
    return file.path;
  }

  onChooseItem(file: TFile): void {
    this.onChoose(file);
  }
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
