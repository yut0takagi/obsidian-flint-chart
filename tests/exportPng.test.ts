import { describe, expect, it, vi } from "vitest";
import { exportAppearance, exportChart, exportCharts, exportFolder, fileSlug, pngBlob } from "../src/commands/exportPng";
import { LIGHT_PALETTE } from "../src/render/palette";
import type { ExportTarget } from "../src/commands/exportPng";
import type { PngSource } from "../src/commands/exportPng";

const chart = (dataUrl: string | undefined): PngSource => ({ pngDataUrl: () => dataUrl });

const PNG = "data:image/png;base64,QUJD";

const target = (existing: string[] = []) => {
  const files = new Set(existing);
  const impl: ExportTarget = {
    exists: (path) => files.has(path),
    writeBinary: vi.fn(async (path) => {
      files.add(path);
    }),
    ensureFolder: vi.fn(async () => undefined),
    decodeBase64: (base64) => new TextEncoder().encode(base64).buffer as ArrayBuffer,
  };
  return { impl, files };
};

describe("exportCharts", () => {
  it("writes one PNG per chart beside the note by default", async () => {
    const { impl } = target();
    const outcome = await exportCharts([chart(PNG), chart(PNG)], impl, {
      notePath: "Notes/Sales.md", folder: "", scale: 2,
    });
    expect(outcome.written).toEqual(["Notes/Sales-chart-1.png", "Notes/Sales-chart-2.png"]);
  });

  it("writes into the configured folder and creates it first", async () => {
    const { impl } = target();
    const outcome = await exportCharts([chart(PNG)], impl, {
      notePath: "Notes/Sales.md", folder: "Attachments/charts", scale: 2,
    });
    expect(impl.ensureFolder).toHaveBeenCalledWith("Attachments/charts");
    expect(outcome.written).toEqual(["Attachments/charts/Sales-chart-1.png"]);
  });

  it("never overwrites an existing file", async () => {
    const { impl } = target(["Notes/Sales-chart-1.png"]);
    const outcome = await exportCharts([chart(PNG)], impl, {
      notePath: "Notes/Sales.md", folder: "", scale: 2,
    });
    expect(outcome.written).toEqual(["Notes/Sales-chart-1-2.png"]);
  });

  it("keeps stepping the suffix until a free name is found", async () => {
    const { impl } = target(["Sales-chart-1.png", "Sales-chart-1-2.png"]);
    const outcome = await exportCharts([chart(PNG)], impl, {
      notePath: "Sales.md", folder: "", scale: 2,
    });
    expect(outcome.written).toEqual(["Sales-chart-1-3.png"]);
  });

  it("skips a chart that has not rendered yet", async () => {
    const { impl } = target();
    const outcome = await exportCharts([chart(undefined), chart(PNG)], impl, {
      notePath: "Sales.md", folder: "", scale: 2,
    });
    expect(outcome.skipped).toBe(1);
    expect(outcome.written).toEqual(["Sales-chart-2.png"]);
  });

  it("does not create a folder when saving to the vault root", async () => {
    const { impl } = target();
    await exportCharts([chart(PNG)], impl, { notePath: "Sales.md", folder: "", scale: 2 });
    expect(impl.ensureFolder).not.toHaveBeenCalled();
  });

  it("never writes a file from a data URL that is not a PNG", async () => {
    const { impl } = target();
    const svg = "data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%2F%3E";
    const outcome = await exportCharts([chart(svg)], impl, { notePath: "Sales.md", folder: "", scale: 2 });
    expect(impl.writeBinary).not.toHaveBeenCalled();
    expect(outcome.written).toEqual([]);
    expect(outcome.skipped).toBe(1);
  });

  it("decodes only the payload, not the data URL prefix", async () => {
    const { impl } = target();
    await exportCharts([chart(PNG)], impl, { notePath: "Sales.md", folder: "", scale: 2 });
    const written = (impl.writeBinary as ReturnType<typeof vi.fn>).mock.calls[0]![1] as ArrayBuffer;
    expect(new TextDecoder().decode(written)).toBe("QUJD");
  });
});

describe("exportCharts — background", () => {
  it("asks every chart for the chosen background", async () => {
    const { impl } = target();
    const source = { pngDataUrl: vi.fn(() => PNG) };
    await exportCharts([source], impl, { notePath: "Sales.md", folder: "", scale: 3, background: "white" });
    expect(source.pngDataUrl).toHaveBeenCalledWith({ scale: 3, background: "white" });
  });

  it("draws on the note's own background when none is chosen", async () => {
    const { impl } = target();
    const source = { pngDataUrl: vi.fn(() => PNG) };
    await exportCharts([source], impl, { notePath: "Sales.md", folder: "", scale: 2 });
    expect(source.pngDataUrl).toHaveBeenCalledWith({ scale: 2, background: "theme" });
  });
});

describe("exportAppearance", () => {
  const dark = {
    text: "#dcddde", muted: "#999999", border: "#444444", grid: "#333333",
    surface: "#262626", fontFamily: "Inter",
  };

  it("keeps the theme's ink and paints the note's background for `theme`", () => {
    expect(exportAppearance("theme", dark, "#1e1e1e")).toEqual({ palette: dark, backgroundColor: "#1e1e1e" });
  });

  it("switches to dark ink on white for `white`, so a dark-theme chart reads on a white slide", () => {
    const { palette, backgroundColor } = exportAppearance("white", dark, "#1e1e1e");
    expect(backgroundColor).toBe("#ffffff");
    expect(palette).toEqual({ ...LIGHT_PALETTE, fontFamily: "Inter" });
  });

  it("leaves the background out for `transparent`", () => {
    expect(exportAppearance("transparent", dark, "#1e1e1e")).toEqual({ palette: dark, backgroundColor: "transparent" });
  });
});

describe("fileSlug", () => {
  it("turns a chart title into a safe file name part", () => {
    expect(fileSlug("Q3 / revenue: east?")).toBe("Q3-revenue-east");
    expect(fileSlug("売上の推移 [2026]")).toBe("売上の推移-2026");
  });

  it("never yields a hidden file, an empty name or an over-long one", () => {
    expect(fileSlug("...hidden")).toBe("hidden");
    expect(fileSlug(" / ? ")).toBeUndefined();
    expect(fileSlug(undefined)).toBeUndefined();
    expect(fileSlug("x".repeat(200))!.length).toBeLessThanOrEqual(60);
  });
});

describe("exportChart", () => {
  it("names the file after the note and the chart title", async () => {
    const { impl } = target();
    const path = await exportChart(chart(PNG), impl, {
      notePath: "Notes/Sales.md", folder: "", scale: 2, background: "white", title: "Quarterly revenue",
    });
    expect(path).toBe("Notes/Sales-Quarterly-revenue.png");
  });

  it("falls back to `-chart` without a title and never overwrites", async () => {
    const { impl } = target(["Exports/Sales-chart.png"]);
    const path = await exportChart(chart(PNG), impl, {
      notePath: "Notes/Sales.md", folder: "Exports", scale: 2, background: "theme",
    });
    expect(path).toBe("Exports/Sales-chart-2.png");
    expect(impl.ensureFolder).toHaveBeenCalledWith("Exports");
  });

  it("writes nothing when the chart has not drawn or is not a PNG", async () => {
    const { impl } = target();
    expect(await exportChart(chart(undefined), impl, { notePath: "Sales.md", folder: "", scale: 2, background: "theme" }))
      .toBeUndefined();
    expect(await exportChart(chart("data:image/svg+xml;charset=UTF-8,%3Csvg%2F%3E"), impl, {
      notePath: "Sales.md", folder: "", scale: 2, background: "theme",
    })).toBeUndefined();
    expect(impl.writeBinary).not.toHaveBeenCalled();
  });
});

describe("pngBlob", () => {
  it("wraps the decoded bytes as an image/png blob for the clipboard", async () => {
    const blob = pngBlob(PNG, (base64) => new TextEncoder().encode(base64).buffer as ArrayBuffer);
    expect(blob?.type).toBe("image/png");
    expect(await blob!.text()).toBe("QUJD");
  });

  it("refuses anything that is not a PNG data URL", () => {
    expect(pngBlob("data:image/svg+xml;charset=UTF-8,%3Csvg%2F%3E", () => new ArrayBuffer(0))).toBeUndefined();
    expect(pngBlob(undefined, () => new ArrayBuffer(0))).toBeUndefined();
  });
});

describe("exportFolder", () => {
  // Obsidian's normalizePath turns "" into "/", the vault root.
  const normalize = (path: string): string => (path.trim() === "" ? "/" : path.replace(/\/+$/, ""));

  it("keeps an empty setting empty, so images land beside the note", () => {
    expect(exportFolder("", normalize)).toBe("");
    expect(exportFolder("   ", normalize)).toBe("");
  });

  it("normalises a folder that is set", () => {
    expect(exportFolder("Attachments/charts/", normalize)).toBe("Attachments/charts");
  });
});
