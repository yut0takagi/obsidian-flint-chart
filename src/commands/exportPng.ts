import { LIGHT_PALETTE } from "../render/palette";
import type { ChartPalette } from "../chart/applyObsidianTheme";

/** Anything that can hand over a chart as a PNG data URL. */
export interface PngSource {
  /** Undefined when there is no chart to export, e.g. the block shows an error. */
  pngDataUrl(options: PngOptions): string | undefined;
}

/**
 * What an exported image sits on. `theme` is the chart as it looks in the
 * note; `white` re-inks it for a white page, which a dark theme's light text
 * would otherwise vanish on; `transparent` keeps the theme's ink with nothing
 * behind it.
 */
export type ExportBackground = "theme" | "white" | "transparent";

export const EXPORT_BACKGROUNDS: readonly ExportBackground[] = ["theme", "white", "transparent"];

export interface PngOptions {
  /** Pixel multiplier. */
  scale: number;
  background: ExportBackground;
}

export function exportAppearance(
  background: ExportBackground,
  theme: ChartPalette,
  themeBackground: string,
): { palette: ChartPalette; backgroundColor: string } {
  switch (background) {
    case "theme":
      return { palette: theme, backgroundColor: themeBackground };
    case "white":
      return { palette: { ...LIGHT_PALETTE, fontFamily: theme.fontFamily }, backgroundColor: "#ffffff" };
    case "transparent":
      return { palette: theme, backgroundColor: "transparent" };
  }
}

/** Everything the export needs from the vault, so the logic stays testable. */
export interface ExportTarget {
  exists(path: string): boolean;
  writeBinary(path: string, data: ArrayBuffer): Promise<void>;
  ensureFolder(path: string): Promise<void>;
  decodeBase64(base64: string): ArrayBuffer;
}

export interface ExportOptions {
  /** Note the charts belong to, used for naming and as the default folder. */
  notePath: string;
  /** Empty means beside the note. */
  folder: string;
  scale: number;
  /** Defaults to `theme`, so the image looks as it does in the note. */
  background?: ExportBackground;
}

export interface SingleExportOptions extends ExportOptions {
  /** The block's title, which names the file when there is one. */
  title?: string;
}

export interface ExportOutcome {
  written: string[];
  skipped: number;
}

export async function exportCharts(
  controllers: PngSource[],
  target: ExportTarget,
  options: ExportOptions,
): Promise<ExportOutcome> {
  const folder = await prepareFolder(target, options);
  const stem = baseName(options.notePath);
  const request: PngOptions = { scale: options.scale, background: options.background ?? "theme" };
  const written: string[] = [];
  let skipped = 0;

  for (let index = 0; index < controllers.length; index++) {
    const base64 = pngPayload(controllers[index]!.pngDataUrl(request));
    if (base64 === undefined) {
      skipped++;
      continue;
    }
    const path = freeName(target, folder, `${stem}-chart-${index + 1}`);
    await target.writeBinary(path, target.decodeBase64(base64));
    written.push(path);
  }

  return { written, skipped };
}

/** One chart, named after its title. Returns the path written, or undefined if there was nothing to write. */
export async function exportChart(
  source: PngSource,
  target: ExportTarget,
  options: SingleExportOptions,
): Promise<string | undefined> {
  const base64 = pngPayload(source.pngDataUrl({ scale: options.scale, background: options.background ?? "theme" }));
  if (base64 === undefined) return undefined;
  const folder = await prepareFolder(target, options);
  const path = freeName(target, folder, `${baseName(options.notePath)}-${fileSlug(options.title) ?? "chart"}`);
  await target.writeBinary(path, target.decodeBase64(base64));
  return path;
}

/** The PNG as a Blob for the clipboard, or undefined when it is not a PNG. */
export function pngBlob(dataUrl: string | undefined, decode: (base64: string) => ArrayBuffer): Blob | undefined {
  const base64 = pngPayload(dataUrl);
  return base64 === undefined ? undefined : new Blob([decode(base64)], { type: "image/png" });
}

/**
 * The export folder setting as a vault path. Blank stays blank, meaning
 * "beside the note": Obsidian's `normalizePath` would turn it into `/`.
 */
export function exportFolder(setting: string, normalize: (path: string) => string): string {
  return setting.trim() === "" ? "" : normalize(setting.trim());
}

/** A chart title as part of a file name: no path separators, no characters links or file systems refuse. */
export function fileSlug(title: string | undefined): string | undefined {
  if (title === undefined) return undefined;
  const slug = title
    .replace(/[\\/:*?"<>|#^[\]\u0000-\u001f]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 60)
    .replace(/[-.\s]+$/, "");
  return slug === "" ? undefined : slug;
}

const PNG_DATA_URL = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/;

/**
 * The base64 body of a PNG data URL, or undefined for anything else. Writing
 * the bytes of an SVG, or of an empty canvas's `data:,`, into a `.png` would
 * leave a file that looks fine in the vault and fails to open.
 */
export function pngPayload(dataUrl: string | undefined): string | undefined {
  if (dataUrl === undefined) return undefined;
  return PNG_DATA_URL.exec(dataUrl)?.[1];
}

/** Never overwrites: an existing name gets a numeric suffix. */
function freeName(target: ExportTarget, folder: string, stem: string): string {
  const join = (name: string): string => (folder === "" ? name : `${folder}/${name}`);
  let candidate = join(`${stem}.png`);
  let counter = 2;
  while (target.exists(candidate)) {
    candidate = join(`${stem}-${counter}.png`);
    counter++;
  }
  return candidate;
}

async function prepareFolder(target: ExportTarget, options: ExportOptions): Promise<string> {
  const folder = options.folder === "" ? parentOf(options.notePath) : options.folder;
  if (folder !== "") await target.ensureFolder(folder);
  return folder;
}

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

function baseName(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}
