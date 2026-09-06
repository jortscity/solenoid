import { useLayoutEffect, useRef, useState } from "react";
import type { CubeInputNode as CubeInputNodeType } from "../rete-nodes";
import { NodeShell, type NodeProps } from "./nodeKit";
import { CubeDisplay } from "./CubeDisplay";
import { FieldResizeGrip } from "./FieldResizeGrip";
import { processGraph } from "../process";
import { scheduleAutosave } from "../persistence";
import { nodeDisplayName } from "../catalogUtils";
import { parseCubeRecords, cubeRecordsToText, type CubeRecord } from "../literalEditors";

// The literal cube source: the Source textarea holds the JSON rows of records (the stored
// truth, Enter inserts a newline so it commits on blur), and the cube chip opens the cube
// popup as an EDITOR bound to this node (cubePopup edit binding).
export function CubeInputComponent({ data, emit }: NodeProps<CubeInputNodeType>) {
  const [draft, setDraft] = useState(data.cubeText);
  useLayoutEffect(() => { setDraft(data.cubeText); }, [data.cubeText]);
  const ref = useRef<HTMLTextAreaElement>(null);

  function commit() {
    if (draft === data.cubeText) return;
    data.cubeText = draft;
    scheduleAutosave();
    void processGraph();
  }

  // The popup edits records; every Save re-serializes them into the stored text.
  const edit = {
    records: (): CubeRecord[] => { const p = parseCubeRecords(data.cubeText); return "records" in p ? p.records : []; },
    save: (records: CubeRecord[]) => {
      data.cubeText = cubeRecordsToText(records);
      setDraft(data.cubeText);
      scheduleAutosave();
      void processGraph();
    },
  };

  return (
    <NodeShell node={data} emit={emit}>
      <CubeDisplay cube={data.cachedResult} label={nodeDisplayName(data)} edit={edit} />
      <div className="solenoid-field-resizable">
        <textarea
          ref={ref}
          className="solenoid-mermaid-source"
          value={draft}
          spellCheck={false}
          title="Rows of records as JSON. A value may be a number, text, a list, or a list of records."
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onPointerDown={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
        <FieldResizeGrip targetRef={ref} />
      </div>
    </NodeShell>
  );
}
