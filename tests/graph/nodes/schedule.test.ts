import { describe, it, expect } from "vitest";
import { ScheduleNode } from "../../../src/graph/rete-nodes";
import { extractInit } from "../../../src/graph/copyPaste";
import { parseDateToSerial, formatDateSerial } from "../../../src/graph/nodes/dateSerial";
import { isSolError } from "../../../src/graph/errorValue";
import { isFrameValue, type FrameValue } from "../../../src/graph/frame";

const MON = parseDateToSerial("2026-01-05");
const f: FrameValue = { __frame: true, columns: [
  { name: "Task", type: "string", values: ["A", "B"] },
  { name: "Duration", type: "number", values: [2, 1] },
  { name: "Predecessors", type: "string", values: [null, "A"] },
] };

describe("ScheduleNode", () => {
  it("schedules a wired frame from a wired start; the three outputs agree", () => {
    const n = new ScheduleNode();
    const out = n.data({ tasks: [f], start: [MON] });
    expect(isFrameValue(out.frame)).toBe(true);
    expect(formatDateSerial(out.finish as number, "YYYY-MM-DD")).toBe("2026-01-07");
    expect(String(out.gantt).startsWith("gantt")).toBe(true);
    expect(n.cachedResult).toBe(out.frame);
  });

  it("unwired start = today; a wired BLANK start schedules nothing (value-semantics: propagate)", () => {
    const n = new ScheduleNode();
    const today = n.data({ tasks: [f] });
    expect(isFrameValue(today.frame)).toBe(true);
    const blank = n.data({ tasks: [f], start: [null] });
    expect(blank.frame).toBeNull();
    expect(blank.finish).toBeNull();
    expect(n.cachedResult).toBeNull();
  });

  it("calendar mode counts weekends; the mode round-trips through extractInit and a stale value falls back", () => {
    const n = new ScheduleNode({ mode: "calendar" });
    const out = n.data({ tasks: [f], start: [parseDateToSerial("2026-01-09")] });
    // Fri 9 + Sat 10 for A, then B on Sun 11.
    expect(formatDateSerial(out.finish as number, "YYYY-MM-DD")).toBe("2026-01-11");
    expect(extractInit(n as never).mode).toBe("calendar");
    expect(new ScheduleNode({ mode: "bogus" as never }).mode).toBe("working");
  });

  it("a verb error comes out every socket as the one #VALUE! and is cached", () => {
    const n = new ScheduleNode();
    const bad: FrameValue = { __frame: true, columns: [
      { name: "Task", type: "string", values: ["A"] },
      { name: "Duration", type: "number", values: [1] },
      { name: "Predecessors", type: "string", values: ["A"] },
    ] };
    const out = n.data({ tasks: [bad], start: [MON] });
    expect(isSolError(out.frame) && out.frame.code).toBe("#VALUE!");
    expect(out.gantt).toBe(out.frame);
    expect(n.cachedGantt).toBe(out.frame);
  });
});
