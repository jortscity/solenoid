import { ClassicPreset } from "rete";
import { frameIn, frameOut, dateIn, dateOut, strOut, dateListIn } from "./shared";
import { jsDateToSerial } from "./dateSerial";
import { isSolError, type SolError } from "../errorValue";
import { type FrameValue } from "../frame";
import type { FrameHint } from "../frameHint";
import { type Shape } from "../frameShape";
import { type FrameShapeContext } from "./frameShapeHook";
import { scheduleTasks } from "../scheduleCpm";

// The Schedule node (1.4 H6): one eager frame verb — the critical-path pass lives in
// scheduleCpm.ts; this class only reads its inputs and caches the three outputs.

export type ScheduleMode = "working" | "calendar";

export const SCHEDULE_MODE_OPTIONS: ReadonlyArray<{ value: ScheduleMode; label: string; title: string }> = [
  { value: "working",  label: "Working days",  title: "Durations count Monday to Friday, skipping the Holidays list" },
  { value: "calendar", label: "Calendar days", title: "Durations count every day" },
];

/** Today at midnight UTC as a serial — the start a fresh card schedules from. */
function todaySerial(): number {
  return Math.floor(jsDateToSerial(new Date()));
}

export class ScheduleNode extends ClassicPreset.Node {
  static socketDocs: Record<string, string> = {
    tasks: "One row per task. Task is the first text column (names must be unique), Duration the first number column in days (blank or 0 is a milestone), and Predecessors a text cell naming the tasks that must finish first, comma-separated. An optional Project column groups the gantt into sections.",
    start: "The project start. Unwired, the schedule starts today.",
    holidays: "Dates to skip alongside weekends. Only read in Working days mode.",
    frame: "The rows in their original order with Start, Finish, Float (days a task can slip without moving the finish) and Critical (Float is 0) appended.",
    gantt: "Mermaid gantt source for the schedule. Wire it into a Mermaid node to draw it, or into a Report.",
  };

  static frameHints: Record<string, FrameHint> = {
    tasks: { columns: [
      { name: "Task", type: "string", cells: ["Demolition", "Plumbing", "Cabinets"] },
      { name: "Duration", type: "number", cells: [2, 3, 4] },
      { name: "Predecessors", type: "string", cells: ["", "Demolition", "Plumbing"] },
    ] },
  };

  label: string;
  mode: ScheduleMode;
  stringLiterals: Record<string, string> = {}; // holidays: typeable datelist CSV
  cachedResult: FrameValue | SolError | null = null;
  cachedFinish: number | SolError | null = null;
  cachedGantt: string | SolError | null = null;
  width = 240; height = 260;

  constructor(init?: { label?: string; mode?: ScheduleMode }) {
    super("Schedule");
    this.label = init?.label ?? "Schedule";
    this.mode = init?.mode === "calendar" ? "calendar" : "working";
    this.addInput("tasks", frameIn("Tasks"));
    this.addInput("start", dateIn("Start"));
    this.addInput("holidays", dateListIn("Holidays"));
    this.addOutput("frame", frameOut("Schedule"));
    this.addOutput("finish", dateOut("Project finish"));
    this.addOutput("gantt", strOut("Gantt"));
  }

  /** The static shape: the tasks frame's columns plus the four appended (same-named input
   *  columns are replaced, as data() does). */
  frameShape(_outKey: string, ctx: FrameShapeContext): Shape | null {
    const input = ctx.inputShape("tasks");
    if (!input) return null;
    const taken = new Set(["Start", "Finish", "Float", "Critical"]);
    return { columns: [
      ...input.columns.filter((c) => !taken.has(c.name)),
      { name: "Start", type: "date" }, { name: "Finish", type: "date" },
      { name: "Float", type: "number" }, { name: "Critical", type: "logical" },
    ] };
  }

  data(inputs: { tasks?: (FrameValue | null)[]; start?: (number | null)[]; holidays?: (number | null)[][] }) {
    const tasks = inputs.tasks?.[0] ?? null;
    // A wired blank start is "no start yet": nothing to schedule. Unwired = today.
    const start = inputs.start ? inputs.start[0] : todaySerial();
    if (!tasks || start == null || !Number.isFinite(start)) {
      this.cachedResult = null; this.cachedFinish = null; this.cachedGantt = null;
      return { frame: null, finish: null, gantt: null };
    }
    try {
      const r = scheduleTasks(tasks, { start, workingDays: this.mode === "working", holidays: inputs.holidays?.[0] });
      this.cachedResult = r.frame; this.cachedFinish = r.projectFinish; this.cachedGantt = r.gantt;
      return { frame: r.frame, finish: r.projectFinish, gantt: r.gantt };
    } catch (e) {
      const err = isSolError(e) ? e : null;
      if (!err) throw e;
      this.cachedResult = err; this.cachedFinish = err; this.cachedGantt = err;
      return { frame: err, finish: err, gantt: err };
    }
  }
}
