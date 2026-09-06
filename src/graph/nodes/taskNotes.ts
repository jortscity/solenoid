import { ClassicPreset } from "rete";
import { dateIn, cubeOut, frameOut, numOut } from "./shared";
import { connectionStore, scheduleConnectionRecalc, requestNetwork } from "../connectionStore";
import { settingsStore } from "../settingsStore";
import { apiKeyStore } from "../apiKeyStore";
import { fetchText } from "../httpBridge";
import { jsDateToSerial } from "./dateSerial";
import { cubeFromColumns, type CubeValue, type FrameValue } from "../frame";
import {
  TASKNOTES_KEY_ID, TASKS_PAGE, tasksUrl, eventsUrl, statsUrl, authHeaders,
  parseTasksPage, tasksToCube, parseEvents, parseStats,
  type TaskNotesProvider, type TaskRecord, type TaskStats,
} from "../taskNotesApi";

// TaskNotes (Obsidian plugin) over its local HTTP API — the Obsidian bundle's item F.
// One connection node, a provider select: Tasks → a cube, Calendar → a frame between two
// dates, Stats → scalars. The WebSource sync-background fetch pattern, so it rides the
// C2 network gate; the provider switch reshapes the sockets (the op-card pattern).

const INPUTS: Record<TaskNotesProvider, string[]> = { tasks: [], calendar: ["from", "to"], stats: [] };
const OUTPUTS: Record<TaskNotesProvider, string[]> = {
  tasks: ["tasks"], calendar: ["events"], stats: ["total", "completed", "active", "overdue", "archived"],
};

const EMPTY_TASKS: CubeValue = cubeFromColumns([{ name: "title", cells: [] }]);
const EMPTY_EVENTS: FrameValue = { __frame: true, columns: [
  { name: "Title", type: "string", values: [] }, { name: "Start", type: "date", values: [] },
  { name: "End", type: "date", values: [] }, { name: "Source", type: "string", values: [] },
] };

function todaySerial(): number {
  return Math.floor(jsDateToSerial(new Date()));
}

export class TaskNotesNode extends ClassicPreset.Node {
  static socketDocs: Record<string, string> = {
    tasks: "One row per task. Lists (projects, contexts, tags, blocked-by) are list cells; time entries and completed instances are nested tables. Filter, Sort and Get Column read the scalar columns; Unnest opens a nested one.",
    from: "First day of the calendar window. Unwired, today.",
    to: "Last day of the calendar window. Unwired, seven days from today.",
    events: "One row per calendar event in the window: title, start, end, source.",
  };

  label: string;
  provider: TaskNotesProvider;
  /** Minutes, 0 = off — the component runs the timer. */
  refreshMinutes: number;
  width = 240; height = 200;
  /** Read by the component; never persisted. */
  cachedTasks: TaskRecord[] | null = null;
  cachedEvents: FrameValue | null = null;
  cachedStats: TaskStats | null = null;
  private _lastKey: string | undefined;

  constructor(init?: { label?: string; provider?: TaskNotesProvider; refreshMinutes?: number }) {
    super("TaskNotes");
    this.label = init?.label ?? "TaskNotes";
    this.provider = init?.provider === "calendar" || init?.provider === "stats" ? init.provider : "tasks";
    this.refreshMinutes = init?.refreshMinutes ?? 0;
    this.applyProvider();
  }

  /** The socket keys a switch to `next` would remove (inputs + outputs). Callers on a
   *  live graph prune their cables BEFORE calling setProvider (onePrunePath). */
  keysDroppedBySwitch(next: TaskNotesProvider): { inputs: string[]; outputs: string[] } {
    return {
      inputs: INPUTS[this.provider].filter((k) => !INPUTS[next].includes(k)),
      outputs: OUTPUTS[this.provider].filter((k) => !OUTPUTS[next].includes(k)),
    };
  }

  setProvider(next: TaskNotesProvider): void {
    if (next === this.provider) return;
    this.provider = next;
    this.applyProvider();
    this._lastKey = undefined;
  }

  private applyProvider(): void {
    for (const k of Object.keys(this.inputs)) if (!INPUTS[this.provider].includes(k)) this.removeInput(k);
    for (const k of Object.keys(this.outputs)) if (!OUTPUTS[this.provider].includes(k)) this.removeOutput(k);
    if (this.provider === "calendar") {
      if (!this.inputs.from) this.addInput("from", dateIn("From"));
      if (!this.inputs.to) this.addInput("to", dateIn("To"));
      if (!this.outputs.events) this.addOutput("events", frameOut("Events"));
    } else if (this.provider === "tasks") {
      if (!this.outputs.tasks) this.addOutput("tasks", cubeOut("Tasks"));
    } else {
      const labels: Record<string, string> = { total: "Total", completed: "Completed", active: "Active", overdue: "Overdue", archived: "Archived" };
      for (const k of OUTPUTS.stats) if (!this.outputs[k]) this.addOutput(k, numOut(labels[k]));
    }
    this.height = this.provider === "stats" ? 260 : this.provider === "calendar" ? 230 : 200;
  }

  private apiUrl(): string { return settingsStore.get("taskNotesUrl"); }
  private headers(): Record<string, string> { return authHeaders(apiKeyStore.get(TASKNOTES_KEY_ID)); }

  data(inputs: { from?: (number | null)[]; to?: (number | null)[] }): Record<string, unknown> {
    let from = 0, to = 0;
    let have = true;
    if (this.provider === "calendar") {
      // A wired blank date is "no window yet"; unwired = today .. today + 7.
      const f = inputs.from ? inputs.from[0] : todaySerial();
      const t = inputs.to ? inputs.to[0] : todaySerial() + 7;
      have = typeof f === "number" && typeof t === "number" && Number.isFinite(f) && Number.isFinite(t);
      if (have) { from = Math.min(f as number, t as number); to = Math.max(f as number, t as number); }
    }
    const key = connectionStore.key(this.id, have ? `${this.provider}|${this.apiUrl()}|${from}|${to}` : "");
    if (key !== this._lastKey) {
      if (!have) {
        this._lastKey = key;
        connectionStore.setState(this.id, { status: "idle" });
      } else if (requestNetwork(this.id)) {
        this._lastKey = key;
        void this.fetchProvider(from, to).then(() => scheduleConnectionRecalc());
      }
    }
    switch (this.provider) {
      case "tasks": return { tasks: this.cachedTasks ? tasksToCube(this.cachedTasks) : EMPTY_TASKS };
      case "calendar": return { events: this.cachedEvents ?? EMPTY_EVENTS };
      default: {
        const s = this.cachedStats;
        return { total: s?.total ?? null, completed: s?.completed ?? null, active: s?.active ?? null, overdue: s?.overdue ?? null, archived: s?.archived ?? null };
      }
    }
  }

  private async fetchProvider(from: number, to: number): Promise<void> {
    connectionStore.setState(this.id, { status: "loading" });
    const provider = this.provider;
    try {
      if (provider === "tasks") {
        const all: TaskRecord[] = [];
        let offset = 0;
        for (;;) {
          const { text } = await fetchText(tasksUrl(this.apiUrl(), offset, TASKS_PAGE), { headers: this.headers() });
          const page = parseTasksPage(text, offset);
          all.push(...page.tasks);
          if (!page.hasMore || page.nextOffset === offset) break;
          offset = page.nextOffset;
        }
        this.cachedTasks = all;
        connectionStore.setState(this.id, { status: "ok", rows: all.length, fetchedAt: Date.now() });
      } else if (provider === "calendar") {
        const { text } = await fetchText(eventsUrl(this.apiUrl(), from, to), { headers: this.headers() });
        this.cachedEvents = parseEvents(text);
        connectionStore.setState(this.id, { status: "ok", rows: this.cachedEvents.columns[0].values.length, fetchedAt: Date.now() });
      } else {
        const { text } = await fetchText(statsUrl(this.apiUrl()), { headers: this.headers() });
        this.cachedStats = parseStats(text);
        connectionStore.setState(this.id, { status: "ok", fetchedAt: Date.now() });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A 401 means the plugin wants its bearer token.
      const friendly = /HTTP 401/.test(msg) ? "Token rejected. Paste the plugin's API token." : /Failed to fetch|ECONNREFUSED|error sending request|NetworkError|Couldn't fetch this URL/i.test(msg) ? "Can't reach TaskNotes. Turn on its HTTP API and check the port in Settings." : msg;
      connectionStore.setState(this.id, { status: "error", message: friendly });
    }
  }
}
