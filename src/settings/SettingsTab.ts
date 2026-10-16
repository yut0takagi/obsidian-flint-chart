import { PluginSettingTab, Setting, debounce } from "obsidian";
import type { App, Plugin } from "obsidian";
import { EXPORT_BACKGROUNDS } from "../commands/exportPng";
import type { ExportBackground } from "../commands/exportPng";
import type { FlintChartSettings } from "./types";

/** Shared by the setting and the chart's actions menu. */
export const BACKGROUND_LABELS: Record<ExportBackground, string> = {
  theme: "Note theme",
  white: "White",
  transparent: "Transparent",
};

interface Host extends Plugin {
  settings: FlintChartSettings;
  saveSettings(): Promise<void>;
  rerenderAll(): void;
}

export class FlintChartSettingTab extends PluginSettingTab {
  /** Size fields change on every keystroke; redraw once typing pauses. */
  private readonly rerenderSoon = debounce(() => this.plugin.rerenderAll(), 400, true);

  constructor(app: App, private readonly plugin: Host) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Renderer")
      .setDesc("Canvas is faster for large datasets. SVG stays crisp when you zoom.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("canvas", "Canvas")
          .addOption("svg", "SVG")
          .setValue(this.plugin.settings.renderer)
          .onChange(async (value) => {
            this.plugin.settings.renderer = value === "svg" ? "svg" : "canvas";
            await this.plugin.saveSettings();
            this.plugin.rerenderAll();
          }),
      );

    new Setting(containerEl)
      .setName("Default width")
      .setDesc("Used when a block does not set `width`. Charts still shrink to fit the note.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.defaultWidth))
          .onChange(async (value) => {
            const width = Number(value);
            if (Number.isFinite(width) && width > 0) {
              this.plugin.settings.defaultWidth = width;
              await this.plugin.saveSettings();
              this.rerenderSoon();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Default height")
      .setDesc("Used when a block does not set `height`.")
      .addText((text) =>
        text
          .setValue(String(this.plugin.settings.defaultHeight))
          .onChange(async (value) => {
            const height = Number(value);
            if (Number.isFinite(height) && height > 0) {
              this.plugin.settings.defaultHeight = height;
              await this.plugin.saveSettings();
              this.rerenderSoon();
            }
          }),
      );

    new Setting(containerEl)
      .setName("Note automatic chart types")
      .setDesc("Show a line under the chart when the chart type was picked from the data.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showRecommendationNotes)
          .onChange(async (value) => {
            this.plugin.settings.showRecommendationNotes = value;
            await this.plugin.saveSettings();
            this.plugin.rerenderAll();
          }),
      );

    new Setting(containerEl).setName("PNG export").setHeading();

    new Setting(containerEl)
      .setName("Background")
      .setDesc(
        "What exported and copied images sit on. White also darkens text and axes, so a chart from a " +
          "dark theme stays readable on a white slide. Transparent keeps the theme's text colours.",
      )
      .addDropdown((dropdown) => {
        for (const background of EXPORT_BACKGROUNDS) dropdown.addOption(background, BACKGROUND_LABELS[background]);
        dropdown.setValue(this.plugin.settings.exportBackground).onChange(async (value) => {
          const chosen = EXPORT_BACKGROUNDS.find((background) => background === value);
          if (chosen === undefined) return;
          this.plugin.settings.exportBackground = chosen;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Export folder")
      .setDesc("Vault-relative folder for exported images. Leave empty to save beside the note.")
      .addText((text) =>
        text
          .setPlaceholder("Attachments/charts")
          .setValue(this.plugin.settings.exportFolder)
          .onChange(async (value) => {
            this.plugin.settings.exportFolder = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Export scale")
      .setDesc("Pixel multiplier. 2 or 3 keeps charts sharp in slides.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 4, 1)
          .setDynamicTooltip()
          .setValue(this.plugin.settings.exportScale)
          .onChange(async (value) => {
            this.plugin.settings.exportScale = value;
            await this.plugin.saveSettings();
          }),
      );
  }
}
