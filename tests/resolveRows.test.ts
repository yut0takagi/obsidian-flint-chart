import { describe, expect, it } from "vitest";
import { resolveRows } from "../src/data/resolveRows";
import type { VaultReader } from "../src/data/resolveRows";

const files: Record<string, string> = {
  "data/sales.csv": "quarter,revenue\nQ1,1200\nQ2,1580",
  "data/sales.tsv": "quarter\trevenue\nQ1\t1200",
  "data/rows.json": '[{"a":1},{"a":2}]',
  "data/wrapped.json": '{"values":[{"a":1}]}',
  "data/bad.json": "{ not json",
  "data/object.json": '{"a":1}',
  "Notes/Sales.md": "## Q3\n\n| Region | Revenue |\n|---|---|\n| Kanto | 1580 |\n",
  "data/mystery": "a,b\n1,2",
  "data/mystery.dat": "| a |\n|---|\n| 9 |\n",
};

const reader: VaultReader = {
  resolve: (path) => {
    if (path in files) return path;
    const withMd = `${path}.md`;
    if (withMd in files) return withMd;
    const inNotes = `Notes/${path}.md`;
    return inNotes in files ? inNotes : undefined;
  },
  read: async (path) => {
    const content = files[path];
    if (content === undefined) throw new Error(`missing ${path}`);
    return content;
  },
};

describe("resolveRows — inline sources", () => {
  it("returns inline rows unchanged", async () => {
    const r = await resolveRows({ kind: "rows", rows: [{ a: 1 }] }, reader, "note.md");
    expect(r).toEqual({ ok: true, value: [{ a: 1 }], warnings: [] });
  });

  it("parses inline CSV text", async () => {
    const r = await resolveRows({ kind: "text", text: "a,b\n1,2" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ a: 1, b: 2 }]);
  });

  it("reports an empty block as an error", async () => {
    const r = await resolveRows({ kind: "none" }, reader, "note.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/data|source/i);
  });
});

describe("resolveRows — vault files", () => {
  it("reads a CSV file", async () => {
    const r = await resolveRows({ kind: "file", path: "data/sales.csv" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ quarter: "Q1", revenue: 1200 }, { quarter: "Q2", revenue: 1580 }]);
  });

  it("reads a TSV file", async () => {
    const r = await resolveRows({ kind: "file", path: "data/sales.tsv" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ quarter: "Q1", revenue: 1200 }]);
  });

  it("reads a JSON array of rows", async () => {
    const r = await resolveRows({ kind: "file", path: "data/rows.json" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reads a JSON object wrapping a values array", async () => {
    const r = await resolveRows({ kind: "file", path: "data/wrapped.json" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ a: 1 }]);
  });

  it("reports malformed JSON with the file name", async () => {
    const r = await resolveRows({ kind: "file", path: "data/bad.json" }, reader, "note.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toContain("data/bad.json");
  });

  it("reports a JSON file that is not a list of rows", async () => {
    const r = await resolveRows({ kind: "file", path: "data/object.json" }, reader, "note.md");
    expect(r.ok).toBe(false);
  });

  it("reads a Markdown table under a heading", async () => {
    const r = await resolveRows({ kind: "file", path: "Notes/Sales.md", table: "Q3" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ Region: "Kanto", Revenue: 1580 }]);
  });

  it("resolves a bare note name through the link resolver", async () => {
    const r = await resolveRows({ kind: "file", path: "Sales" }, reader, "note.md");
    expect(r.ok && r.value).toEqual([{ Region: "Kanto", Revenue: 1580 }]);
  });

  it("reports a missing heading rather than falling back to another table", async () => {
    const r = await resolveRows({ kind: "file", path: "Notes/Sales.md", table: "Q9" }, reader, "note.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toContain("Q9");
  });

  it("reports a path that does not resolve", async () => {
    const r = await resolveRows({ kind: "file", path: "nope.csv" }, reader, "note.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toContain("nope.csv");
  });

  it("sniffs the format when the extension is missing or unknown", async () => {
    expect((await resolveRows({ kind: "file", path: "data/mystery" }, reader, "note.md")).ok).toBe(true);
    const table = await resolveRows({ kind: "file", path: "data/mystery.dat" }, reader, "note.md");
    expect(table.ok && table.value).toEqual([{ a: 9 }]);
  });

  it("reports a read failure instead of throwing", async () => {
    const broken: VaultReader = { resolve: () => "x.csv", read: async () => { throw new Error("boom"); } };
    const r = await resolveRows({ kind: "file", path: "x.csv" }, broken, "note.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toContain("boom");
  });

  it("warns when a file resolves but holds no rows", async () => {
    const empty: VaultReader = { resolve: () => "e.csv", read: async () => "a,b" };
    const r = await resolveRows({ kind: "file", path: "e.csv" }, empty, "note.md");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]!.message).toMatch(/no rows|empty/i);
  });
});
