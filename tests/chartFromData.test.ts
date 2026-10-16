import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import {
  blockBody,
  channelSummary,
  chartCandidates,
  fence,
  insertAfterTable,
  onOwnLine,
  tableData,
  verifyCandidate,
  yamlScalar,
} from "../src/commands/chartFromData";
import { buildChart } from "../src/chart/pipeline";
import { tableAt } from "../src/parse/markdownTable";
import type { CandidateDeps, DataInput } from "../src/commands/chartFromData";

const deps: CandidateDeps = {
  parseYaml: (text) => load(text),
  palette: { text: "#111", muted: "#555", border: "#ccc", grid: "#eee", surface: "#fff", fontFamily: "sans-serif" },
  sourcePath: "Notes/Sales.md",
};

const NOTE = [
  "# Sales",
  "",
  "## Q3",
  "",
  "| Region | Revenue | Channel |",
  "| --- | ---: | --- |",
  "| North | 1,580 | Online |",
  "| South | 1,120 | Online |",
  "| North | 900 | Store |",
  "| South | 1,300 | Store |",
  "",
  "## Q4",
  "",
  "| Region | Revenue |",
  "| --- | --- |",
  "| North | 2,000 |",
  "",
  "| Region | Revenue |",
  "| --- | --- |",
  "| West | 10 |",
];
const NOTE_TEXT = NOTE.join("\n");

describe("yamlScalar", () => {
  const tricky = [
    "revenue", "Revenue (JPY)", "売上", "a: b", "#tag", "x # y", "- item", "true", "No", "null", "~",
    "2024", "1e3", " lead", "trail ", "it's", 'say "hi"', "[x]", "{x}", "@x", "`x`", "a,b", "50%", "",
    "line\nbreak", "tab\there",
  ];

  it("round-trips every column name through a YAML parser as the same string", () => {
    for (const name of tricky) {
      expect(load(`x: ${yamlScalar(name)}`)).toEqual({ x: name });
    }
  });

  it("leaves plain names bare so the block stays easy to read", () => {
    expect(yamlScalar("revenue")).toBe("revenue");
    expect(yamlScalar("Revenue (JPY)")).toBe("Revenue (JPY)");
    expect(yamlScalar("売上")).toBe("売上");
  });
});

describe("blockBody", () => {
  it("writes the chart type, then the channels, then where the data lives", () => {
    const body = blockBody(
      { chartType: "Bar Chart", encodings: { x: "Region", y: "Revenue", color: "Channel" } },
      { kind: "source", source: "[[Notes/Sales#Q3]]" },
    );
    expect(body).toBe(
      'chartType: Bar Chart\nx: Region\ny: Revenue\ncolor: Channel\nsource: "[[Notes/Sales#Q3]]"\n',
    );
    expect(fence(body)).toBe("```flint\n" + body + "```\n");
  });

  it("can carry the rows inline when the table cannot be pointed at", () => {
    const body = blockBody(
      { chartType: "Bar Chart", encodings: { x: "name: full", y: "score" } },
      { kind: "rows", rows: [{ "name: full": "A", score: 1 }, { "name: full": "B", score: null }] },
    );
    expect(load(body)).toEqual({
      chartType: "Bar Chart",
      x: "name: full",
      y: "score",
      data: [{ "name: full": "A", score: 1 }, { "name: full": "B", score: null }],
    });
  });
});

describe("channelSummary", () => {
  it("lists the bindings in the order the block writes them", () => {
    expect(channelSummary({ color: "Channel", y: "Revenue", x: "Region" })).toBe("x: Region · y: Revenue · color: Channel");
  });
});

describe("tableData", () => {
  it("points at the table through its heading when it is the first table there", () => {
    const location = tableAt(NOTE, 6)!;
    expect(tableData("Notes/Sales.md", NOTE_TEXT, location)).toEqual({
      kind: "source",
      source: "[[Notes/Sales#Q3]]",
    });
  });

  it("points at the note alone when the table has no heading and is the first one", () => {
    const lines = ["| a | b |", "|---|---|", "| x | 2 |"];
    expect(tableData("Data.md", lines.join("\n"), tableAt(lines, 2)!)).toEqual({
      kind: "source",
      source: "[[Data]]",
    });
  });

  it("falls back to inline rows when another table comes first in the section", () => {
    const data = tableData("Notes/Sales.md", NOTE_TEXT, tableAt(NOTE, 19)!);
    expect(data).toEqual({ kind: "rows", rows: [{ Region: "West", Revenue: 10 }] });
  });

  it("falls back to inline rows when the heading cannot be written inside a link", () => {
    const lines = ["| z |", "|---|", "| 0 |", "", "## A | B", "", "| a | b |", "|---|---|", "| x | 2 |"];
    expect(tableData("Data.md", lines.join("\n"), tableAt(lines, 8)!)).toEqual({
      kind: "rows",
      rows: [{ a: "x", b: 2 }],
    });
  });

  it("writes a link the plugin itself resolves back to the same rows", async () => {
    const data = tableData("Notes/Sales.md", NOTE_TEXT, tableAt(NOTE, 6)!);
    const body = blockBody({ chartType: "Bar Chart", encodings: { x: "Region", y: "Revenue" } }, data);
    const built = await buildChart(body, {
      ...deps,
      reader: {
        resolve: (path) => (path === "Notes/Sales" ? "Notes/Sales.md" : undefined),
        read: async () => NOTE_TEXT,
      },
    });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.value.rowCount).toBe(4);
  });
});

describe("chart candidates", () => {
  const location = tableAt(NOTE, 6)!;
  const input: DataInput = {
    rows: [
      { Region: "North", Revenue: 1580, Channel: "Online" },
      { Region: "South", Revenue: 1120, Channel: "Online" },
      { Region: "North", Revenue: 900, Channel: "Store" },
      { Region: "South", Revenue: 1300, Channel: "Store" },
    ],
    data: tableData("Notes/Sales.md", NOTE_TEXT, location),
    path: "Notes/Sales.md",
    content: NOTE_TEXT,
  };

  it("offers a few different charts, each one already drawn once", async () => {
    const candidates = await chartCandidates(input, deps, 3);
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(3);
    expect(new Set(candidates.map((c) => c.suggestion.chartType)).size).toBe(candidates.length);
    for (const candidate of candidates) {
      expect(candidate.chart.option.series).toBeDefined();
      expect(candidate.body).toContain(`chartType: ${candidate.suggestion.chartType}`);
    }
  });

  it("drops a suggestion that would not draw, rather than inserting a broken block", async () => {
    expect(await verifyCandidate({ chartType: "Nope Chart", encodings: { x: "Region" } }, input, deps))
      .toBeUndefined();
    expect(await verifyCandidate({ chartType: "Bar Chart", encodings: { x: "NoSuchColumn", y: "Revenue" } }, input, deps))
      .toBeUndefined();
  });

  it("returns nothing for rows Flint cannot chart", async () => {
    expect(await chartCandidates({ ...input, rows: [] }, deps, 3)).toEqual([]);
  });
});

describe("insertAfterTable", () => {
  const block = "```flint\nchartType: Bar Chart\n```\n";

  it("leaves a blank line on both sides when prose follows straight after", () => {
    const lines = ["| a |", "|---|", "| 1 |", "Prose"];
    const at = insertAfterTable(lines, 2, block);
    expect(at).toEqual({ line: 2, ch: 5, text: "\n\n```flint\nchartType: Bar Chart\n```\n" });
    expect(apply(lines, at)).toBe("| a |\n|---|\n| 1 |\n\n```flint\nchartType: Bar Chart\n```\n\nProse");
  });

  it("reuses an existing blank line after the table", () => {
    const lines = ["| a |", "|---|", "| 1 |", "", "Prose"];
    expect(apply(lines, insertAfterTable(lines, 2, block)))
      .toBe("| a |\n|---|\n| 1 |\n\n```flint\nchartType: Bar Chart\n```\n\nProse");
  });

  it("ends the note with a newline when the table was last", () => {
    const lines = ["| a |", "|---|", "| 1 |"];
    expect(apply(lines, insertAfterTable(lines, 2, block)))
      .toBe("| a |\n|---|\n| 1 |\n\n```flint\nchartType: Bar Chart\n```\n");
  });
});

function apply(lines: string[], at: { line: number; ch: number; text: string }): string {
  const copy = [...lines];
  const line = copy[at.line]!;
  copy[at.line] = line.slice(0, at.ch) + at.text + line.slice(at.ch);
  return copy.join("\n");
}

describe("onOwnLine", () => {
  const block = "```flint\nchartType: Bar Chart\n```\n";

  it("inserts as-is on an empty line", () => {
    expect(onOwnLine("", "", block)).toBe(block);
  });

  it("starts a new line when the cursor sits after text, so the fence opens at a line start", () => {
    expect(onOwnLine("Some text", "", block)).toBe("\n" + block);
  });

  it("pushes text after the cursor onto its own line below the block", () => {
    expect(onOwnLine("Some", " text", block)).toBe("\n" + block + "\n");
  });
});
