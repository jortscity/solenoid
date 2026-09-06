import { useEffect, useState, type ReactNode } from "react";
import { cubePopup, type CubeEditBinding } from "../cubePopupStore";
import { tablePopup } from "../tablePopupStore";
import { recordsToCube } from "../frame";
import type { FrameSourceColumn } from "../frame";
import {
  getAtPath, setAtPath, recordsShape, parseCellText, cellTextOf, listRowsFromCells,
  type CubePath, type CubeRecord,
} from "../literalEditors";
import { stopDragStart } from "../coarse";

// The Cube Input's editing cells (cubePopup edit mode). A scalar edits inline; a list
// opens the List editor bound to the cell; a frame-shaped record list opens the Frame
// editor bound to it; a cube-shaped one drills deeper in this popup with the same rules.
// Every Save patches the records at the cell's path and re-renders the popup from them.

/** The current records → the cube view at `path` (a records list) for the drill stack. */
export function cubeViewAt(records: CubeRecord[], path: CubePath, label: string) {
  const sub = path.length ? getAtPath(records, path) : records;
  const rows = Array.isArray(sub) ? (sub as CubeRecord[]) : [];
  return { kind: "cube" as const, cube: recordsToCube(rows), label, path };
}

function commitAt(edit: CubeEditBinding, path: CubePath, value: unknown) {
  const next = setAtPath(edit.records(), path, value);
  edit.save(next);
  cubePopup.refresh();
}

function openListEditor(edit: CubeEditBinding, path: CubePath, label: string, current: unknown[], accent?: string) {
  tablePopup.open({
    title: label,
    data: current.map((v) => [cellTextOf(v)]),
    headers: [label],
    cellType: "string",
    onSaveRaw: (cells) => commitAt(edit, path, listRowsFromCells(cells).map(parseCellText)),
    accent,
  });
}

function openFrameEditor(edit: CubeEditBinding, path: CubePath, label: string, rows: CubeRecord[], accent?: string) {
  const keys: string[] = [];
  for (const r of rows) for (const k of Object.keys(r)) if (!keys.includes(k)) keys.push(k);
  const cols: FrameSourceColumn[] = keys.map((name) => ({ name, type: "string", cells: rows.map((r) => cellTextOf(r[name])) }));
  tablePopup.open({
    title: label,
    data: rows.map((r) => keys.map((k) => cellTextOf(r[k]))),
    headers: keys,
    columnTypes: keys.map(() => "string"),
    cellType: "string",
    editableHeaders: true,
    literalSource: true,
    lambdaOptions: [],
    sourceLambdas: cols.map(() => undefined),
    sourceExprs: cols.map(() => undefined),
    onSaveSource: (columns) => {
      const n = columns.reduce((m, c) => Math.max(m, c.cells.length), 0);
      const next: CubeRecord[] = Array.from({ length: n }, (_, i) => {
        const rec: CubeRecord = {};
        for (const c of columns) rec[c.name] = parseCellText(c.cells[i] ?? "");
        return rec;
      });
      commitAt(edit, path, next);
    },
    accent,
  });
}

function InlineCell({ value, onCommit }: { value: unknown; onCommit: (text: string) => void }) {
  const [draft, setDraft] = useState(cellTextOf(value));
  useEffect(() => { setDraft(cellTextOf(value)); }, [value]);
  return (
    <input
      className="table-popup__cell-input"
      value={draft}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== cellTextOf(value)) onCommit(draft); }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") { setDraft(cellTextOf(value)); e.currentTarget.blur(); e.stopPropagation(); }
      }}
      onPointerDown={stopDragStart}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

/** One editable cell at [row, key] under `path`. */
export function CubeEditCell({ edit, path, row, column, accent }: {
  edit: CubeEditBinding;
  path: CubePath;
  row: number;
  column: string;
  accent?: string;
}): ReactNode {
  const records = edit.records();
  const cellPath: CubePath = [...path, row, column];
  const value = getAtPath(records, cellPath);
  const shape = recordsShape(value);
  const stop = (e: React.MouseEvent | React.PointerEvent) => e.stopPropagation();
  const chip = (mod: "cube" | "frame" | "array", text: string, onClick: () => void, title: string) => (
    <button type="button" className={`solenoid-array-chip solenoid-array-chip--${mod} solenoid-array-chip--sm`} title={title}
      onPointerDown={stop} onMouseDown={stop} onClick={(e) => { stop(e); onClick(); }}>
      {text}
    </button>
  );
  if (shape === "list" || shape === "empty") {
    const list = (value ?? []) as unknown[];
    return chip("array", `[List ${list.length}]`, () => openListEditor(edit, cellPath, column, list, accent), "Edit the list");
  }
  if (shape === "frame") {
    const rows = value as CubeRecord[];
    return chip("frame", `[${rows.length}×${Object.keys(rows[0] ?? {}).length} Frame]`, () => openFrameEditor(edit, cellPath, column, rows, accent), "Edit the nested table");
  }
  if (shape === "cube") {
    const rows = Array.isArray(value) ? (value as CubeRecord[]) : [value as CubeRecord];
    return chip("cube", `[${rows.length} row${rows.length === 1 ? "" : "s"} Cube]`, () => cubePopup.drill(cubeViewAt(records, cellPath, column)), "Drill in and edit");
  }
  return <InlineCell value={value} onCommit={(text) => commitAt(edit, cellPath, parseCellText(text))} />;
}

/** Footer row controls for the current level: add / remove a record. */
export function CubeEditRows({ edit, path, rows }: { edit: CubeEditBinding; path: CubePath; rows: number }): ReactNode {
  const records = edit.records();
  const level = (path.length ? getAtPath(records, path) : records) as CubeRecord[] | undefined;
  const add = () => commitAt(edit, path, [...(Array.isArray(level) ? level : []), {}]);
  const remove = () => { if (Array.isArray(level) && level.length) commitAt(edit, path, level.slice(0, -1)); };
  return (
    <>
      <button className="table-popup__btn" onClick={add} title="Append an empty record">+ Row</button>
      <button className="table-popup__btn" onClick={remove} disabled={rows === 0} title="Remove the last record">− Row</button>
    </>
  );
}
