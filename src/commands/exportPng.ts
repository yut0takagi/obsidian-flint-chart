import type { BlockController } from "../render/BlockController";

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
  controllers: BlockController[],
  target: ExportTarget,
  options: ExportOptions,
): Promise<ExportOutcome> {
  const folder = options.folder === "" ? parentOf(options.notePath) : options.folder;
  if (folder !== "") await target.ensureFolder(folder);

  const stem = baseName(options.notePath);
  const written: string[] = [];
  let skipped = 0;

  for (let index = 0; index < controllers.length; index++) {
    const dataUrl = controllers[index]!.dataUrl(options.scale);
    const base64 = dataUrl?.split(",")[1];
    if (base64 === undefined || base64 === "") {
      skipped++;
      continue;
    }
    const path = freeName(target, folder, `${stem}-chart-${index + 1}`);
    await target.writeBinary(path, target.decodeBase64(base64));
    written.push(path);
  }

  return { written, skipped };
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
