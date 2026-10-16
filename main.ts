import {
  MarkdownRenderChild,
  Notice,
  Plugin,
  TFile,
  base64ToArrayBuffer,
  normalizePath,
  parseYaml,
} from "obsidian";
import type { Editor } from "obsidian";
import { BlockController } from "./src/render/BlockController";
import { echartsHost } from "./src/render/echartsHost";
import { readPalette } from "./src/render/palette";
import { exportCharts } from "./src/commands/exportPng";
import { fence, insertAfterTable, onOwnLine, tableData } from "./src/commands/chartFromData";
import { ChartPickerModal, DataFileModal } from "./src/commands/ChartPickerModal";
import { CHART_TEMPLATE, TABLE_TEMPLATE } from "./src/commands/template";
import { resolveRows } from "./src/data/resolveRows";
import { parseMarkdownTable, tableAt } from "./src/parse/markdownTable";
import { FlintChartSettingTab } from "./src/settings/SettingsTab";
import { DEFAULT_SETTINGS } from "./src/settings/types";
import type { CandidateDeps, DataInput } from "./src/commands/chartFromData";
import type { ExportTarget } from "./src/commands/exportPng";
import type { VaultReader } from "./src/data/resolveRows";
import type { FlintChartSettings } from "./src/settings/types";

const LANGUAGES = ["flint", "flint-chart"];

/** Files the "create chart" command offers when the cursor is not in a table. */
const DATA_EXTENSIONS = new Set(["csv", "tsv", "json"]);

export default class FlintChartPlugin extends Plugin {
  settings: FlintChartSettings = { ...DEFAULT_SETTINGS };
  private readonly controllers = new Set<BlockController>();

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<FlintChartSettings> | null) };
    this.addSettingTab(new FlintChartSettingTab(this.app, this));

    for (const language of LANGUAGES) {
      this.registerMarkdownCodeBlockProcessor(language, (source, element, context) => {
        const container = element.createDiv({ cls: "flint-chart-block" });
        const controller = new BlockController(container, source, context.sourcePath, {
          parseYaml,
          reader: this.vaultReader(),
          host: echartsHost,
          settings: () => ({
            renderer: this.settings.renderer,
            showRecommendationNotes: this.settings.showRecommendationNotes,
            defaultSize: { width: this.settings.defaultWidth, height: this.settings.defaultHeight },
          }),
        });
        this.controllers.add(controller);

        const observer = new ResizeObserver(() => controller.resize());
        observer.observe(container);

        context.addChild(
          new DisposingChild(element, () => {
            observer.disconnect();
            this.controllers.delete(controller);
            controller.destroy();
          }),
        );

        void controller.render();
      });
    }

    // Theme switches change every colour the charts borrow from the vault.
    this.registerEvent(this.app.workspace.on("css-change", () => this.rerenderAll()));

    // A block reading a CSV or a table should follow that file.
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        for (const controller of this.controllers) {
          if (controller.dependsOn(file.path)) void controller.render();
        }
      }),
    );

    this.addCommand({
      id: "insert-chart-block",
      name: "Insert chart block",
      editorCallback: (editor) => editor.replaceSelection(CHART_TEMPLATE),
    });

    this.addCommand({
      id: "insert-chart-block-from-table",
      name: "Insert chart block reading a table",
      editorCallback: (editor) => editor.replaceSelection(TABLE_TEMPLATE),
    });

    this.addCommand({
      id: "create-chart-from-data",
      name: "Create chart from table or data file",
      editorCallback: (editor, context) => this.createChartFromData(editor, context.file?.path ?? ""),
    });

    this.addCommand({
      id: "export-charts-png",
      name: "Export charts in this note as PNG",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file === null) return false;
        const targets = [...this.controllers].filter((c) => c.notePath() === file.path);
        if (targets.length === 0) return false;
        if (!checking) void this.runExport(file, targets);
        return true;
      },
    });
  }

  onunload(): void {
    for (const controller of this.controllers) controller.destroy();
    this.controllers.clear();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  rerenderAll(): void {
    for (const controller of this.controllers) void controller.render();
  }

  /** The table under the cursor if there is one, otherwise a data file the author picks. */
  private createChartFromData(editor: Editor, notePath: string): void {
    const text = editor.getValue();
    const lines = text.split("\n");
    // The line just below a table counts too: in Live Preview that is where a
    // click next to the table usually leaves the cursor.
    const cursorLine = editor.getCursor().line;
    const location = tableAt(lines, cursorLine) ?? tableAt(lines, cursorLine - 1);

    if (location !== undefined) {
      const rows = parseMarkdownTable(lines.slice(location.start, location.end + 1).join("\n"));
      if (rows.length === 0) {
        new Notice("This table has no rows to chart yet.");
        return;
      }
      const input: DataInput = { rows, data: tableData(notePath, text, location), path: notePath, content: text };
      this.pickChart(input, notePath, (block) => {
        // Re-read the lines: the note may have changed while the picker was open.
        const at = insertAfterTable(editor.getValue().split("\n"), location.end, block);
        editor.replaceRange(at.text, { line: at.line, ch: at.ch });
      });
      return;
    }

    const files = this.app.vault.getFiles().filter((file) => DATA_EXTENSIONS.has(file.extension.toLowerCase()));
    if (files.length === 0) {
      new Notice("Put the cursor in a Markdown table, or add a CSV, TSV or JSON file to the vault.");
      return;
    }
    new DataFileModal(this.app, files, (file) => void this.chartFromFile(file, editor, notePath)).open();
  }

  private async chartFromFile(file: TFile, editor: Editor, notePath: string): Promise<void> {
    let content: string;
    try {
      content = await this.app.vault.cachedRead(file);
    } catch (error) {
      new Notice(`Could not read ${file.path}: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const rows = await resolveRows(
      { kind: "file", path: file.path },
      { resolve: () => file.path, read: async () => content },
      notePath,
    );
    if (!rows.ok) {
      new Notice(rows.errors[0]?.message ?? `Could not read rows from ${file.path}.`);
      return;
    }
    const input: DataInput = { rows: rows.value, data: { kind: "source", source: file.path }, path: file.path, content };
    this.pickChart(input, notePath, (block) => {
      const cursor = editor.getCursor();
      const line = editor.getLine(cursor.line);
      editor.replaceSelection(onOwnLine(line.slice(0, cursor.ch), line.slice(cursor.ch), block));
    });
  }

  private pickChart(input: DataInput, notePath: string, insert: (block: string) => void): void {
    const deps: CandidateDeps = {
      parseYaml,
      palette: readPalette(document.body),
      sourcePath: notePath,
      defaultSize: { width: this.settings.defaultWidth, height: this.settings.defaultHeight },
    };
    new ChartPickerModal(this.app, input, deps, echartsHost, (candidate) => insert(fence(candidate.body))).open();
  }

  private vaultReader(): VaultReader {
    return {
      resolve: (path, from) => {
        const direct = this.app.vault.getAbstractFileByPath(normalizePath(path));
        if (direct instanceof TFile) return direct.path;
        const linked = this.app.metadataCache.getFirstLinkpathDest(path, from);
        return linked === null ? undefined : linked.path;
      },
      read: async (path) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error(`\`${path}\` is not a file`);
        return this.app.vault.cachedRead(file);
      },
    };
  }

  private async runExport(file: TFile, controllers: BlockController[]): Promise<void> {
    const target: ExportTarget = {
      exists: (path) => this.app.vault.getAbstractFileByPath(path) !== null,
      writeBinary: async (path, data) => {
        await this.app.vault.createBinary(path, data);
      },
      ensureFolder: async (path) => {
        if (this.app.vault.getAbstractFileByPath(path) === null) {
          await this.app.vault.createFolder(path).catch(() => undefined);
        }
      },
      decodeBase64: (base64) => base64ToArrayBuffer(base64),
    };

    try {
      const outcome = await exportCharts(controllers, target, {
        notePath: file.path,
        folder: normalizePath(this.settings.exportFolder),
        scale: this.settings.exportScale,
      });
      const skipped = outcome.skipped === 0 ? "" : `, ${outcome.skipped} skipped`;
      new Notice(
        outcome.written.length === 0
          ? "No charts were ready to export."
          : `Exported ${outcome.written.length} chart(s)${skipped}.`,
      );
    } catch (error) {
      new Notice(`Chart export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/** Runs the teardown Obsidian hands us when the note or preview goes away. */
class DisposingChild extends MarkdownRenderChild {
  constructor(element: HTMLElement, private readonly dispose: () => void) {
    super(element);
  }

  onunload(): void {
    this.dispose();
  }
}
