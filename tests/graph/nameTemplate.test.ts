import { describe, it, expect } from "vitest";
import { renderNameTemplate, shiftSerial, sanitizeSegment, hasTemplateTokens } from "../../src/graph/nameTemplate";
import { parseDateToSerial } from "../../src/graph/nodes/dateSerial";

const d = parseDateToSerial("2026-09-07");
const ctx = { date: d, name: "Weekly review", doc: "Ops/Q3: plan", daily: { folder: "Daily", format: "YYYY-MM-DD" } };

describe("renderNameTemplate — Obsidian's grammar (R1/R2)", () => {
  it("{{date}} and {{today}} default to YYYY-MM-DD; {{date:FORMAT}} uses the app's tokens", () => {
    expect(renderNameTemplate("{{date}}", ctx)).toBe("2026-09-07");
    expect(renderNameTemplate("{{today}} notes", ctx)).toBe("2026-09-07 notes");
    expect(renderNameTemplate("{{date:DD-MMM-YYYY}}", ctx)).toBe("07-Sep-2026");
    expect(renderNameTemplate("{{ date : YYYY }}", ctx)).toBe("2026");
  });
  it("offsets: days, weeks, calendar months and years, with an optional format", () => {
    expect(renderNameTemplate("{{date+7d}}", ctx)).toBe("2026-09-14");
    expect(renderNameTemplate("{{date-1w}}", ctx)).toBe("2026-08-31");
    expect(renderNameTemplate("{{date+1m:YYYY-MM}}", ctx)).toBe("2026-10");
    expect(renderNameTemplate("{{date-1y}}", ctx)).toBe("2025-09-07");
    expect(shiftSerial(parseDateToSerial("2026-01-31"), "+", 1, "m")).toBe(parseDateToSerial("2026-03-03")); // JS rollover
  });
  it("{{daily}} is the Daily notes folder + format; {{daily+1d}} tomorrow's; defaults with no config", () => {
    expect(renderNameTemplate("{{daily}}", ctx)).toBe("Daily/2026-09-07");
    expect(renderNameTemplate("{{daily+1d}}", ctx)).toBe("Daily/2026-09-08");
    expect(renderNameTemplate("{{daily}}", { ...ctx, daily: undefined })).toBe("2026-09-07");
    expect(renderNameTemplate("{{daily}}", { ...ctx, daily: { folder: "/Journal/", format: "DD MMM YYYY" } })).toBe("Journal/07 Sep 2026");
  });
  it("{{name}} / {{doc}} are sanitized for a file name; unknown tokens stay visible", () => {
    expect(renderNameTemplate("{{name}} — {{doc}}", ctx)).toBe("Weekly review — Ops Q3 plan");
    expect(renderNameTemplate("{{bogus}}", ctx)).toBe("{{bogus}}");
    expect(sanitizeSegment('a<b>:"c"|d?*')).toBe("a b c d");
  });
  it("hasTemplateTokens spots a token and ignores plain names", () => {
    expect(hasTemplateTokens("Weekly {{date}}")).toBe(true);
    expect(hasTemplateTokens("Weekly")).toBe(false);
  });
});
