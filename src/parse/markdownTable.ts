import { coerceCell } from "./coerce";
import type { Row } from "../types";

const SEPARATOR = /^\s*\|?(\s*:?-{1,}:?\s*\|)*\s*:?-{1,}:?\s*\|?\s*$/;
const FENCE = /^\s*(```|~~~)/;
const HEADING = /^(#{1,6})\s+(.*)$/;

/** Parses one pipe table, header row first, into coerced rows. */
export function parseMarkdownTable(text: string): Row[] {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines[0];
  const separator = lines[1];
  if (header === undefined || separator === undefined || !SEPARATOR.test(separator)) return [];

  const keys = splitRow(header).map((cell, index) => (cell === "" ? `column_${index + 1}` : cell));
  return lines.slice(2).map((line) => {
    const cells = splitRow(line);
    const row: Row = {};
    keys.forEach((key, index) => {
      row[key] = coerceCell(cells[index] ?? "");
    });
    return row;
  });
}

/**
 * Pulls one table out of a note. With `heading`, looks only in that section;
 * without it, returns the first table in the note. Fenced code is skipped.
 */
export function extractTable(note: string, heading?: string): Row[] | undefined {
  const lines = note.split(/\r?\n/);
  const region = heading === undefined ? outsideFences(lines) : sectionOf(lines, heading);
  if (region === undefined) return undefined;

  for (let i = 0; i < region.length - 1; i++) {
    const current = region[i]!;
    const next = region[i + 1]!;
    if (!looksLikeRow(current) || !SEPARATOR.test(next)) continue;
    let end = i + 2;
    while (end < region.length && looksLikeRow(region[end]!)) end++;
    const rows = parseMarkdownTable(region.slice(i, end).join("\n"));
    if (rows.length > 0) return rows;
  }
  return undefined;
}

export interface TableLocation {
  /** Header line, 0-based. */
  start: number;
  /** Last body line, inclusive. */
  end: number;
  /** Text of the nearest heading above the table, if there is one. */
  heading?: string;
}

/**
 * The pipe table that `line` belongs to, found the way `extractTable` reads
 * tables: header, separator, body, outside fenced code. Undefined when the
 * line is not part of one.
 */
export function tableAt(lines: string[], line: number): TableLocation | undefined {
  let inFence = false;
  let heading: string | undefined;
  for (let i = 0; i <= line && i < lines.length; i++) {
    const text = lines[i]!;
    if (FENCE.test(text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(text);
    if (match !== null) heading = match[2]!.trim();
  }
  if (inFence || line < 0 || line >= lines.length || !looksLikeRow(lines[line]!)) return undefined;

  let start = line;
  while (start > 0 && looksLikeRow(lines[start - 1]!)) start--;
  let end = line;
  while (end + 1 < lines.length && looksLikeRow(lines[end + 1]!)) end++;
  if (start + 1 > end || !SEPARATOR.test(lines[start + 1]!)) return undefined;

  return { start, end, ...(heading !== undefined && heading !== "" ? { heading } : {}) };
}

function looksLikeRow(line: string): boolean {
  const text = line.trim();
  return text !== "" && text.includes("|") && !HEADING.test(text);
}

function outsideFences(lines: string[]): string[] {
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out;
}

/** Lines under the named heading, up to the next heading of the same or higher level. */
function sectionOf(lines: string[], heading: string): string[] | undefined {
  const wanted = normalizeHeading(heading);
  let start = -1;
  let level = 0;
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (FENCE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING.exec(line);
    if (match === null) continue;
    if (start < 0) {
      if (normalizeHeading(match[2]!) === wanted) {
        start = i + 1;
        level = match[1]!.length;
      }
    } else if (match[1]!.length <= level) {
      return outsideFences(lines.slice(start, i));
    }
  }
  return start < 0 ? undefined : outsideFences(lines.slice(start));
}

function normalizeHeading(text: string): string {
  return text.replace(/^#{1,6}\s*/, "").trim().toLowerCase();
}

/** Splits on unescaped pipes, dropping the outer ones. */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  const text = line.trim();
  let inWikilink = false;
  let inCode = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (char === "\\" && text[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (!inCode && char === "[" && text[i + 1] === "[") {
      inWikilink = true;
      cell += "[[";
      i++;
    } else if (inWikilink && char === "]" && text[i + 1] === "]") {
      inWikilink = false;
      cell += "]]";
      i++;
    } else if (char === "`") {
      inCode = !inCode;
      cell += char;
    } else if (char === "|" && !inWikilink && !inCode) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  if (text.startsWith("|")) cells.shift();
  if (text.endsWith("|") && !text.endsWith("\\|")) cells.pop();
  return cells.map(cleanCell);
}

/** Reduces Markdown inline markup to its display text. */
function cleanCell(cell: string): string {
  return cell
    .trim()
    .replace(/!?\[\[([^\][|]+)\|([^\][]+)\]\]/g, "$2")
    .replace(/!?\[\[([^\][]+)\]\]/g, "$1")
    .replace(/!?\[([^\][]*)\]\([^()]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .trim();
}
