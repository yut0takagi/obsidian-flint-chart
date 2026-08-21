import { describe, expect, it } from "vitest";
import { inferSemanticTypes } from "../src/data/inferSemanticTypes";

describe("inferSemanticTypes — structural detection", () => {
  it("recognises ISO dates, date-times, year-months and year-quarters", () => {
    expect(inferSemanticTypes([
      { d: "2026-08-21", dt: "2026-08-21T09:30:00Z", ym: "2026-08", yq: "2026Q3" },
    ], {})).toEqual({ d: "Date", dt: "DateTime", ym: "YearMonth", yq: "YearQuarter" });
  });

  it("recognises bare quarters and slash-style year-months", () => {
    expect(inferSemanticTypes([{ q: "Q1" }, { q: "Q2" }], {})).toEqual({ q: "Quarter" });
    expect(inferSemanticTypes([{ m: "2026/8" }, { m: "2026/9" }], {})).toEqual({ m: "YearMonth" });
  });

  it("recognises booleans", () => {
    expect(inferSemanticTypes([{ active: true }, { active: false }], {})).toEqual({ active: "Boolean" });
  });

  it("falls back to Quantity for plain numbers and Category for plain text", () => {
    expect(inferSemanticTypes([{ n: 12, s: "alpha" }], {})).toEqual({ n: "Quantity", s: "Category" });
  });

  it("ignores nulls when deciding, and types an all-null column as Unknown", () => {
    expect(inferSemanticTypes([{ n: null }, { n: 5 }, { n: null }], {})).toEqual({ n: "Quantity" });
    expect(inferSemanticTypes([{ n: null }, { n: null }], {})).toEqual({ n: "Unknown" });
  });

  it("does not treat a four-digit number as a year without a naming hint", () => {
    expect(inferSemanticTypes([{ value: 2026 }, { value: 1998 }], {})).toEqual({ value: "Quantity" });
  });
});

describe("inferSemanticTypes — naming hints", () => {
  it("reads English money, count and share columns", () => {
    expect(inferSemanticTypes([{ revenue: 1, orders: 2, share: 3 }], {})).toEqual({
      revenue: "Price", orders: "Count", share: "Percentage",
    });
  });

  it("reads Japanese money, count and share columns", () => {
    expect(inferSemanticTypes([{ 売上: 1, 件数: 2, 構成比: 3 }], {})).toEqual({
      売上: "Price", 件数: "Count", 構成比: "Percentage",
    });
  });

  it("types year and rank columns from their names", () => {
    expect(inferSemanticTypes([{ year: 2026, rank: 3, 年度: 2026 }], {})).toEqual({
      year: "Year", rank: "Rank", 年度: "Year",
    });
  });

  it("types place columns from their names", () => {
    expect(inferSemanticTypes([{ country: "JP", city: "Osaka", region: "Kansai", 地域: "関東" }], {})).toEqual({
      country: "Country", city: "City", region: "Region", 地域: "Region",
    });
  });

  it("matches names case-insensitively and ignores separators", () => {
    expect(inferSemanticTypes([{ Total_Revenue: 1, "order count": 2 }], {})).toEqual({
      Total_Revenue: "Price", "order count": "Count",
    });
  });

  it("lets structure win over the name when the values are unambiguous", () => {
    // Named "date" but the values are year-months.
    expect(inferSemanticTypes([{ date: "2026-08" }], {})).toEqual({ date: "YearMonth" });
  });

  it("does not apply a numeric hint to a text column", () => {
    expect(inferSemanticTypes([{ price_band: "high" }, { price_band: "low" }], {})).toEqual({
      price_band: "Category",
    });
  });
});

describe("inferSemanticTypes — merging", () => {
  it("keeps explicit annotations and only fills the gaps", () => {
    expect(inferSemanticTypes([{ a: 1, b: "x" }], { a: "Temperature" })).toEqual({
      a: "Temperature", b: "Category",
    });
  });

  it("keeps an explicit annotation object untouched", () => {
    const explicit = { a: { semanticType: "Rating", intrinsicDomain: [1, 5] as [number, number] } };
    expect(inferSemanticTypes([{ a: 3 }], explicit).a).toEqual(explicit.a);
  });

  it("returns only the columns present in the data", () => {
    expect(Object.keys(inferSemanticTypes([{ a: 1 }], {}))).toEqual(["a"]);
  });

  it("unions columns across ragged rows", () => {
    expect(Object.keys(inferSemanticTypes([{ a: 1 }, { b: 2 }], {})).sort()).toEqual(["a", "b"]);
  });
});
