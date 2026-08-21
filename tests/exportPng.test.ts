import { describe, expect, it, vi } from "vitest";
import { exportCharts } from "../src/commands/exportPng";
import type { ExportTarget } from "../src/commands/exportPng";
import type { BlockController } from "../src/render/BlockController";

const chart = (dataUrl: string | undefined): BlockController =>
  ({ dataUrl: () => dataUrl }) as unknown as BlockController;

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

  it("decodes only the payload, not the data URL prefix", async () => {
    const { impl } = target();
    await exportCharts([chart(PNG)], impl, { notePath: "Sales.md", folder: "", scale: 2 });
    const written = (impl.writeBinary as ReturnType<typeof vi.fn>).mock.calls[0]![1] as ArrayBuffer;
    expect(new TextDecoder().decode(written)).toBe("QUJD");
  });
});
