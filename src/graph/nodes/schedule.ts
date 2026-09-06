import { ClassicPreset } from "rete";
import { cubeIn, cubeOut, dateIn, dateOut, strOut, dateListIn } from "./shared";
import { isSolError, type SolError } from "../errorValue";
import { isCubeValue, type CubeValue } from "../frame";
import { scheduleTasks } from "../scheduleCpm";

// The Schedule node (1.4 H6): one eager verb over a tasks CUBE — the critical-path pass
// lives in scheduleCpm.ts; this class only reads its inputs and caches the three outputs.
// Rows come as a cube because Predecessors is a list cell (a frame widens in; its scalar
// Predecessors cell is then ONE name).

export type ScheduleMode = "working" | "calendar";

export const SCHEDULE_MODE_OPTIONS: ReadonlyArray<{ value: ScheduleMode; label: string; title: string }> = [
  { value: "working",  label: "Working days",  title: "Durations count Monday to Friday, skipping the Holidays list" },
  { value: "calendar", label: "Calendar days", title: "Durations count every day" },
];

/** Today as the LOCAL calendar day — the start a fresh card schedules from. */
function todaySerial(): number {
  const d = new Date();
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000 + 25569;
}

export class ScheduleNode extends ClassicPreset.Node {
  static socketDocs: Record<string, string> = {
    tasks: "One row per task. Task is the first text column (names must be unique), Duration the first number column in days (blank or 0 is a milestone), and Predecessors a list cell naming the tasks that must finish first. An optional Project column groups the gantt into sections.",
    start: "The project start. Unwired, the schedule starts today.",
    holidays: "Dates to skip alongside weekends. Only read in Working days mode.",
    cube: "The rows in their original order with Start, Finish, Float (days a task can slip without moving the finish) and Critical (Float is 0) appended.",
    gantt: "Mermaid gantt source for the schedule. Wire it into a Mermaid node to draw it, or into a Report.",
  };

  label: string;
  mode: ScheduleMode;
  stringLiterals: Record<string, string> = {}; // holidays: typeable datelist CSV
  cachedResult: CubeValue | SolError | null = null;
  cachedFinish: number | SolError | null = null;
  cachedGantt: string | SolError | null = null;
  width = 240; height = 260;

  constructor(init?: { label?: string; mode?: ScheduleMode }) {
    super("Schedule");
    this.label = init?.label ?? "Schedule";
    this.mode = init?.mode === "calendar" ? "calendar" : "working";
    this.addInput("tasks", cubeIn("Tasks"));
    this.addInput("start", dateIn("Start"));
    this.addInput("holidays", dateListIn("Holidays"));
    this.addOutput("cube", cubeOut("Schedule"));
    this.addOutput("finish", dateOut("Project finish"));
    this.addOutput("gantt", strOut("Gantt"));
  }

  data(inputs: { tasks?: (CubeValue | null)[]; start?: (number | null)[]; holidays?: (number | null)[][] }) {
    const tasks = inputs.tasks?.[0] ?? null;
    // A wired blank start is "no start yet": nothing to schedule. Unwired = today.
    const start = inputs.start ? inputs.start[0] : todaySerial();
    if (!isCubeValue(tasks) || start == null || !Number.isFinite(start)) {
      this.cachedResult = null; this.cachedFinish = null; this.cachedGantt = null;
      return { cube: null, finish: null, gantt: null };
    }
    try {
      const r = scheduleTasks(tasks, { start, workingDays: this.mode === "working", holidays: inputs.holidays?.[0] });
      this.cachedResult = r.cube; this.cachedFinish = r.projectFinish; this.cachedGantt = r.gantt;
      return { cube: r.cube, finish: r.projectFinish, gantt: r.gantt };
    } catch (e) {
      const err = isSolError(e) ? e : null;
      if (!err) throw e;
      this.cachedResult = err; this.cachedFinish = err; this.cachedGantt = err;
      return { cube: err, finish: err, gantt: err };
    }
  }
}
