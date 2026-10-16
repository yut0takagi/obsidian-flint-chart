import { buildChart } from "../chart/pipeline";
import { recommendCharts } from "../chart/recommend";
import { inferSemanticTypes } from "../data/inferSemanticTypes";
import { extractTable, parseMarkdownTable } from "../parse/markdownTable";
import type { BuiltChart, PipelineDeps } from "../chart/pipeline";
import type { ChartSuggestion } from "../chart/recommend";
import type { TableLocation } from "../parse/markdownTable";
import type { Row } from "../types";

/**
 * "Create chart from table or data file": turns rows the author already has
 * into a few ready-made `flint` blocks to pick from.
 *
 * Every candidate is run through the real pipeline before it is offered, so
 * the block that lands in the note is one that has already drawn once.
 * Nothing here imports `obsidian`; the command and its modal live in main.ts.
 */

/** How the inserted block finds its rows. */
export type BlockData =
  /** A `source:` value: a vault path, or a link to a note and heading. */
  | { kind: "source"; source: string }
  /** The rows written into the block, when the table cannot be pointed at. */
  | { kind: "rows"; rows: Row[] };

export interface DataInput {
  rows: Row[];
  data: BlockData;
  /** Vault path `source:` resolves to, and that file's text, for the dry run. */
  path: string;
  content: string;
}

export type CandidateDeps = Omit<PipelineDeps, "reader">;

export interface Candidate {
  suggestion: ChartSuggestion;
  /** Block text without the fences. */
  body: string;
  /** The candidate as drawn in its dry run, for the preview. */
  chart: BuiltChart;
}

/** Channels in the order a reader expects to see them; others follow as Flint gave them. */
const CHANNEL_ORDER = ["x", "y", "x2", "y2", "color", "size", "group"];

export function blockBody(suggestion: ChartSuggestion, data: BlockData): string {
  const lines = [`chartType: ${yamlScalar(suggestion.chartType)}`];
  for (const [channel, column] of orderedChannels(suggestion.encodings)) {
    lines.push(`${channel}: ${yamlScalar(column)}`);
  }
  if (data.kind === "source") {
    lines.push(`source: ${JSON.stringify(data.source)}`);
  } else {
    lines.push("data:");
    for (const row of data.rows) lines.push(`  - ${flowMapping(row)}`);
  }
  return `${lines.join("\n")}\n`;
}

/** One line saying which column went where, for the picker. */
export function channelSummary(encodings: Record<string, string>): string {
  return orderedChannels(encodings).map(([channel, column]) => `${channel}: ${column}`).join(" · ");
}

export function fence(body: string): string {
  return "```flint\n" + body + "```\n";
}

/**
 * Where a table at the cursor should be read from. A link keeps the table as
 * the thing the author edits, with the chart following it, so one is used
 * whenever the plugin would resolve it back to this same table. Otherwise —
 * a second table in a section, a heading a link cannot carry — the rows go
 * into the block itself.
 */
export function tableData(notePath: string, noteText: string, location: TableLocation): BlockData {
  const lines = noteText.split(/\r?\n/);
  const rows = parseMarkdownTable(lines.slice(location.start, location.end + 1).join("\n"));
  const target = notePath.replace(/\.md$/i, "");
  const same = (found: Row[] | undefined): boolean =>
    found !== undefined && JSON.stringify(found) === JSON.stringify(rows);

  if (linkSafe(target)) {
    if (location.heading !== undefined && linkSafe(location.heading) && same(extractTable(noteText, location.heading))) {
      return { kind: "source", source: `[[${target}#${location.heading}]]` };
    }
    if (same(extractTable(noteText))) return { kind: "source", source: `[[${target}]]` };
  }
  return { kind: "rows", rows };
}

/**
 * Runs one suggestion through the pipeline exactly as the inserted block will
 * be read. Undefined means it would not draw, so it is never offered.
 */
export async function verifyCandidate(
  suggestion: ChartSuggestion,
  input: DataInput,
  deps: CandidateDeps,
): Promise<Candidate | undefined> {
  const columns = new Set(input.rows.flatMap((row) => Object.keys(row)));
  if (!Object.values(suggestion.encodings).every((column) => columns.has(column))) return undefined;

  const body = blockBody(suggestion, input.data);
  const built = await buildChart(body, {
    ...deps,
    reader: { resolve: () => input.path, read: async () => input.content },
  });
  return built.ok ? { suggestion, body, chart: built.value } : undefined;
}

/** Flint's suggestions for these rows, keeping only the ones that draw, up to `limit`. */
export function suggestionsFor(rows: Row[], limit: number): ChartSuggestion[] {
  // A couple of spares, since some may fail their dry run.
  return recommendCharts(rows, inferSemanticTypes(rows, {}), limit + 2);
}

export async function chartCandidates(input: DataInput, deps: CandidateDeps, limit: number): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const suggestion of suggestionsFor(input.rows, limit)) {
    if (out.length >= limit) break;
    const candidate = await verifyCandidate(suggestion, input, deps);
    if (candidate !== undefined) out.push(candidate);
  }
  return out;
}

/** Where to put a block so it sits after the table with a blank line either side. */
export function insertAfterTable(
  lines: string[],
  end: number,
  block: string,
): { line: number; ch: number; text: string } {
  const next = lines[end + 1];
  const tail = next === undefined || next.trim() !== "" ? "\n" : "";
  return { line: end, ch: (lines[end] ?? "").length, text: `\n\n${block.trimEnd()}${tail}` };
}

/**
 * The text to insert at the cursor so the block stands on lines of its own.
 * A fence opened mid-line is not a fence, and the note would show the YAML.
 */
export function onOwnLine(before: string, after: string, block: string): string {
  return `${before.trim() !== "" ? "\n" : ""}${block}${after.trim() !== "" ? "\n" : ""}`;
}

/**
 * A YAML scalar that reads back as exactly `text`. Plain names stay bare so
 * the block is easy to read and edit; anything YAML might read as something
 * else — a number, a boolean, a comment, a nested mapping — is quoted.
 */
export function yamlScalar(text: string): string {
  const plain = /^[\p{L}\p{N}_][\p{L}\p{N}_ ().\/-]*$/u.test(text) && !/\s$/.test(text);
  const ambiguous = /^[-+.]?\d/.test(text) || /^(true|false|yes|no|on|off|y|n|null)$/i.test(text);
  return plain && !ambiguous ? text : JSON.stringify(text);
}

function orderedChannels(encodings: Record<string, string>): [string, string][] {
  const rank = (channel: string): number => {
    const index = CHANNEL_ORDER.indexOf(channel);
    return index < 0 ? CHANNEL_ORDER.length : index;
  };
  return Object.entries(encodings).sort(([a], [b]) => rank(a) - rank(b));
}

/** JSON is valid YAML; the spaces keep strict YAML 1.1 readers happy too. */
function flowMapping(row: Row): string {
  const entries = Object.entries(row).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value ?? null)}`);
  return `{ ${entries.join(", ")} }`;
}

/** Characters that end or split a wikilink, so a name containing them cannot sit inside one. */
function linkSafe(text: string): boolean {
  return text !== "" && !/[[\]|#^]/.test(text);
}
