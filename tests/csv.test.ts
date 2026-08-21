import { describe, expect, it } from "vitest";
import { parseDelimited } from "../src/parse/csv";

describe("parseDelimited", () => {
  it("parses a comma-separated table into rows keyed by header", () => {
    expect(parseDelimited("quarter,revenue\nQ1,1200\nQ2,1580")).toEqual([
      { quarter: "Q1", revenue: 1200 },
      { quarter: "Q2", revenue: 1580 },
    ]);
  });

  it("detects tabs and semicolons", () => {
    expect(parseDelimited("a\tb\n1\t2")).toEqual([{ a: 1, b: 2 }]);
    expect(parseDelimited("a;b\n1;2")).toEqual([{ a: 1, b: 2 }]);
  });

  it("prefers the delimiter that yields a consistent column count", () => {
    // Commas appear inside a value, tabs are the real delimiter.
    expect(parseDelimited("name\tnote\nAcme\tone, two, three")).toEqual([
      { name: "Acme", note: "one, two, three" },
    ]);
  });

  it("honours quoted fields containing the delimiter, quotes and newlines", () => {
    const rows = parseDelimited('a,b\n"x,1","say ""hi"""\n"multi\nline",2');
    expect(rows).toEqual([
      { a: "x,1", b: 'say "hi"' },
      { a: "multi\nline", b: 2 },
    ]);
  });

  it("handles CRLF line endings and a UTF-8 BOM", () => {
    expect(parseDelimited("﻿a,b\r\n1,2\r\n")).toEqual([{ a: 1, b: 2 }]);
  });

  it("ignores trailing blank lines", () => {
    expect(parseDelimited("a,b\n1,2\n\n\n")).toEqual([{ a: 1, b: 2 }]);
  });

  it("pads short rows with null and keeps extra cells under a numeric key", () => {
    expect(parseDelimited("a,b,c\n1,2")).toEqual([{ a: 1, b: 2, c: null }]);
  });

  it("de-duplicates repeated header names", () => {
    expect(parseDelimited("a,a\n1,2")).toEqual([{ a: 1, a_2: 2 }]);
  });

  it("names blank header cells by position", () => {
    expect(parseDelimited("a,,c\n1,2,3")).toEqual([{ a: 1, column_2: 2, c: 3 }]);
  });

  it("returns an empty list when there is no data row", () => {
    expect(parseDelimited("a,b")).toEqual([]);
    expect(parseDelimited("")).toEqual([]);
  });
});
