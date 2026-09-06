import { describe, it, expect } from "vitest";
import { mergeNoteText } from "../../src/graph/obsidianWrite";
import { WriteObsidianNode } from "../../src/graph/nodes/obsidian";
import { extractInit } from "../../src/graph/copyPaste";
import { beginMarker, END_MARKER } from "../../src/graph/managedBlock";
import { parseDateToSerial } from "../../src/graph/nodes/dateSerial";
import { makeDocument } from "../../src/graph/documentValue";

// Bundle item C: overwrite | append | block, and the name templates on the writer.

describe("mergeNoteText", () => {
  it("overwrite: the note is the document; a missing note is created in every mode", () => {
    expect(mergeNoteText("old", "new", "overwrite", "W")).toBe("new");
    expect(mergeNoteText(null, "new", "append", "W")).toBe("new");
    expect(mergeNoteText(null, "new", "block", "W")).toBe(`${beginMarker("W")}\nnew\n${END_MARKER}\n`);
  });
  it("append: one blank line, then the document; the existing text is untouched", () => {
    expect(mergeNoteText("# Note\n\nbody\n\n", "added", "append", "W")).toBe("# Note\n\nbody\n\nadded");
  });
  it("block: the writer's span is replaced; a refused splice throws with the reason", () => {
    const B = beginMarker("Weekly");
    const before = `mine\n${B}\nold\n${END_MARKER}\nalso mine\n`;
    expect(mergeNoteText(before, "fresh", "block", "Weekly")).toBe(`mine\n${B}\nfresh\n${END_MARKER}\nalso mine\n`);
    expect(() => mergeNoteText(before, "%% no %%", "block", "Weekly")).toThrow(/Refused/);
  });
});

describe("WriteObsidianNode modes + templates", () => {
  it("mode persists through extractInit, defaults to overwrite, a stale value falls back", () => {
    expect(new WriteObsidianNode().mode).toBe("overwrite");
    expect(extractInit(new WriteObsidianNode({ mode: "block" }) as never).mode).toBe("block");
    expect(new WriteObsidianNode({ mode: "nope" as never }).mode).toBe("overwrite");
    expect(Object.keys(new WriteObsidianNode().inputs)).toEqual(["in", "date"]);
  });
  it("renderedTarget renders the templates against the wired date (else today), the node and doc names", () => {
    const n = new WriteObsidianNode({ label: "Weekly review", fileName: "{{date:YYYY-MM-DD}} {{name}}", subfolder: "{{doc}}/{{date+1w:YYYY}}" });
    n.data({ in: [makeDocument("x")], date: [parseDateToSerial("2026-12-30")] });
    const t = n.renderedTarget("Ops plan");
    expect(t.templated).toBe(true);
    expect(t.fileName).toBe("2026-12-30 Weekly review");
    expect(t.subfolder).toBe("Ops plan/2027");
    const plain = new WriteObsidianNode({ fileName: "Notes" }).renderedTarget("D");
    expect(plain).toEqual({ fileName: "Notes", subfolder: "", templated: false });
  });
  it("{{daily}} takes the Daily notes config's folder + format", () => {
    const n = new WriteObsidianNode({ fileName: "{{daily}}" });
    n.data({ in: [makeDocument("x")], date: [parseDateToSerial("2026-09-07")] });
    expect(n.renderedTarget("D", { folder: "Journal", format: "DD MMM YYYY" }).fileName).toBe("Journal/07 Sep 2026");
  });
});
