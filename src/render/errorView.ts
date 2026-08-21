import type { BlockIssue } from "../types";

/**
 * Shows parse and assembly problems inside the code block.
 *
 * Built with `document.createElement` and `textContent` only. `innerHTML` is
 * both a review blocker for community plugins and an injection route for text
 * that came out of someone's note.
 */

export interface IssueReport {
  errors: BlockIssue[];
  warnings: BlockIssue[];
  /** The raw block text, used to turn a key into a line number. */
  source: string;
}

export function renderIssues(container: HTMLElement, report: IssueReport): void {
  container.replaceChildren();
  if (report.errors.length === 0 && report.warnings.length === 0) return;

  const list = document.createElement("div");
  list.className = "flint-chart-issues";

  for (const issue of report.errors) list.appendChild(row(issue, "error", report.source));
  for (const issue of report.warnings) list.appendChild(row(issue, "warning", report.source));

  container.appendChild(list);
}

function row(issue: BlockIssue, kind: "error" | "warning", source: string): HTMLElement {
  const el = document.createElement("div");
  el.className = `flint-chart-${kind}`;

  const label = document.createElement("span");
  label.className = "flint-chart-issue-label";
  label.textContent = kind === "error" ? "Error" : "Note";
  el.appendChild(label);

  const text = document.createElement("span");
  text.className = "flint-chart-issue-text";
  text.textContent = issue.message;
  el.appendChild(text);

  const line = issue.key === undefined ? undefined : lineOfKey(source, issue.key);
  if (line !== undefined) {
    const where = document.createElement("span");
    where.className = "flint-chart-issue-line";
    where.textContent = `line ${line}`;
    el.appendChild(where);
  }
  return el;
}

/** Finds the 1-based line where a top-level YAML key is written. */
export function lineOfKey(source: string, key: string): number | undefined {
  const lines = source.split(/\r?\n/);
  const pattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    if (pattern.test(lines[i]!)) return i + 1;
  }
  return undefined;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
