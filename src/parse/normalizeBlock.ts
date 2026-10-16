import type {
  BlockIssue,
  DataSource,
  Encoding,
  FlintBlock,
  Result,
  Row,
  SemanticTypeValue,
  Size,
} from "../types";

/**
 * What the normaliser needs to know about the active backend. Supplied by
 * `src/chart/templates.ts` in production and stubbed in tests, so this module
 * stays free of both Obsidian and Flint.
 */
export interface TemplateRegistry {
  chartTypes: string[];
  allChannels: Set<string>;
  channelsFor(chartType: string): string[] | undefined;
}

export interface NormalizeOptions {
  /**
   * Size for whichever of `width` / `height` a block leaves out — the plugin's
   * "Default width / height" setting. Without it, Flint picks the size.
   */
  defaultSize?: Size;
}

/**
 * Flint's own sizing defaults (`DEFAULT_BASE_SIZE` and `DEFAULT_MAX_STRETCH` in
 * 0.5.x), mirrored so a half-written size behaves as though the missing side
 * had not been written at all. `tests/assembleChart.test.ts` checks the first
 * against Flint so an upgrade cannot move it silently.
 */
export const FLINT_BASE_SIZE: Size = { width: 400, height: 320 };
export const FLINT_MAX_STRETCH = 1.5;

/** Top-level keys that are settings rather than encoding channels. */
const KEY_ALIASES: Record<string, string> = {
  charttype: "chartType",
  chart: "chartType",
  type: "chartType",
  title: "title",
  subtitle: "subtitle",
  types: "semanticTypes",
  semantic_types: "semanticTypes",
  semantictypes: "semanticTypes",
  names: "fieldDisplayNames",
  field_display_names: "fieldDisplayNames",
  fielddisplaynames: "fieldDisplayNames",
  data: "data",
  source: "source",
  file: "source",
  table: "table",
  width: "width",
  height: "height",
  maxwidth: "maxWidth",
  maxheight: "maxHeight",
  properties: "chartProperties",
  chartproperties: "chartProperties",
  options: "chartProperties",
  theme: "themeSpec",
  theme_spec: "themeSpec",
  themespec: "themeSpec",
  backend: "backend",
};

/** Nouns stripped when matching a chart type loosely: "sankey" -> "Sankey Diagram". */
const TYPE_NOUNS = /\s+(chart|plot|diagram|graph|map)$/i;

export function normalizeBlock(
  raw: unknown,
  registry: TemplateRegistry,
  options: NormalizeOptions = {},
): Result<FlintBlock> {
  const errors: BlockIssue[] = [];
  const warnings: BlockIssue[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ message: "A flint block must be a YAML mapping of keys to values." }] };
  }
  const obj = raw as Record<string, unknown>;
  if (Object.keys(obj).length === 0) {
    return { ok: false, errors: [{ message: "This flint block is empty. Add at least a chart type and some data." }] };
  }

  const isFullForm = "chart_spec" in obj || "chartSpec" in obj;
  const spec = isFullForm
    ? asRecord(obj.chart_spec ?? obj.chartSpec) ?? {}
    : {};

  // ---- chart type -------------------------------------------------------
  const rawType = isFullForm
    ? spec.chartType ?? spec.chart_type
    : firstDefined(obj, ["chartType", "chart", "type"]);
  let chartType: string | undefined;
  if (rawType !== undefined && rawType !== null && rawType !== "") {
    if (typeof rawType !== "string") {
      errors.push({ message: "`chartType` must be text.", key: "chartType" });
    } else {
      chartType = resolveChartType(rawType, registry.chartTypes);
      if (chartType === undefined) {
        const near = nearest(rawType, registry.chartTypes, 4);
        errors.push({
          message: `Unknown chart type "${rawType}". Did you mean ${near.map((n) => `"${n}"`).join(", ")}?`,
          key: "chartType",
        });
      }
    }
  }

  // ---- encodings --------------------------------------------------------
  const encodings: Record<string, Encoding> = {};
  const supported = chartType === undefined ? undefined : registry.channelsFor(chartType);

  const rawEncodings = isFullForm ? asRecord(spec.encodings) ?? {} : channelKeysOf(obj, registry);
  for (const [channel, value] of Object.entries(rawEncodings)) {
    const encoding = toEncoding(value);
    if (encoding === undefined) {
      errors.push({
        message: `Channel \`${channel}\` needs a column name, or a mapping with a \`field\` key.`,
        key: channel,
      });
      continue;
    }
    encodings[channel] = encoding;
    if (supported !== undefined && !supported.includes(channel)) {
      warnings.push({
        message: `"${chartType}" ignores the \`${channel}\` channel. It accepts: ${supported.join(", ")}.`,
        key: channel,
      });
    }
  }

  // ---- unknown keys (shorthand form only; full form is passed through) ---
  if (!isFullForm) {
    const known = new Set([...Object.keys(KEY_ALIASES), ...registry.allChannels]);
    for (const key of Object.keys(obj)) {
      if (known.has(key) || known.has(key.toLowerCase())) continue;
      const near = nearest(key, [...registry.allChannels, ...uniqueTargets()], 3);
      errors.push({
        message: `Unknown key \`${key}\`. Did you mean ${near.map((n) => `\`${n}\``).join(", ")}?`,
        key,
      });
    }
    if (Object.keys(encodings).length === 0 && errors.length === 0) {
      errors.push({
        message: "No encoding channels found. Bind at least one column, for example `x: quarter`.",
      });
    }
  }

  // ---- sizes ------------------------------------------------------------
  const baseSize = completeBase(
    isFullForm ? asPartialSize(spec.baseSize) : readSize(obj, "width", "height", errors),
    options.defaultSize,
  );
  const canvasSize = completeCeiling(
    isFullForm ? asPartialSize(spec.canvasSize) : readSize(obj, "maxWidth", "maxHeight", errors),
    baseSize ?? FLINT_BASE_SIZE,
  );

  // ---- semantic types ---------------------------------------------------
  const rawTypes = isFullForm
    ? obj.semantic_types ?? obj.semanticTypes
    : firstDefined(obj, ["types", "semantic_types", "semanticTypes"]);
  const semanticTypes = readSemanticTypes(rawTypes, errors);

  const rawNames = isFullForm
    ? obj.field_display_names ?? obj.fieldDisplayNames
    : firstDefined(obj, ["names", "field_display_names", "fieldDisplayNames"]);
  const fieldDisplayNames = readStringMap(rawNames, "names", errors);

  // ---- theme ------------------------------------------------------------
  const theme = readTheme(obj);
  if (theme.themeSpec !== undefined) {
    warnings.push({
      message:
        "`theme` has no effect here: Flint applies theme specs to its Vega-Lite backend only. " +
        "Chart colours follow your Obsidian theme instead.",
      key: "theme",
    });
  }

  // ---- data -------------------------------------------------------------
  const data = readDataSource(obj, isFullForm, errors);

  // ---- backend ----------------------------------------------------------
  const backend = obj.backend ?? obj.Backend;
  if (typeof backend === "string" && backend.toLowerCase() !== "echarts") {
    warnings.push({
      message: `Only the \`echarts\` backend is available; ignoring \`backend: ${backend}\`.`,
      key: "backend",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  const block: FlintBlock = {
    ...(chartType !== undefined ? { chartType } : {}),
    ...pickString(isFullForm ? spec.title : obj.title, "title"),
    ...pickString(isFullForm ? spec.subtitle : obj.subtitle, "subtitle"),
    encodings,
    semanticTypes,
    ...(fieldDisplayNames !== undefined ? { fieldDisplayNames } : {}),
    ...(baseSize !== undefined ? { baseSize } : {}),
    ...(canvasSize !== undefined ? { canvasSize } : {}),
    ...readChartProperties(obj, spec, isFullForm),
    ...theme,
    data,
  };
  return { ok: true, value: block, warnings };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function uniqueTargets(): string[] {
  return [...new Set(Object.values(KEY_ALIASES))];
}

function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (obj[key] !== undefined) return obj[key];
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function channelKeysOf(obj: Record<string, unknown>, registry: TemplateRegistry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (registry.allChannels.has(key)) out[key] = value;
  }
  return out;
}

function toEncoding(value: unknown): Encoding | undefined {
  if (typeof value === "string" && value.length > 0) return { field: value };
  const record = asRecord(value);
  if (record !== undefined && typeof record.field === "string" && record.field.length > 0) {
    return record as Encoding;
  }
  return undefined;
}

function resolveChartType(input: string, chartTypes: string[]): string | undefined {
  const exact = chartTypes.find((t) => t === input);
  if (exact !== undefined) return exact;
  const lower = input.trim().toLowerCase();
  const insensitive = chartTypes.find((t) => t.toLowerCase() === lower);
  if (insensitive !== undefined) return insensitive;
  const bare = lower.replace(TYPE_NOUNS, "");
  const loose = chartTypes.filter((t) => t.toLowerCase().replace(TYPE_NOUNS, "") === bare);
  return loose.length === 1 ? loose[0] : undefined;
}

function readSize(
  obj: Record<string, unknown>,
  widthKey: string,
  heightKey: string,
  errors: BlockIssue[],
): Partial<Size> {
  const width = readDimension(obj[widthKey], widthKey, errors);
  const height = readDimension(obj[heightKey], heightKey, errors);
  return {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };
}

/** The block's size, with any side it leaves out taken from the default. */
function completeBase(written: Partial<Size>, fallback: Size | undefined): Size | undefined {
  if (written.width === undefined && written.height === undefined) return fallback;
  const base = fallback ?? FLINT_BASE_SIZE;
  return { width: written.width ?? base.width, height: written.height ?? base.height };
}

/**
 * Flint needs both sides of a ceiling. A missing side gets exactly the room
 * Flint would have allowed with no ceiling at all, rather than pinning it to
 * the base size and forbidding that side to stretch.
 */
function completeCeiling(written: Partial<Size>, base: Size): Size | undefined {
  if (written.width === undefined && written.height === undefined) return undefined;
  return {
    width: written.width ?? Math.round(base.width * FLINT_MAX_STRETCH),
    height: written.height ?? Math.round(base.height * FLINT_MAX_STRETCH),
  };
}

function readDimension(value: unknown, key: string, errors: BlockIssue[]): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    errors.push({ message: `\`${key}\` must be a positive number of pixels.`, key });
    return undefined;
  }
  return value;
}

/** Full form is passed through, so values that are not positive numbers are just left out. */
function asPartialSize(value: unknown): Partial<Size> {
  const record = asRecord(value);
  if (record === undefined) return {};
  const usable = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
  return {
    ...(usable(record.width) ? { width: record.width } : {}),
    ...(usable(record.height) ? { height: record.height } : {}),
  };
}

function readSemanticTypes(value: unknown, errors: BlockIssue[]): Record<string, SemanticTypeValue> {
  if (value === undefined || value === null) return {};
  const record = asRecord(value);
  if (record === undefined) {
    errors.push({ message: "`types` must be a mapping of column name to semantic type.", key: "types" });
    return {};
  }
  const out: Record<string, SemanticTypeValue> = {};
  for (const [field, entry] of Object.entries(record)) {
    if (typeof entry === "string") {
      out[field] = entry;
      continue;
    }
    const annotation = asRecord(entry);
    if (annotation !== undefined && typeof annotation.semanticType === "string") {
      out[field] = annotation as unknown as SemanticTypeValue;
      continue;
    }
    errors.push({
      message: `\`types.${field}\` must be a semantic type name, or a mapping with a \`semanticType\` key.`,
      key: "types",
    });
  }
  return out;
}

function readStringMap(
  value: unknown,
  key: string,
  errors: BlockIssue[],
): Record<string, string> | undefined {
  if (value === undefined || value === null) return undefined;
  const record = asRecord(value);
  if (record === undefined) {
    errors.push({ message: `\`${key}\` must be a mapping of column name to label.`, key });
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [field, label] of Object.entries(record)) {
    if (typeof label !== "string") {
      errors.push({ message: `\`${key}.${field}\` must be text.`, key });
      continue;
    }
    out[field] = label;
  }
  return out;
}

function readDataSource(
  obj: Record<string, unknown>,
  isFullForm: boolean,
  errors: BlockIssue[],
): DataSource {
  const source = obj.source ?? obj.file;
  const table = obj.table;

  if (source !== undefined && source !== null) {
    if (typeof source !== "string" || source.trim() === "") {
      errors.push({ message: "`source` must be a vault path or a `[[wikilink]]`.", key: "source" });
      return { kind: "none" };
    }
    const link = parseSource(source);
    const heading = typeof table === "string" && table !== "" ? table : link.table;
    return { kind: "file", path: link.path, ...(heading !== undefined ? { table: heading } : {}) };
  }

  if (table !== undefined && table !== null) {
    errors.push({ message: "`table` needs a `source` to read the table from.", key: "table" });
  }

  const data = obj.data;
  if (data === undefined || data === null) return { kind: "none" };

  if (Array.isArray(data)) {
    const bad = data.findIndex((row) => asRecord(row) === undefined);
    if (bad >= 0) {
      errors.push({ message: `\`data\` row ${bad + 1} must be a mapping of column name to value.`, key: "data" });
      return { kind: "none" };
    }
    return { kind: "rows", rows: data as Row[] };
  }

  if (typeof data === "string") {
    if (!data.includes("\n")) {
      errors.push({
        message: "`data` was read as CSV text but has only one line. To load a file, use `source:` instead.",
        key: "data",
      });
      return { kind: "none" };
    }
    return { kind: "text", text: data };
  }

  const record = asRecord(data);
  if (record !== undefined) {
    if (Array.isArray(record.values)) {
      const bad = record.values.findIndex((row) => asRecord(row) === undefined);
      if (bad >= 0) {
        errors.push({ message: `\`data.values\` row ${bad + 1} must be a mapping.`, key: "data" });
        return { kind: "none" };
      }
      return { kind: "rows", rows: record.values as Row[] };
    }
    if (typeof record.url === "string" && record.url !== "") {
      const link = parseSource(record.url);
      return { kind: "file", path: link.path, ...(link.table !== undefined ? { table: link.table } : {}) };
    }
  }

  errors.push({
    message: isFullForm
      ? "`data` must be `{ values: [...] }` or `{ url: \"...\" }`."
      : "`data` must be a list of rows, or CSV text.",
    key: "data",
  });
  return { kind: "none" };
}

/** Accepts `path/to/file.csv`, `[[Note]]`, `[[Note#Heading]]`, `[[Note#Heading|alias]]`. */
export function parseSource(input: string): { path: string; table?: string } {
  let text = input.trim();
  const wikilink = /^\[\[(.+?)\]\]$/.exec(text);
  if (wikilink !== null) text = wikilink[1]!;
  const pipe = text.indexOf("|");
  if (pipe >= 0) text = text.slice(0, pipe);
  const hash = text.indexOf("#");
  if (hash >= 0) {
    const heading = text.slice(hash + 1).trim();
    return { path: text.slice(0, hash).trim(), ...(heading !== "" ? { table: heading } : {}) };
  }
  return { path: text.trim() };
}

function readChartProperties(
  obj: Record<string, unknown>,
  spec: Record<string, unknown>,
  isFullForm: boolean,
): { chartProperties?: Record<string, unknown> } {
  const value = isFullForm
    ? spec.chartProperties ?? spec.chart_properties
    : firstDefined(obj, ["properties", "chartProperties", "options"]);
  const record = asRecord(value);
  return record !== undefined ? { chartProperties: record } : {};
}

function readTheme(obj: Record<string, unknown>): { themeSpec?: unknown } {
  const value = firstDefined(obj, ["theme", "theme_spec", "themeSpec"]);
  return value !== undefined && value !== null ? { themeSpec: value } : {};
}

function pickString(value: unknown, key: "title" | "subtitle"): Record<string, string> {
  return typeof value === "string" && value !== "" ? { [key]: value } : {};
}

/** Ranks candidates by edit distance, keeping only plausible matches. */
export function nearest(input: string, candidates: string[], limit: number): string[] {
  const lower = input.toLowerCase();
  return candidates
    .map((candidate) => ({ candidate, distance: editDistance(lower, candidate.toLowerCase()) }))
    .filter(({ candidate, distance }) => distance <= Math.max(2, Math.ceil(candidate.length / 3)))
    .sort((a, b) => a.distance - b.distance || a.candidate.localeCompare(b.candidate))
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + cost);
    }
    previous = current;
  }
  return previous[b.length]!;
}
