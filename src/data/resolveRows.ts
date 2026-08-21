import { parseDelimited } from "../parse/csv";
import { extractTable } from "../parse/markdownTable";
import type { BlockIssue, DataSource, Result, Row } from "../types";

/**
 * The slice of Obsidian's vault this layer needs. Injected so the module can be
 * tested without an app, and so nothing here reaches for a Node API — the
 * plugin has to run on mobile too.
 */
export interface VaultReader {
  /** Resolves a link or vault path against the note it was written in. */
  resolve(path: string, sourcePath: string): string | undefined;
  read(path: string): Promise<string>;
}

export async function resolveRows(
  source: DataSource,
  reader: VaultReader,
  sourcePath: string,
): Promise<Result<Row[]>> {
  switch (source.kind) {
    case "rows":
      return { ok: true, value: source.rows, warnings: [] };
    case "text":
      return { ok: true, value: parseDelimited(source.text), warnings: [] };
    case "none":
      return {
        ok: false,
        errors: [{
          message: "No data to chart. Add a `data:` list, CSV text, or a `source:` file.",
          key: "data",
        }],
      };
    case "file":
      return readFile(source, reader, sourcePath);
  }
}

async function readFile(
  source: { kind: "file"; path: string; table?: string },
  reader: VaultReader,
  sourcePath: string,
): Promise<Result<Row[]>> {
  const resolved = reader.resolve(source.path, sourcePath);
  if (resolved === undefined) {
    return {
      ok: false,
      errors: [{ message: `Could not find \`${source.path}\` in the vault.`, key: "source" }],
    };
  }

  let content: string;
  try {
    content = await reader.read(resolved);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ message: `Could not read \`${resolved}\`: ${detail}`, key: "source" }] };
  }

  const parsed = parseContent(content, resolved, source.table);
  if (!parsed.ok) return parsed;
  if (parsed.value.length === 0) {
    return {
      ok: false,
      errors: [{ message: `\`${resolved}\` resolved but contains no rows.`, key: "source" }],
    };
  }
  return parsed;
}

function parseContent(content: string, path: string, table?: string): Result<Row[]> {
  const extension = (path.split(".").pop() ?? "").toLowerCase();

  if (extension === "json") return parseJson(content, path);
  if (extension === "md" || extension === "markdown") return parseTable(content, path, table);
  if (["csv", "tsv", "txt"].includes(extension)) {
    return { ok: true, value: parseDelimited(content), warnings: [] };
  }
  return sniff(content, path, table);
}

/** Unknown or missing extension: decide from the content itself. */
function sniff(content: string, path: string, table?: string): Result<Row[]> {
  const head = content.trimStart();
  if (head.startsWith("{") || head.startsWith("[")) return parseJson(content, path);
  if (/^\s*\|?.*\|.*\n\s*\|?\s*:?-{1,}/m.test(content)) return parseTable(content, path, table);
  return { ok: true, value: parseDelimited(content), warnings: [] };
}

function parseJson(content: string, path: string): Result<Row[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, errors: [{ message: `\`${path}\` is not valid JSON: ${detail}`, key: "source" }] };
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.values)
      ? parsed.values
      : undefined;

  if (rows === undefined || !rows.every(isRecord)) {
    return {
      ok: false,
      errors: [{
        message: `\`${path}\` must hold a list of row objects, or \`{ "values": [ ... ] }\`.`,
        key: "source",
      }],
    };
  }
  return { ok: true, value: rows as Row[], warnings: [] };
}

function parseTable(content: string, path: string, table?: string): Result<Row[]> {
  const rows = extractTable(content, table);
  if (rows === undefined) {
    const where = table === undefined ? "" : ` under the heading "${table}"`;
    return {
      ok: false,
      errors: [{ message: `No Markdown table found in \`${path}\`${where}.`, key: table === undefined ? "source" : "table" }],
    };
  }
  return { ok: true, value: rows, warnings: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Re-exported for the render layer's convenience. */
export type { BlockIssue };
