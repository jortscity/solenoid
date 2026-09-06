// The Schedule verb: a critical-path forward/backward pass over a tasks frame. Pure and
// rete-free (like the frame verbs); the node in nodes/schedule.ts wraps it. Exact integer
// day arithmetic in working-day INDEX space — a date is looked up from its index, so
// weekends and holidays are skipped once, by construction, never re-counted.

import { solError } from "./errorValue";
import { serialToJsDate, formatDateSerial } from "./nodes/dateSerial";
import { type FrameValue, type FrameColumn, type FrameCell } from "./frame";

export interface ScheduleOptions {
  /** Project start, a date serial. The first task can begin on this day (rolled forward
   *  to the next working day when it falls on a skipped one). */
  start: number;
  /** Skip weekends (and `holidays`) when true; every calendar day counts when false. */
  workingDays: boolean;
  /** Date serials to skip in working-day mode; ignored in calendar mode. */
  holidays?: readonly (number | null)[];
}

export interface ScheduleResult {
  /** The input rows in their original order with Start · Finish · Float · Critical appended. */
  frame: FrameValue;
  /** The last task's finish, a date serial. */
  projectFinish: number;
  /** Mermaid `gantt` source for the schedule. */
  gantt: string;
}

interface Task {
  name: string;
  duration: number;
  preds: string[];
  project: string | null;
}

const SATURDAY = 6, SUNDAY = 0;

/** The day-key of a serial (whole days, drift-tolerant), matching nodes/date.ts. */
function dayKey(serial: number): number {
  return Math.floor(serial + 1e-9);
}

/** Read the tasks off the frame: Task = the `Task` column or the first text column;
 *  Duration = the `Duration` column or the first number column; Predecessors = the
 *  `Predecessors` text column (`"A, B"`; blank = none); Project = an optional text column. */
function readTasks(f: FrameValue): Task[] {
  const byName = (n: string) => f.columns.find((c) => c.name.trim().toLowerCase() === n);
  const taskCol = byName("task") ?? f.columns.find((c) => c.type === "string");
  const durCol = byName("duration") ?? f.columns.find((c) => c.type === "number");
  const predCol = byName("predecessors") ?? byName("predecessor") ?? byName("after") ?? byName("depends on");
  const projCol = byName("project") ?? byName("section");
  if (!taskCol) throw solError("#VALUE!", "Schedule needs a Task column (text) naming each task");
  if (!durCol) throw solError("#VALUE!", "Schedule needs a Duration column (number of days)");
  const rows = f.columns.reduce((m, c) => Math.max(m, c.values.length), 0);
  const out: Task[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < rows; i++) {
    const name = String(taskCol.values[i] ?? "").trim();
    if (!name) throw solError("#VALUE!", `Schedule: row ${i + 1} has no task name`);
    if (seen.has(name)) throw solError("#VALUE!", `Schedule: task "${name}" is named twice`);
    seen.add(name);
    const d = durCol.values[i];
    // A blank duration is a milestone, never an error.
    const duration = d == null ? 0 : typeof d === "number" ? d : NaN;
    if (!Number.isFinite(duration) || duration < 0) throw solError("#VALUE!", `Schedule: task "${name}" needs a duration of 0 or more days`);
    const predRaw = predCol ? predCol.values[i] : null;
    const preds = predRaw == null ? [] : String(predRaw).split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    const proj = projCol ? projCol.values[i] : null;
    out.push({ name, duration: Math.ceil(duration), preds, project: proj == null ? null : String(proj).trim() || null });
  }
  return out;
}

/** Kahn's topological order; a cycle names one task on it. */
function topoOrder(tasks: Task[]): number[] {
  const index = new Map(tasks.map((t, i) => [t.name, i]));
  const indeg = tasks.map(() => 0);
  const succ: number[][] = tasks.map(() => []);
  tasks.forEach((t, i) => {
    for (const p of t.preds) {
      const j = index.get(p);
      if (j === undefined) throw solError("#VALUE!", `Schedule: task "${t.name}" waits on "${p}", which is not a task`);
      succ[j].push(i);
      indeg[i]++;
    }
  });
  const queue = tasks.map((_, i) => i).filter((i) => indeg[i] === 0);
  const order: number[] = [];
  while (queue.length) {
    const i = queue.shift()!;
    order.push(i);
    for (const s of succ[i]) if (--indeg[s] === 0) queue.push(s);
  }
  if (order.length !== tasks.length) {
    const stuck = tasks.find((_, i) => indeg[i] > 0)!;
    throw solError("#VALUE!", `Schedule: "${stuck.name}" is in a dependency loop`);
  }
  return order;
}

/** A calendar over the schedule: index k ↔ the k-th counted day on or after `start`. */
class Calendar {
  private readonly serials: number[] = [];
  private readonly skip = new Set<number>();
  constructor(private readonly start: number, private readonly working: boolean, holidays: readonly (number | null)[] | undefined) {
    if (working && holidays) for (const h of holidays) if (typeof h === "number" && Number.isFinite(h)) this.skip.add(dayKey(h));
  }

  private counted(serial: number): boolean {
    if (!this.working) return true;
    const dow = serialToJsDate(serial).getUTCDay();
    return dow !== SATURDAY && dow !== SUNDAY && !this.skip.has(dayKey(serial));
  }

  /** The serial of day index k (0 = the first counted day on or after start). */
  date(k: number): number {
    while (this.serials.length <= k) {
      let next = this.serials.length ? this.serials[this.serials.length - 1] + 1 : dayKey(this.start);
      while (!this.counted(next)) next++;
      this.serials.push(next);
    }
    return this.serials[k];
  }

  /** The skipped dates inside [from, to], for the gantt `excludes` line. */
  skippedBetween(from: number, to: number): number[] {
    const out: number[] = [];
    if (!this.working) return out;
    for (let s = dayKey(from); s <= dayKey(to); s++) if (this.skip.has(s)) out.push(s);
    return out;
  }
}

/** Mermaid gantt escaping: a task name is a label, so the syntax characters go. */
function ganttLabel(s: string): string {
  return s.replace(/[:#;,]/g, " ").replace(/\s+/g, " ").trim() || "task";
}

const ISO = "YYYY-MM-DD";

/** Run the pass. Throws a SolError (`#VALUE!`) naming the offending task on a cycle, an
 *  unknown predecessor, a negative or non-numeric duration, or a duplicate name. */
export function scheduleTasks(f: FrameValue, opts: ScheduleOptions): ScheduleResult {
  const tasks = readTasks(f);
  const order = topoOrder(tasks);
  const index = new Map(tasks.map((t, i) => [t.name, i]));
  const n = tasks.length;
  const es = new Array<number>(n).fill(0);
  const ef = new Array<number>(n).fill(0);
  // Forward: a task starts when its last predecessor has finished (EF is exclusive).
  for (const i of order) {
    const t = tasks[i];
    es[i] = t.preds.reduce((m, p) => Math.max(m, ef[index.get(p)!]), 0);
    ef[i] = es[i] + t.duration;
  }
  const end = ef.reduce((m, v) => Math.max(m, v), 0);
  // Backward: the latest a task may finish is the earliest its successors must start.
  const lf = new Array<number>(n).fill(end);
  const ls = new Array<number>(n).fill(0);
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    ls[i] = lf[i] - tasks[i].duration;
    for (const p of tasks[i].preds) {
      const j = index.get(p)!;
      lf[j] = Math.min(lf[j], ls[i]);
    }
  }

  const cal = new Calendar(opts.start, opts.workingDays, opts.holidays);
  const startCells: FrameCell[] = [];
  const finishCells: FrameCell[] = [];
  const floatCells: FrameCell[] = [];
  const critCells: FrameCell[] = [];
  for (let i = 0; i < n; i++) {
    // A task occupies days [ES, EF); its finish is the last of them. A milestone (0
    // days) sits ON the day its predecessors finish (or the start), not the day after.
    const milestone = tasks[i].duration === 0;
    const s = milestone && es[i] > 0 ? cal.date(es[i] - 1) : cal.date(es[i]);
    const fin = milestone ? s : cal.date(ef[i] - 1);
    const slack = ls[i] - es[i];
    startCells.push(s);
    finishCells.push(fin);
    floatCells.push(slack);
    critCells.push(slack === 0);
  }
  const projectFinish = n === 0 ? dayKey(opts.start) : finishCells.reduce<number>((m, v) => Math.max(m, v as number), 0);

  const appended: FrameColumn[] = [
    { name: "Start", type: "date", values: startCells },
    { name: "Finish", type: "date", values: finishCells },
    { name: "Float", type: "number", values: floatCells },
    { name: "Critical", type: "logical", values: critCells },
  ];
  const taken = new Set(appended.map((c) => c.name));
  const frame: FrameValue = { __frame: true, columns: [...f.columns.filter((c) => !taken.has(c.name)), ...appended] };

  return { frame, projectFinish, gantt: ganttSource(tasks, startCells as number[], finishCells as number[], critCells as boolean[], cal, opts, projectFinish) };
}

function ganttSource(
  tasks: Task[], starts: number[], finishes: number[], crit: boolean[],
  cal: Calendar, opts: ScheduleOptions, projectFinish: number,
): string {
  const lines = ["gantt", `    dateFormat ${ISO}`, "    axisFormat %d %b"];
  if (opts.workingDays) {
    const skipped = tasks.length ? cal.skippedBetween(dayKey(opts.start), projectFinish).map((s) => formatDateSerial(s, ISO)) : [];
    lines.push(`    excludes weekends${skipped.length ? ", " + skipped.join(", ") : ""}`);
  }
  // One section per project when a Project column exists; tasks stay in row order.
  const sections = new Map<string | null, number[]>();
  tasks.forEach((t, i) => {
    const key = t.project;
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(i);
  });
  for (const [project, idxs] of sections) {
    if (project !== null) lines.push(`    section ${ganttLabel(project)}`);
    for (const i of idxs) {
      const t = tasks[i];
      const tags = [t.duration === 0 ? "milestone" : "", crit[i] ? "crit" : ""].filter(Boolean);
      const startIso = formatDateSerial(starts[i], ISO);
      // Mermaid's end is exclusive, so a bar runs to the day after Finish.
      const endIso = formatDateSerial(finishes[i] + 1, ISO);
      const span = t.duration === 0 ? "0d" : endIso;
      lines.push(`    ${ganttLabel(t.name)} :${tags.length ? tags.join(", ") + ", " : ""}t${i}, ${startIso}, ${span}`);
    }
  }
  return lines.join("\n");
}
