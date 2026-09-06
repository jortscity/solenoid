// Write Properties (bundle 24 item B): a cube of rows → notes' YAML frontmatter, LINE-LEVEL
// (frontmatterPatch, the ONE writer of a note's YAML). Its own file so connection.ts — whose
// Import nodes call a private this.run() fetch helper — stays clear of the sinkRunButtonOnly
// write-API scan. data() only plans; Preview reads + resolves; Run applies behind the Run
// button (armed), gated on hasFs() so the headless `--run` can drive it.
import { ClassicPreset } from "rete";
import { cubeIn, frameOut } from "./shared";
import { planPropertyWrites, propertyPlanFrame, resolveKey, patchFrontmatter, type PlanRow } from "../frontmatterPatch";
import { formatDateSerial } from "./dateSerial";
import { type Shape } from "../frameShape";
import { settingsStore } from "../settingsStore";
import { hasFs, readVaultFile, writeTextFilePath, joinPath } from "../fileBridge";
import { isCubeValue, type CubeValue, type FrameValue } from "../frame";
import { isSolError, type SolError } from "../errorValue";

export type WritePropertiesStatus = "idle" | "previewing" | "writing" | "ok" | "error";

/** The notes named in a cube (its path + name columns), so a string cell matching one
 *  serializes as a `[[link]]`. */
function noteNamesOf(cube: CubeValue): Set<string> {
  const names = new Set<string>();
  for (const c of cube.columns) {
    if (c.name !== "path" && c.name !== "name") continue;
    for (const cell of c.cells) if (typeof cell === "string" && cell) names.add(cell);
  }
  return names;
}

/** A cube column's Obsidian property-type name (for the .obsidian/types.json registration). */
function obsidianTypeName(cube: CubeValue, key: string): string {
  const col = cube.columns.find((c) => c.name === key);
  if (col && col.cells.some((cell) => Array.isArray(cell))) return "multitext";
  switch (col?.type) {
    case "number":  return "number";
    case "logical": return "checkbox";
    case "date":    return "date";
    default:        return "text";
  }
}

/** Now as a local-wall-clock Excel serial (date + time of day). */
function nowSerial(): number {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 86400000 + 25569;
}

export class WritePropertiesNode extends ClassicPreset.Node {
  static socketDocs: Record<string, string> = {
    rows: "Wiring rows never writes. The write runs only from the Run button, and the node loads disarmed. Needs a `path` column naming each note.",
    plan: "One row per note × property: path, key, the note's current value, the value to write, and the action. Preview reads the notes to resolve add / update / unchanged / refused.",
  };
  label: string;
  /** Absolute vault path, per node — defaults from the obsidianVault setting at creation. */
  vault: string;
  /** Columns to write, comma-separated; "" = every writable column present. */
  stringLiterals: Record<string, string> = { keys: "" };
  /** Append + register a key the note doesn't have yet. */
  addMissing = true;
  /** Never persisted (sinkRunButtonOnly) — always false on a fresh construction. */
  enabled = false;
  cachedCube: CubeValue | SolError | null = null;
  cachedPlan: FrameValue | SolError | null = null;
  private planRows: PlanRow[] = [];
  status: WritePropertiesStatus = "idle";
  statusMessage = "";
  width = 262; height = 250;

  frameShape(): Shape {
    return { columns: [
      { name: "path", type: "string" }, { name: "key", type: "string" },
      { name: "before", type: "string" }, { name: "after", type: "string" }, { name: "action", type: "string" },
    ] };
  }

  constructor(init?: { label?: string; vault?: string; addMissing?: boolean }) {
    super("WriteProperties");
    this.label = init?.label ?? "Write Properties";
    this.vault = init?.vault ?? settingsStore.get("obsidianVault") ?? "";
    if (init?.addMissing === false) this.addMissing = false;
    this.addInput("rows", cubeIn("Rows"));
    this.addOutput("plan", frameOut("Plan"));
  }

  // Caches + plans only; never touches disk.
  data(inputs: { rows?: (CubeValue | SolError | null)[] }): { plan: FrameValue | SolError | null } {
    const raw = inputs.rows?.[0] ?? null;
    if (raw === this.cachedCube) return { plan: this.cachedPlan }; // unchanged — keep Preview's resolutions
    this.cachedCube = raw;
    if (isSolError(raw)) { this.cachedPlan = raw; this.planRows = []; return { plan: raw }; }
    if (!isCubeValue(raw)) { this.cachedPlan = null; this.planRows = []; return { plan: null }; }
    this.planRows = planPropertyWrites(raw, this.stringLiterals.keys ?? "", noteNamesOf(raw));
    this.cachedPlan = propertyPlanFrame(this.planRows);
    return { plan: this.cachedPlan };
  }

  private byPath(): Map<string, PlanRow[]> {
    const m = new Map<string, PlanRow[]>();
    for (const r of this.planRows) {
      const list = m.get(r.path) ?? [];
      list.push(r);
      m.set(r.path, list);
    }
    return m;
  }

  /** Read each note and resolve every row's action + current value. Never writes. */
  async preview(): Promise<void> {
    if (this.status === "previewing" || this.status === "writing") return;
    if (!this.planRows.length) { this.status = "error"; this.statusMessage = "Nothing to write. Connect rows."; return; }
    if (this.vault.trim() === "") { this.status = "error"; this.statusMessage = "Choose a vault"; return; }
    this.status = "previewing";
    try {
      for (const [p, rows] of this.byPath()) {
        let text: string;
        try { text = await readVaultFile(this.vault, p); }
        catch { for (const r of rows) { r.action = "unreadable"; r.before = ""; r.reason = undefined; } continue; }
        for (const r of rows) {
          const { action, before } = resolveKey(text, r.key, r.value);
          r.before = before;
          r.action = action === "add" && !this.addMissing ? "unchanged" : action;
          r.reason = action === "refused" ? "nested block" : undefined;
        }
      }
      this.cachedPlan = propertyPlanFrame(this.planRows);
      const n = (a: string) => this.planRows.filter((r) => r.action === a).length;
      this.status = "idle";
      this.statusMessage = `Preview: ${n("add")} to add, ${n("update")} to update, ${n("unchanged")} unchanged` +
        `${n("refused") ? `, ${n("refused")} refused` : ""}${n("unreadable") ? `, ${n("unreadable")} unreadable` : ""}`;
    } catch (e) {
      this.status = "error";
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
  }

  /** Call ONLY from the Run button (or the headless --run); re-entrancy-guarded. */
  async run(): Promise<void> {
    if (this.status === "writing" || this.status === "previewing") return;
    if (!this.enabled) { this.status = "error"; this.statusMessage = "Disabled. Arm it first."; return; }
    if (!hasFs()) { this.status = "error"; this.statusMessage = "Writing needs the desktop app"; return; }
    if (this.vault.trim() === "") { this.status = "error"; this.statusMessage = "Choose a vault"; return; }
    if (isSolError(this.cachedCube)) { this.status = "error"; this.statusMessage = this.cachedCube.code; return; }
    if (!this.planRows.length) { this.status = "error"; this.statusMessage = "Nothing to write. Connect rows."; return; }
    this.status = "writing";
    let wrote = 0, changed = 0, failed = 0;
    const failures: string[] = [];
    const newTypes = new Map<string, string>(); // key → obsidian type, for addMissing
    const cube = isCubeValue(this.cachedCube) ? this.cachedCube : null;
    try {
      for (const [p, rows] of this.byPath()) {
        let text: string;
        try { text = await readVaultFile(this.vault, p); }
        catch { failed++; if (failures.length < 3) failures.push(`${p}: unreadable`); continue; }
        // Only the rows that would change; a fresh resolve so a stale Preview can't misfire.
        const patch: Record<string, PlanRow["value"]> = {};
        let touched = 0;
        for (const r of rows) {
          const { action } = resolveKey(text, r.key, r.value);
          if (action === "refused") continue;
          if (action === "add" && !this.addMissing) continue;
          if (action === "unchanged") continue;
          patch[r.key] = r.value;
          touched++;
          if (action === "add" && cube) newTypes.set(r.key, obsidianTypeName(cube, r.key));
        }
        // Bump an existing dateModified / updated in its own form.
        for (const stampKey of ["dateModified", "updated"]) {
          const cur = resolveKey(text, stampKey, "");
          if (cur.action !== "add") {
            patch[stampKey] = formatDateSerial(nowSerial(), /^\d{4}-\d{2}-\d{2}$/.test(cur.before) ? "YYYY-MM-DD" : "YYYY-MM-DDTHH:mm:ss");
          }
        }
        if (touched === 0) continue;
        const { text: out } = patchFrontmatter(text, patch);
        try {
          await writeTextFilePath(await joinPath(this.vault, ...p.split("/")), out);
          wrote++; changed += touched;
        } catch (e) {
          failed++;
          if (failures.length < 3) failures.push(`${p}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (this.addMissing && newTypes.size > 0) await this.registerTypes(newTypes);
      this.status = failed ? "error" : "ok";
      this.statusMessage = `${changed} propert${changed === 1 ? "y" : "ies"} across ${wrote} note${wrote === 1 ? "" : "s"}` +
        `${failed ? `, ${failed} failed — ${failures.join("; ")}` : ""}`;
    } catch (e) {
      this.status = "error";
      this.statusMessage = e instanceof Error ? e.message : String(e);
    }
  }

  /** Merge new keys' types into `.obsidian/types.json` (one JSON write). Best effort. */
  private async registerTypes(newTypes: Map<string, string>): Promise<void> {
    try {
      let types: Record<string, string> = {};
      try {
        const parsed = JSON.parse(await readVaultFile(this.vault, ".obsidian/types.json")) as { types?: Record<string, string> };
        types = parsed.types ?? {};
      } catch { /* no file yet */ }
      let added = false;
      for (const [k, t] of newTypes) if (!(k in types)) { types[k] = t; added = true; }
      if (!added) return;
      await writeTextFilePath(await joinPath(this.vault, ".obsidian", "types.json"), JSON.stringify({ types }, null, 2) + "\n");
    } catch { /* registration is a convenience, never a write failure */ }
  }
}
