import { describe, expect, it } from "vitest";
import { extractTable, parseMarkdownTable } from "../src/parse/markdownTable";

const NOTE = `# Sales

Some prose.

## Q3

| Region | Revenue | Share |
| --- | ---: | :-: |
| Kanto | 1,580 | 42% |
| Kansai | 1,120 | 31% |

## Q4

| Region | Revenue |
|---|---|
| Kanto | 1700 |
`;

describe("parseMarkdownTable", () => {
  it("parses a pipe table into rows and coerces cells", () => {
    expect(parseMarkdownTable("| a | b |\n| --- | --- |\n| Kanto | 12 |")).toEqual([
      { a: "Kanto", b: 12 },
    ]);
  });

  it("accepts alignment markers in the separator row", () => {
    expect(parseMarkdownTable("| a | b |\n| :--- | ---: |\n| x | 1 |")).toEqual([{ a: "x", b: 1 }]);
  });

  it("accepts tables without outer pipes", () => {
    expect(parseMarkdownTable("a | b\n--- | ---\nx | 1")).toEqual([{ a: "x", b: 1 }]);
  });

  it("strips bold, italics, inline code and links from cells", () => {
    const rows = parseMarkdownTable(
      "| name | note |\n|---|---|\n| **Acme** | `code` |\n| [[Kanto]] | [docs](http://x) |\n| _Beta_ | ~~old~~ |",
    );
    expect(rows).toEqual([
      { name: "Acme", note: "code" },
      { name: "Kanto", note: "docs" },
      { name: "Beta", note: "old" },
    ]);
  });

  it("keeps the display text of an aliased wikilink", () => {
    expect(parseMarkdownTable("| a |\n|---|\n| [[Note|Kanto]] |")).toEqual([{ a: "Kanto" }]);
  });

  it("honours escaped pipes inside a cell", () => {
    expect(parseMarkdownTable("| a | b |\n|---|---|\n| x \\| y | 1 |")).toEqual([{ a: "x | y", b: 1 }]);
  });

  it("returns an empty list when the separator row is missing", () => {
    expect(parseMarkdownTable("| a | b |\n| x | 1 |")).toEqual([]);
  });
});

describe("extractTable", () => {
  it("returns the first table in a note when no heading is given", () => {
    expect(extractTable(NOTE)).toEqual([
      { Region: "Kanto", Revenue: 1580, Share: 42 },
      { Region: "Kansai", Revenue: 1120, Share: 31 },
    ]);
  });

  it("returns the table under the named heading", () => {
    expect(extractTable(NOTE, "Q4")).toEqual([{ Region: "Kanto", Revenue: 1700 }]);
  });

  it("matches a heading case-insensitively and ignores its hash marks", () => {
    expect(extractTable(NOTE, "## q4")).toEqual([{ Region: "Kanto", Revenue: 1700 }]);
  });

  it("stops at the next heading of the same or higher level", () => {
    expect(extractTable(NOTE, "Q3")).toHaveLength(2);
  });

  it("returns undefined when the heading is absent", () => {
    expect(extractTable(NOTE, "Q5")).toBeUndefined();
  });

  it("returns undefined when the note has no table at all", () => {
    expect(extractTable("# Only prose\n\nnothing here")).toBeUndefined();
  });

  it("skips tables inside fenced code blocks", () => {
    const note = "# T\n\n```\n| a | b |\n|---|---|\n| 1 | 2 |\n```\n\n| c |\n|---|\n| 9 |\n";
    expect(extractTable(note)).toEqual([{ c: 9 }]);
  });
});
