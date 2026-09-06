// Obsidian's template grammar for a note's file name / subfolder (bundle item R1/R2):
// `{{date}}` (`{{today}}`), `{{date:FORMAT}}`, offsets `{{date+7d}}` / `{{date-1w}}` /
// `{{date+1m:YYYY-MM}}`, `{{name}}`, `{{doc}}`, `{{daily}}` (the Daily notes plugin's path for
// the day, `{{daily+1d}}` tomorrow's). Pure: the caller supplies the date and the names;
// nothing here reads a clock or a file.

import { formatDateSerial, serialToJsDate, jsDateToSerial } from "./nodes/dateSerial";
import type { DailyNotesConfig } from "./dailyNotesConfig";

export interface NameTemplateContext {
  /** The date every `{{date}}` resolves against, a serial (the writer's `date` input, else Run's wall clock). */
  date: number;
  /** `{{name}}` — the writer's node name. */
  name: string;
  /** `{{doc}}` — the document's name. */
  doc: string;
  /** `{{daily}}` — the Daily notes plugin's folder + file-name format. */
  daily?: DailyNotesConfig;
}

const DEFAULT_FORMAT = "YYYY-MM-DD";
const TOKEN = /\{\{\s*(date|today|daily|name|doc)\s*(?:([+-])\s*(\d+)\s*([dwmy]))?\s*(?::\s*([^}]+?))?\s*\}\}/gi;

/** Shift a serial by an offset in days / weeks / months / years (calendar months keep the
 *  day-of-month, clamped by the JS Date rollover). */
export function shiftSerial(serial: number, sign: "+" | "-", n: number, unit: "d" | "w" | "m" | "y"): number {
  const k = sign === "-" ? -n : n;
  if (unit === "d") return serial + k;
  if (unit === "w") return serial + 7 * k;
  const d = serialToJsDate(serial);
  if (unit === "m") d.setUTCMonth(d.getUTCMonth() + k);
  else d.setUTCFullYear(d.getUTCFullYear() + k);
  return jsDateToSerial(d);
}

/** Characters a file name / path segment must not carry (Windows + Obsidian's set, plus
 *  the path separators and ASCII control characters). */
export function sanitizeSegment(s: string): string {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Render a template. Unknown tokens are left as typed (so a typo stays visible in the
 *  file name rather than vanishing). Slashes from `{{daily}}` stay path separators; the
 *  caller splits on them. */
export function renderNameTemplate(template: string, ctx: NameTemplateContext): string {
  return template.replace(TOKEN, (_m, kind: string, sign: "+" | "-" | undefined, n: string | undefined, unit: string | undefined, fmt: string | undefined) => {
    const k = kind.toLowerCase();
    if (k === "name") return sanitizeSegment(ctx.name);
    if (k === "doc") return sanitizeSegment(ctx.doc);
    let serial = ctx.date;
    if (sign && n && unit) serial = shiftSerial(serial, sign, Number(n), unit.toLowerCase() as "d" | "w" | "m" | "y");
    if (k === "daily") {
      const cfg = ctx.daily ?? { folder: "", format: DEFAULT_FORMAT };
      const file = formatDateSerial(serial, fmt?.trim() || cfg.format || DEFAULT_FORMAT);
      const folder = cfg.folder.replace(/^\/+|\/+$/g, "");
      return folder ? `${folder}/${file}` : file;
    }
    return formatDateSerial(serial, fmt?.trim() || DEFAULT_FORMAT);
  });
}

/** True when the template carries any `{{…}}` token — the card shows a rendered preview then. */
export function hasTemplateTokens(template: string): boolean {
  TOKEN.lastIndex = 0;
  const has = TOKEN.test(template);
  TOKEN.lastIndex = 0;
  return has;
}
