import { coerceCell } from "./coerce";
import type { Row } from "../types";

const DELIMITERS = [",", "\t", ";"] as const;

/**
 * Parses delimited text into rows keyed by the header line.
 * The delimiter is inferred by picking the one that gives every record the same
 * number of fields, preferring more columns on a tie.
 */
export function parseDelimited(input: string, delimiter?: string): Row[] {
  const text = stripBom(input);
  if (text.trim() === "") return [];

  const records = tokenize(text, delimiter ?? detectDelimiter(text));
  const nonEmpty = records.filter((record) => !isBlank(record));
  const header = nonEmpty[0];
  if (header === undefined) return [];

  const keys = headerKeys(header);
  return nonEmpty.slice(1).map((record) => {
    const row: Row = {};
    keys.forEach((key, index) => {
      row[key] = coerceCell(record[index] ?? "");
    });
    for (let index = keys.length; index < record.length; index++) {
      row[`column_${index + 1}`] = coerceCell(record[index] ?? "");
    }
    return row;
  });
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function isBlank(record: string[]): boolean {
  return record.every((field) => field.trim() === "");
}

function detectDelimiter(text: string): string {
  let best = DELIMITERS[0] as string;
  let bestScore = -1;
  for (const delimiter of DELIMITERS) {
    const records = tokenize(text, delimiter).filter((record) => !isBlank(record));
    if (records.length === 0) continue;
    const counts = records.map((record) => record.length);
    // A candidate that never splits anything is not the delimiter, however
    // consistent it looks: "a,b,c\n1,2" must stay comma-separated, not become
    // one tab-delimited column.
    if (Math.max(...counts) <= 1) continue;
    const consistent = Math.min(...counts) === Math.max(...counts);
    const columns = counts[0] ?? 0;
    const score = (consistent ? 1000 : 0) + columns;
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return best;
}

/** RFC 4180 style scan, so quoted fields may contain delimiters and newlines. */
function tokenize(text: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === "") {
      field = "";
      quoted = true;
    } else if (char === delimiter) {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

/** Blank headers get a positional name; repeats get a numeric suffix. */
function headerKeys(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((cell, index) => {
    const base = cell.trim() === "" ? `column_${index + 1}` : cell.trim();
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}_${count}`;
  });
}
