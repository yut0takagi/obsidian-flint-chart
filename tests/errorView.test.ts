// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderIssues } from "../src/render/errorView";

const container = (): HTMLElement => document.createElement("div");

describe("renderIssues", () => {
  it("renders one line per error with the source line number when known", () => {
    const el = container();
    renderIssues(el, {
      errors: [{ message: "Unknown key `colour`.", key: "colour" }],
      warnings: [],
      source: "chartType: Bar Chart\ncolour: region\n",
    });
    expect(el.textContent).toContain("Unknown key `colour`.");
    expect(el.textContent).toContain("line 2");
  });

  it("omits the line number when the key is not in the source", () => {
    const el = container();
    renderIssues(el, {
      errors: [{ message: "boom", key: "nowhere" }],
      warnings: [],
      source: "chartType: Bar Chart\n",
    });
    expect(el.textContent).toContain("boom");
    expect(el.textContent).not.toContain("line");
  });

  it("renders warnings under their own class and keeps errors first", () => {
    const el = container();
    renderIssues(el, {
      errors: [{ message: "bad" }],
      warnings: [{ message: "careful" }],
      source: "",
    });
    expect(el.querySelectorAll(".flint-chart-error")).toHaveLength(1);
    expect(el.querySelectorAll(".flint-chart-warning")).toHaveLength(1);
    expect(el.textContent!.indexOf("bad")).toBeLessThan(el.textContent!.indexOf("careful"));
  });

  it("replaces whatever the container held before", () => {
    const el = container();
    el.appendChild(document.createElement("canvas"));
    renderIssues(el, { errors: [{ message: "bad" }], warnings: [], source: "" });
    expect(el.querySelector("canvas")).toBeNull();
  });

  it("never uses innerHTML, so markup in a message stays literal text", () => {
    const el = container();
    renderIssues(el, { errors: [{ message: "<img src=x onerror=alert(1)>" }], warnings: [], source: "" });
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toContain("<img src=x onerror=alert(1)>");
  });

  it("does nothing visible when there is nothing to report", () => {
    const el = container();
    renderIssues(el, { errors: [], warnings: [], source: "" });
    expect(el.childElementCount).toBe(0);
  });
});
