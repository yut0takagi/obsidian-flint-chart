import { describe, expect, it, vi } from "vitest";
import { exportCharts } from "../src/commands/exportPng";
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
