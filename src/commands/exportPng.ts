/** Anything that can hand over a chart as a PNG data URL. */
export interface PngSource {
  /** Undefined when there is no chart to export, e.g. the block shows an error. */
  pngDataUrl(options: PngOptions): string | undefined;
}

export interface PngOptions {
  /** Pixel multiplier. */
  scale: number;
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
  folder: string;
  scale: number;
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
  const folder = options.folder === "" ? parentOf(options.notePath) : options.folder;
  if (folder !== "") await target.ensureFolder(folder);

  const stem = baseName(options.notePath);
  const written: string[] = [];
  let skipped = 0;

  for (let index = 0; index < controllers.length; index++) {
    const base64 = pngPayload(controllers[index]!.pngDataUrl({ scale: options.scale }));
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

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut < 0 ? "" : path.slice(0, cut);
}

function baseName(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? name : name.slice(0, dot);
}
