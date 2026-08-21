import { describe, expect, it } from "vitest";
import { coerceCell } from "../src/parse/coerce";

describe("coerceCell", () => {
  it("keeps plain text as text", () => {
    expect(coerceCell("Kanto")).toBe("Kanto");
    expect(coerceCell("Q1")).toBe("Q1");
  });

  it("converts integers and decimals to numbers", () => {
    expect(coerceCell("1200")).toBe(1200);
    expect(coerceCell("-3.5")).toBe(-3.5);
    expect(coerceCell("1e3")).toBe(1000);
    expect(coerceCell(" 42 ")).toBe(42);
  });

  it("strips thousands separators before converting", () => {
    expect(coerceCell("1,234,567")).toBe(1234567);
  });

  it("converts a trailing-percent value to a number and keeps the scale", () => {
    expect(coerceCell("12.5%")).toBe(12.5);
  });

  it("does not convert values that only look numeric", () => {
    expect(coerceCell("007")).toBe("007");
    expect(coerceCell("1-2")).toBe("1-2");
    expect(coerceCell("2026-08")).toBe("2026-08");
    expect(coerceCell("+81 90")).toBe("+81 90");
  });

  it("converts booleans", () => {
    expect(coerceCell("true")).toBe(true);
    expect(coerceCell("FALSE")).toBe(false);
  });

  it("maps blanks to null", () => {
    expect(coerceCell("")).toBeNull();
    expect(coerceCell("   ")).toBeNull();
  });

  it("leaves date-like text alone so Flint can type it", () => {
    expect(coerceCell("2026-08-21")).toBe("2026-08-21");
    expect(coerceCell("2026Q3")).toBe("2026Q3");
  });
});
