/** A single data row: column name -> cell value. */
export type Row = Record<string, unknown>;

/** Inline semantic annotation, mirrors Flint's `SemanticAnnotation`. */
export interface SemanticAnnotation {
  semanticType: string;
  intrinsicDomain?: [number, number];
  unit?: string;
  sortOrder?: string[];
}

export type SemanticTypeValue = string | SemanticAnnotation;

/** One encoding channel binding, mirrors Flint's `ChartEncoding`. */
export interface Encoding {
  field: string;
  [key: string]: unknown;
}

export interface Size {
  width: number;
  height: number;
}

/** Where the rows come from. Resolved later by the data layer. */
export type DataSource =
  | { kind: "rows"; rows: Row[] }
  /** Raw CSV/TSV text written inline in the block. */
  | { kind: "text"; text: string }
  /** A vault file (.csv/.tsv/.json), or a note plus an optional table locator. */
  | { kind: "file"; path: string; table?: string }
  | { kind: "none" };

/** A `flint` code block after normalisation. Backend-agnostic. */
export interface FlintBlock {
  chartType?: string;
  title?: string;
  subtitle?: string;
  encodings: Record<string, Encoding>;
  semanticTypes: Record<string, SemanticTypeValue>;
  fieldDisplayNames?: Record<string, string>;
  baseSize?: Size;
  canvasSize?: Size;
  chartProperties?: Record<string, unknown>;
  themeSpec?: unknown;
  data: DataSource;
}

export interface BlockIssue {
  message: string;
  /** Top-level key the issue belongs to, so the renderer can point at a line. */
  key?: string;
}

export type Result<T> =
  | { ok: true; value: T; warnings: BlockIssue[] }
  | { ok: false; errors: BlockIssue[] };

/** Mirrors Flint's `ChartAssemblyInput`. */
export interface ChartAssemblyInput {
  data: { values: Row[] };
  semantic_types?: Record<string, SemanticTypeValue>;
  field_display_names?: Record<string, string>;
  chart_spec: {
    chartType: string;
    title?: string;
    subtitle?: string;
    encodings: Record<string, Encoding>;
    baseSize?: Size;
    canvasSize?: Size;
    chartProperties?: Record<string, unknown>;
  };
  theme_spec?: unknown;
}
