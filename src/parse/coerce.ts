/**
 * Turns a raw text cell into a JS value Flint can type.
 *
 * Deliberately conservative: anything that merely *looks* numeric but carries
 * meaning as text — zero-padded codes, `2026-08`, phone numbers — stays text so
 * Flint's semantic types decide how to treat it.
 */

/** `1,234,567` / `1,234.5` — grouped thousands only, never `1,2`. */
const GROUPED = /^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/;
const NUMERIC = /^[+-]?(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?$/;

export function coerceCell(raw: string): string | number | boolean | null {
  const text = raw.trim();
  if (text === "") return null;

  const lower = text.toLowerCase();
  if (lower === "true") return true;
  if (lower === "false") return false;

  let candidate = text;
  if (candidate.endsWith("%")) candidate = candidate.slice(0, -1).trim();
  if (GROUPED.test(candidate)) candidate = candidate.replace(/,/g, "");
  if (!NUMERIC.test(candidate)) return text;

  // Keep zero-padded codes ("007", "0012") as text.
  const digits = candidate.replace(/^[+-]/, "");
  if (digits.length > 1 && digits.startsWith("0") && !digits.startsWith("0.")) return text;

  const value = Number(candidate);
  return Number.isFinite(value) ? value : text;
}
