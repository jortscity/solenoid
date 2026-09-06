import { describe, it, expect } from "vitest";
import { scheduleTasks } from "../../src/graph/scheduleCpm";
import { parseDateToSerial, formatDateSerial } from "../../src/graph/nodes/dateSerial";
import { isSolError } from "../../src/graph/errorValue";
import type { FrameValue } from "../../src/graph/frame";

const d = (iso: string) => parseDateToSerial(iso);
const iso = (serial: unknown) => formatDateSerial(serial as number, "YYYY-MM-DD");
const MON = d("2026-01-05");

function tasks(rows: [string, number | null, string][], extra?: { project?: string[] }): FrameValue {
  const cols: FrameValue["columns"] = [
    { name: "Task", type: "string", values: rows.map((r) => r[0]) },
    { name: "Duration", type: "number", values: rows.map((r) => r[1]) },
    { name: "Predecessors", type: "string", values: rows.map((r) => r[2] || null) },
  ];
  if (extra?.project) cols.push({ name: "Project", type: "string", values: extra.project });
  return { __frame: true, columns: cols };
}

const col = (f: FrameValue, name: string) => f.columns.find((c) => c.name === name)!.values;

describe("scheduleTasks — the CPM pass", () => {
  it("a chain: each task starts the working day after its predecessor finishes", () => {
    const r = scheduleTasks(tasks([["A", 2, ""], ["B", 3, "A"]]), { start: MON, workingDays: true });
    expect(col(r.frame, "Start").map(iso)).toEqual(["2026-01-05", "2026-01-07"]);
    expect(col(r.frame, "Finish").map(iso)).toEqual(["2026-01-06", "2026-01-09"]);
    expect(col(r.frame, "Float")).toEqual([0, 0]);
    expect(col(r.frame, "Critical")).toEqual([true, true]);
    expect(iso(r.projectFinish)).toBe("2026-01-09");
  });

  it("the kitchen: a diamond, a holiday inside a task, float on the parallel branches, a closing milestone", () => {
    const f = tasks([
      ["Demolition", 2, ""],
      ["Plumbing rough-in", 3, "Demolition"],
      ["Electrical rough-in", 2, "Demolition"],
      ["Drywall", 2, "Plumbing rough-in, Electrical rough-in"],
      ["Paint", 2, "Drywall"],
      ["Cabinets", 4, "Drywall"],
      ["Countertops", 5, "Cabinets, Paint"],
      ["Final inspection", 0, "Countertops"],
    ]);
    const r = scheduleTasks(f, { start: MON, workingDays: true, holidays: [d("2026-01-19")] });
    expect(col(r.frame, "Start").map(iso)).toEqual([
      "2026-01-05", "2026-01-07", "2026-01-07", "2026-01-12", "2026-01-14", "2026-01-14", "2026-01-21", "2026-01-27",
    ]);
    // Cabinets spans the 19 Jan holiday: Wed 14, Thu 15, Fri 16, Tue 20.
    expect(col(r.frame, "Finish").map(iso)).toEqual([
      "2026-01-06", "2026-01-09", "2026-01-08", "2026-01-13", "2026-01-15", "2026-01-20", "2026-01-27", "2026-01-27",
    ]);
    expect(col(r.frame, "Float")).toEqual([0, 0, 1, 0, 2, 0, 0, 0]);
    expect(col(r.frame, "Critical")).toEqual([true, true, false, true, false, true, true, true]);
    expect(iso(r.projectFinish)).toBe("2026-01-27");
    // Original columns first, in row order, then the four appended.
    expect(r.frame.columns.map((c) => c.name)).toEqual(["Task", "Duration", "Predecessors", "Start", "Finish", "Float", "Critical"]);
  });

  it("two roots start together; calendar mode counts weekends", () => {
    const r = scheduleTasks(tasks([["A", 3, ""], ["B", 1, ""], ["C", 1, "A, B"]]), { start: d("2026-01-09"), workingDays: false });
    // Fri 9 → A runs 9, 10, 11; B is Fri 9 only (float 2); C on Mon 12.
    expect(col(r.frame, "Start").map(iso)).toEqual(["2026-01-09", "2026-01-09", "2026-01-12"]);
    expect(col(r.frame, "Float")).toEqual([0, 2, 0]);
  });

  it("a start on a weekend rolls to Monday in working mode; a blank duration is a milestone", () => {
    const r = scheduleTasks(tasks([["Kickoff", null, ""], ["A", 1, "Kickoff"]]), { start: d("2026-01-10"), workingDays: true });
    expect(col(r.frame, "Start").map(iso)).toEqual(["2026-01-12", "2026-01-12"]);
    expect(col(r.frame, "Finish").map(iso)).toEqual(["2026-01-12", "2026-01-12"]);
  });

  it("errors name the task: a cycle, an unknown predecessor, a bad duration, a duplicate", () => {
    const err = (f: FrameValue) => {
      try { scheduleTasks(f, { start: MON, workingDays: true }); } catch (e) { return isSolError(e) ? e : null; }
      return null;
    };
    expect(err(tasks([["A", 1, "B"], ["B", 1, "A"]]))?.message).toMatch(/loop/);
    expect(err(tasks([["A", 1, "Z"]]))?.message).toMatch(/"Z"/);
    expect(err(tasks([["A", -1, ""]]))?.message).toMatch(/"A"/);
    expect(err(tasks([["A", 1, ""], ["A", 1, ""]]))?.message).toMatch(/twice/);
    expect(err(tasks([["A", 1, "B"], ["B", 1, "A"]]))?.code).toBe("#VALUE!");
  });

  it("gantt: excludes weekends + holidays, sections per Project, crit + milestone tags, exclusive end dates", () => {
    const f = tasks([["A", 2, ""], ["B", 1, "A"], ["Done", 0, "B"]], { project: ["Prep", "Prep", "Wrap"] });
    const r = scheduleTasks(f, { start: MON, workingDays: true, holidays: [d("2026-01-06")] });
    expect(r.gantt.split("\n")).toEqual([
      "gantt",
      "    dateFormat YYYY-MM-DD",
      "    axisFormat %d %b",
      "    excludes weekends, 2026-01-06",
      "    section Prep",
      "    A :crit, t0, 2026-01-05, 2026-01-08",
      "    B :crit, t1, 2026-01-08, 2026-01-09",
      "    section Wrap",
      "    Done :milestone, crit, t2, 2026-01-08, 0d",
    ]);
  });

  it("an empty tasks frame schedules nothing and finishes on the start", () => {
    const r = scheduleTasks(tasks([]), { start: MON, workingDays: true });
    expect(col(r.frame, "Start")).toEqual([]);
    expect(iso(r.projectFinish)).toBe("2026-01-05");
  });
});
