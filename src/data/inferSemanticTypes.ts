import type { Row, SemanticTypeValue } from "../types";

/**
 * Guesses a Flint semantic type per column so a block can be written with only
 * data and encodings. Names are from Flint's `SemanticTypes` registry.
 *
 * Order matters: unambiguous value shapes win over column names, and money /
 * count / share hints apply only to numeric columns so that a text column named
 * `price_band` stays a Category.
 */

/** Value shapes that identify a type on their own. */
const SHAPES: [RegExp, string][] = [
  [/^\d{4}-\d{2}-\d{2}[T ]/, "DateTime"],
  [/^\d{4}-\d{2}-\d{2}$/, "Date"],
  [/^\d{4}\/\d{1,2}\/\d{1,2}$/, "Date"],
  [/^\d{4}[-/]?Q[1-4]$/i, "YearQuarter"],
  [/^\d{4}-W\d{1,2}$/i, "YearWeek"],
  [/^\d{4}[-/]\d{1,2}$/, "YearMonth"],
  [/^Q[1-4]$/i, "Quarter"],
];

/** Applied to numeric columns only. */
const NUMERIC_HINTS: [RegExp, string][] = [
  [/percent|percentage|share|ratio|rate|pct|率|比率|構成比|割合/, "Percentage"],
  [/profit|margin|利益|粗利/, "Profit"],
  [/price|revenue|sales|cost|amount|spend|budget|gmv|売上|価格|金額|単価|費用|予算/, "Price"],
  [/count|qty|quantity|orders|users|visits|sessions|件数|数量|人数|回数/, "Count"],
  [/rank|position|順位|ランク/, "Rank"],
  [/^year|year$|年度|年次/, "Year"],
  [/score|スコア|点数/, "Score"],
  [/temp|temperature|気温|温度/, "Temperature"],
  [/duration|elapsed|所要|期間/, "Duration"],
  [/latitude|^lat$|緯度/, "Latitude"],
  [/longitude|^lon$|^lng$|経度/, "Longitude"],
];

/** Applied to text columns only. */
const TEXT_HINTS: [RegExp, string][] = [
  [/country|国名|^国$/, "Country"],
  [/prefecture|都道府県/, "State"],
  [/city|市区|市町村|都市/, "City"],
  [/region|area|地域|エリア|地区/, "Region"],
  [/zip|postal|郵便番号/, "ZipCode"],
  [/status|ステータス|状態/, "Status"],
  [/sentiment|感情/, "Sentiment"],
  [/^name$|name$|氏名|名称|担当者/, "Name"],
];

/** Matched against the raw column name, where separators still carry meaning. */
const RAW_HINTS: [RegExp, string][] = [[/^id$|_id$|コード|番号/i, "ID"]];

export function inferSemanticTypes(
  rows: Row[],
  explicit: Record<string, SemanticTypeValue>,
): Record<string, SemanticTypeValue> {
  const out: Record<string, SemanticTypeValue> = {};
  for (const column of columnsOf(rows)) {
    const given = explicit[column];
    out[column] = given !== undefined ? given : inferColumn(column, valuesOf(rows, column));
  }
  for (const [column, value] of Object.entries(explicit)) {
    if (!(column in out)) out[column] = value;
  }
  return out;
}

function columnsOf(rows: Row[]): string[] {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) if (!columns.includes(key)) columns.push(key);
  }
  return columns;
}

function valuesOf(rows: Row[], column: string): unknown[] {
  return rows.map((row) => row[column]).filter((value) => value !== null && value !== undefined && value !== "");
}

function inferColumn(column: string, values: unknown[]): string {
  if (values.length === 0) return "Unknown";

  if (values.every((value) => typeof value === "boolean")) return "Boolean";

  const strings = values.filter((value): value is string => typeof value === "string");
  if (strings.length === values.length) {
    for (const [shape, type] of SHAPES) {
      if (strings.every((value) => shape.test(value.trim()))) return type;
    }
  }

  const raw = matchHint(column, RAW_HINTS);
  if (raw !== undefined) return raw;

  const normalized = column.toLowerCase().replace(/[_\-\s.]/g, "");
  if (values.every((value) => typeof value === "number")) {
    return matchHint(normalized, NUMERIC_HINTS) ?? "Quantity";
  }
  if (strings.length === values.length) {
    return matchHint(normalized, TEXT_HINTS) ?? "Category";
  }
  return "Category";
}

function matchHint(name: string, hints: [RegExp, string][]): string | undefined {
  for (const [pattern, type] of hints) if (pattern.test(name)) return type;
  return undefined;
}
