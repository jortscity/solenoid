# Bundle 24 — Obsidian: the vault as a table (+ TaskNotes, mdbase)

**Source:** author ask 2026-09-06 ("a tighter integration between Obsidian and Solenoid — not
an Obsidian plugin; using Solenoid's advanced features and objects", then "explore TaskNotes
and mdbase by the same developer"). **Verdict:** PROPOSAL. The author has **no strong opinion**
on the open calls (2026-09-06), so § Recommendations stand as the defaults a build session
takes without asking. **Written:** 2026-09-06, plan-only; the ecosystem facts are a same-day
web read and WILL rot (mdbase is pre-1.0 and breaks by policy).

## What stands today (pointers, not restatement)

- **Import Obsidian Note** (`nodes/obsidian.ts` `ImportObsidianNode`, a `NoteNode` subclass):
  one `.md` → its frontmatter keys as typed output sockets + a `document` output. Manual Reload
  only. **Write to Obsidian** (`WriteObsidianNode`, `obsidianMarkdown.ts` + `obsidianWrite.ts`):
  a Document → one overwritten `.md` (pipe tables, mermaid fences, `$$` math, rasterized chart
  PNGs, `![[asset]]` embeds), Run-button only (rules `sinkRunButtonOnly`). Spec homes:
  `../node-coverage.md` § Connections & sinks / § Annotation, `../socket-reference.md`
  § `document`.
- **Note frontmatter** → sockets (`noteFrontmatter.ts`, `FIELD_SOCKETS` in `annotation.ts`).
  The parser is a deliberate YAML **subset**: scalars, flow arrays, block lists, and
  rows-of-inline-objects (`- {k: v}`) → a frame. Gaps that matter here: ISO datetimes
  (`2026-09-06T10:00`) land as strings, and **block-style nested objects** (`- startTime: …`
  on its own line, the shape TaskNotes writes `timeEntries` in) are not parsed at all.
- **Decision Matrix** is the author's Decision Matrix Bases View plugin, math only
  (`../node-coverage.md` § Decision support). **H6 Schedule** (CPM forward/backward pass, Task ·
  Duration · Predecessors-as-text) is specced in `../1.4-plan.md` § Scheduling slice, gated on
  the author's Track H pick (`../backlog.md`).
- The constraints a vault feature meets: (1) the desktop fs allowlist
  (`src-tauri/capabilities/default.json`) is **by extension** — text read/write only for
  `$HOME/**/*.{json,csv,md}`, so `mdbase.yaml`, `.base` and `.canvas` are unreadable until added;
  (2) the vault root is the app-wide `obsidianVault` setting, not a field on the node, so a
  graph resolves its notes against whichever vault the current machine has configured;
  (3) there is **no file watcher** anywhere (`21-collaboration.md` Stage 0 is where one lands);
  (4) live sources are *connection* nodes (`nodes/connection.ts`: a `frame` output, a cache
  keyed `<globalGen>:<nodeToken>:<reference>`, background fetch, `refreshConnection`,
  `refreshMinutes` — `../subsystem-invariants.md` § Live connections); the Import node is not
  one; (5) the vault walk (`fileBridge.ts` `listVaultMarkdownFiles`) skips dot-folders and
  stops at depth 6.

## The line

The vault is the author's database and TaskNotes is its tracker. Solenoid **computes over**
the vault and writes results back as properties or blocks; it never stores, tracks, or renders
a kanban (`../out-of-scope.md` §5 "point at databases", §8 "computes, does not track"). No
Obsidian plugin: every touchpoint is a file, a local HTTP port, or a URI. Reads emit **tables,
never per-key sockets** — a folder's key set changes between refreshes, and a table absorbs
that with no socket retype (`retypeReconciles` never fires; the Import Note keeps the per-key
form for the single-record case). **A reader emits ONE `cube`** (author, 2026-09-06:
"properties can be lists"): a frame column is number / string / logical / date only, so a
list-valued property (`tags`, `projects`, `contexts`) or a nested object (`timeEntries`, a
rows-of-objects key) has no honest cell in a flat frame — a folder of notes IS records whose
fields can be lists or tables, which is the cube's definition. The lattice already refuses to
let a cube flow into a `frame` socket ("the nesting would be silently dropped",
`sockets.ts`), and the author asked what a "flatten" step would even be for — the answer was
"to reach the frame-only verbs", which is a reason to make the **row verbs take cubes**
(A′), not to add a node. Bases users filter and sort notes with list properties without a
flattening step because the filter only reads scalar columns; Solenoid does the same. Two
drafts died here: a `frame` twin output on each reader, then a Flatten verb with a rule menu.

## The ecosystem, read 2026-09-06 (what the plan leans on)

**Obsidian properties.** Seven types — text, list, number, checkbox, date, date & time, tags;
dates as `2020-08-21`, datetimes as `2020-08-21T10:30:00`; names unique per note; links in
properties are quoted `"[[Note]]"`. The vault's **property-type registry** is
`.obsidian/types.json` (`{"types": {"due": "date", "done": "checkbox", …}}` — the assignment
the user made in the property panel). **Bases** (`.base` YAML: `filters` / `formulas` /
`properties` / `summaries` / `views`) evaluates per-row formulas over `note.*` / `file.*`;
no joins, no traversal, no simulation.

**TaskNotes** (callumalpass/tasknotes, ~2.1k stars; stable 4.12.x, **5.0.0-beta** Aug 2026).
One task = one note; the model lives in frontmatter (`title status priority due scheduled
tags contexts projects timeEstimate timeEntries recurrence complete_instances dateCreated
dateModified`, plus `blockedBy`, reminders, user fields); **property names are user-mappable**
(`deadline` for `due`), so a file reader cannot assume the defaults. Since 4.0 every view
(list, kanban, calendar, agenda) is an Obsidian Bases view. **Local HTTP API** (Settings →
Integrations, default `localhost:8080`, optional bearer token, OpenAPI at `/api/docs`):
`GET /api/tasks` (paged, no filters), `POST /api/tasks/query` (a FilterQuery tree:
`{type:"group", conjunction, children:[{property, operator, value}], sortKey, groupKey}`),
`GET /api/stats`, `GET /api/time/summary?period=`, `GET /api/tasks/:id/time`,
`GET /api/calendars/events?start&end`, `PUT /api/tasks/:id` (partial update),
`POST /api/tasks`, `POST /api/nlp/create`. **Webhooks**: 15 events
(`task.created/updated/deleted/completed/archived…`, `time.started/stopped`, `pomodoro.*`,
`recurring.instance.*`, `reminder.triggered`), HMAC-SHA256 signature, optional `transformFile`
templates. Companions: `tasknotes-app` (web/iOS/Android), `tasknotes-workflows` (markdown
workflow files on the mdbase `runtime_workflow` schema, Bases formulas as guards),
`canvas-bases` (materializes a Bases view to a `.canvas` snapshot), a browser extension.

**mdbase** (spec at mdbase-dev/mdbase-spec, **v0.3.0**, ~100 stars). A *collection* is a folder
with `mdbase.yaml` (`spec_version: "0.3.0"`) and a `_types` folder, each type a markdown file whose
frontmatter is `kind: mdbase.type`, `name`, `match.path_glob`, and a **JSON Schema 2020-12**
`schema.value` (properties, required, enum, min/max). Records are ordinary notes matched by
glob. Queries are `types: [task]` + a **CEL** `where` + `order_by`; the spec also defines
links, lifecycle policy (ids, timestamps, digests), saved views, record/event/action
contracts and optional CloudEvents interop. Implementations: the TypeScript reference
(`mdbase` on npm, SQLite-cached), **the TS CLI was archived 2026-08-07** in favour of the
native Rust `mdbase` binary shipped by **mdbase-connect** (0.1.0-beta.9x; Linux/macOS/Windows
archives; `mdbase --root ./notes query --types task`; `connect` adds identity, per-collection
authorization, hosted mirrors, and an MCP endpoint), `mdbase-tasknotes` (`mtn`: ships
the `_types` task type file with the TaskNotes field map + contract bindings, `list --json`),
`mdbase-obsidian` (v0.3, "type-first": inits collections, edits schemas, validates — it
**does not execute queries**, "delegating that to companion tools"), `mdbase-lsp`. TaskNotes
5.0 auto-upgrades its collection metadata to the v0.3 task type.

**The reading.** The author's ecosystem is converging on *typed markdown collections*: the
schema lives in the vault (`_types`), the tracker (TaskNotes) writes records, the Obsidian
plugin validates, and **query execution and computation are explicitly left to companion
tools**. Solenoid is the companion tool with a canvas: read the collection as a cube, run the
full verb set + Decision Matrix + Schedule + Monte Carlo + charts over it, and write properties
back. Nothing on the mdbase side does that today, and Bases formulas stop at per-row.

## The items

**A. Vault Folder → Cube** (the keystone; a connection node in `nodes/connection.ts`, kind
`connection`, Add → Connections, label **Vault Folder**). Init: `vault` (absolute path, the
`FileLinkNode.path` pattern, defaulting from the setting at creation and shown as a chip),
`folder` (vault-relative, "" = root), `glob` (optional, `tasks/**`), `includeBody` (off),
`refreshMinutes`. One row per note; one output, **`cube`** (label "Notes"). Columns:
built-ins `path · name · folder · ext · size · created · modified · tags · links · embeds`
(the Bases `file.*` set — see § Bases; file times as serials; `tags` = the property's list
merged with inline `#tags`, `links` = every `[[wikilink]]` in body and frontmatter as a list
of note names, `embeds` = the `![[…]]` subset — all three from one regex pass over the text
that is already in memory, so they cost nothing and are NOT gated by `includeBody`), then the
**union of frontmatter keys in first-seen order** (a frontmatter `tags` key is folded into the
built-in, never a second column). Cells: a
scalar as typed below; a list → a list cell (`CubeCell[]`); a rows-of-objects key → a nested
frame (the same `rowsToFrame` the Import Note uses); a block-style nested object → a nested
frame once the parser learns the shape (the v1 parser work item; until then the raw YAML text
as a string, never a dropped key). Column typing, first source that answers wins:

1. an **mdbase type** whose `path_glob` matches the note (walk up from `folder` to the vault
   root for `mdbase.yaml`; needs `.yaml`/`.yml` in the fs allowlist): JSON Schema `string` /
   `number` / `integer` / `boolean` / `enum` → `string` / `number` / `number` / `logical` /
   `string`; `format: date` / `date-time` → `date`; `array` of scalars → a list cell whose
   items parse by the item type; `array` of `object` → a nested frame (its `properties` type
   the nested columns); `required` keys always present. `path_glob` matches relative to the
   folder holding `mdbase.yaml`;
2. **`.obsidian/types.json`** (a direct read — the walk skips dot-folders but a read is
   allowed; `.json` is in scope — **verify** that the capability glob `$HOME/**/*.json`
   matches a path with a dot-folder segment, else add `$HOME/**/.obsidian/types.json`):
   `text→string`, `number→number`, `checkbox→logical`, `date`/`datetime→date`,
   `list`/`tags`/`aliases` → a list cell of strings;
3. the existing guesser, widened per column across rows (a column mixing numbers and text is
   `string`; all-null is `string`).

"Typing" here governs how each scalar and each list item is PARSED (date vs text, number vs
text); a cube column carries no declared type, so list and nested columns are simply cells.
ISO datetimes parse to fractional serials (fixing the Note path too, one parser). The cube is
an **eager JS value** — nested cells never reach Polars, so there is no `FrameRef` and no
backend seam here (Local File's lazy handle is the wrong model; Decision Matrix's eager class
is the right one). Web: the node exists, shows the desktop-only hint, emits nothing (a vault
read is desktop-only, unlike the Import Note's persisted body). Pure cores: `vaultCube.ts`
(`notesToCube(files: {path, text, mtime}[], types: ColumnTypes)`), `mdbaseTypes.ts` (schema →
parse types), `obsidianTypes.ts` (types.json → the same), each unit-tested off a fixture
folder in `fixtures/vault/` (an mdbase collection, a plain folder, a folder with types.json).

**A′. The row verbs take cubes** (the general change this bundle needs; useful with no vault
in sight). The verbs whose operation reads only scalar columns and keeps rows whole accept a
cube on their table input — `cubeIn("Table / Cube")`, the XLOOKUP precedent — and nested cells
ride along untouched: **Filter, Sort, Head, Distinct, Get Row** (row selection — these ARE
passthroughs, so a cube in → a cube out through the passthrough declaration,
`nodes/passthrough.ts`, the `single` mode Display and Reverse use, and the output type
adopts), **Get Column** (a scalar column → its list as today; a list column → `#SHAPE!` in v1),
**Decision Matrix** (reads scalar criteria from a cube, list/nested columns ignored like date
columns are; still emits its ranking FRAME — not a passthrough), and **H6 Schedule**
(Predecessors as a text cell OR a list cell; a cube in → the same cube with the four columns
appended). **Filter on a list column** is the one predicate that must exist, because
"notes tagged x" is THE vault query: the Bases list trio — `contains` (any item equals the
value), `contains any` / `contains all` (a comma-separated value list) — plus `is empty` work
on a list cell; every other operator on a list column → `#SHAPE!`, and Sort on a list column →
`#SHAPE!`. With `links` a built-in, "notes linking to X" is `links contains X` and the
backlinks pane is a Filter; Nest Join notes × links is the vault's link graph as a cube. Mechanism: ONE helper, `selectCubeRows(cube, indices)` in
`frame.ts`, fed by the verb's existing predicate / sort key evaluated over the scalar column —
the eager JS branch taken when `isCubeValue(input)`, before the lazy `FrameRef` path, exactly
the `decisionMatrix` class; Polars never sees a nested cell, so `oneVerbCorpus` is untouched
(no new `FrameOp`). **Not** cube-tolerant: the aggregating and reshaping verbs (GROUPBY,
PIVOTBY, Join, Append, Add Column…) — they would have to decide what a nested cell means, and
Cube Rollup / Nest Join / Unnest already own that. The only place a list cell is ever joined
to text is **Write File** in CSV mode (`", "`), because a CSV cell has no other form. Tests:
`cubeRowVerbs.test.ts` — each verb over a fixture cube with a list column and a nested-frame
column: rows selected correctly, nested cells identical by reference, output brand `__cube`.

**B. Write Properties** (sink, Add → Connections beside Write File; Run-button only,
`sinkRunButtonOnly`). Input: **`cube`** (a frame widens into it; needs a `path` column — A's,
or anything joined to it). Init: `keys` (which columns to write; the path column never),
`vault`, `addMissing` (on), `stamp` (off — see D). `data()` caches only and emits **`plan`, a
frame** (`path · key · before · after · action`) — the preview IS data: filter it, sort it,
count it, wire it to a Display, before anything is armed. Straight from `data()` the plan
knows only what the cube says: every row × key with `after` filled and `action = pending`.
The **Preview** button (reads the notes, never writes) fills `before` and resolves `action`
to update / add / unchanged / unreadable / refused-with-reason; the card's status line
summarises the resolved frame ("43 notes · update `score` in 43 · add `rank` to 12 · 2
unreadable · 1 refused"). Run requires a resolved plan and applies it
through the atomic tmp+rename write. **Cell → YAML:** a scalar as today; a list cell → a block
list; a **nested frame cell → a `- {k: v}` block list**, the exact rows-of-objects shape the
Note parser and A read back — so a cube round-trips through the vault losslessly. The patch is **line-level over the raw text**, never a
parse-and-reserialize (which would lose comments, quoting, key order and the nested shapes we
don't parse): find the top-level `key:` line inside the fence; a scalar value replaces the
rest of that line (`yamlScalar` from `obsidianMarkdown.ts` does the quoting); a list value
replaces the line plus its following `- ` block; a key whose current value is a block we don't
understand is **refused** for that row; a missing key is appended before the closing `---`; a
note with no block gets one. Dates write as `YYYY-MM-DD`, datetimes as `YYYY-MM-DDTHH:MM:SS`
(Obsidian's forms), logicals as `true`/`false`. mdbase-aware: when the note's type has a
schema, validate the outgoing value (type / enum / minimum / maximum / required — an
in-process subset, no CLI) and refuse the row rather than corrupt a record. **A new key
arrives typed:** when `addMissing` creates a property the vault has never seen, B also
registers its type in `.obsidian/types.json` (`number` / `checkbox` / `date` / `datetime` /
`text` / `list` from the cell) — a JSON merge of one key, so the property panel and Bases
treat a Solenoid-written `score` as a number from the first write, not as text guessed
later. **Note references write as links:** a string cell that equals the vault-relative path
or the name of an existing note (the reader's `path` / `name` / `links` cells) serializes as
`"[[Name]]"` in frontmatter and `[[Name]]` in a table — Obsidian's graph view and Bases'
`file.links` then see what Solenoid wrote; the vault listing already in memory is the lookup.
The same rule applies to `frameToMarkdownTable` in Write to Obsidian. Pure core:
`frontmatterPatch.ts` (`patchFrontmatter(text, patch): {text, refused[]}`), the ONE place
that edits a note's YAML (a `onePatchPath` rule candidate).

**C. Managed block write mode** on Write to Obsidian: `mode: overwrite | append | block`, and
a **templated file name**: `{{today}}` (the daily-note pattern, `YYYY-MM-DD` — configurable
format literal), `{{name}}` (the node's addressable name), `{{doc}}` — so "append this run's
summary to today's daily note" is `mode: append`, file `{{today}}`, subfolder `Daily`.
`block` splices the assembled markdown between `%% solenoid:begin <node name> %%` and
`%% solenoid:end %%` (Obsidian hides `%%` comments in reading view; the node's addressable
name keys the pair, so two Write nodes can own two blocks in one note). First write appends
the pair at the end of the note; later writes replace only the span. Assembled content that
itself contains `%%` outside a code fence is **refused** with the reason on the status line (an
Obsidian comment in a wired Note's body is the only way to get one there) — no escaping
trick, nothing invisible written into the author's note. Pure
`managedBlock.ts` (`spliceBlock(text, name, content)`), tested on: no markers, two pairs,
markers inside a code fence (ignored — fences win), a begin with no end (append a fresh pair,
leave the orphan).

**D. Links both ways.** A note Write to Obsidian writes gets a `solenoid` frontmatter key —
**a wikilink, `"[[Solenoid/<document name>]]"`**, not a string: the first write to a vault
creates that **graph stub note** (`Solenoid/<document name>.md`, frontmatter `type: solenoid`,
`nodes:` the list of writer node names, `updated:`; body: what this graph writes where, and
with J the exact `run-graph … --run` line) and every later write refreshes its frontmatter.
Obsidian's backlinks pane on any written note then answers "which graph wrote this", the
graph view draws the edge, and a Bases view over `Solenoid/` lists every graph that touches
the vault — provenance as a first-class note, using nothing but links. The node name stays in
the key's value as `"[[Solenoid/<doc>]] › <node name>"`. On B and F6 the same key is the
**`stamp` toggle, off by default**: those notes are the user's records, and a provenance key on
every task note is noise in every Bases view. Vault Folder, Import Note and both writers
get an **Open in Obsidian** button: `obsidian://open?vault=<basename of the vault
path>&file=<vault-relative path, URL-encoded, no .md>` through `openExternal` (no new
capability; Windows backslashes normalised to `/` first). A `solenoid://` deep link back
(`tauri-plugin-deep-link` + single-instance) is HOLD until a caller exists.

**E. Watch → refresh.** The Stage-0 watcher (`21-collaboration.md`) gets two more clients: a
change under a Vault Folder's `folder` bumps that node's connection token
(`refreshConnection`), and a change to an Import Note's file calls its `reload()` (item I),
both debounced a second — an edit in Obsidian recomputes the graph. Until it lands,
`refreshMinutes` is the stopgap on both. Closes `../deferrals.md`'s "auto-reload" item.

**F. TaskNotes** (its own slice; the data Solenoid is already good at lives here: estimates,
time entries, dependencies, due dates, recurrence). Read through the **HTTP API**, not the
files — field mapping, recurrence expansion and `timeEntries` totals are plugin logic
(`../out-of-scope.md` §6), and `timeEntries` is the nested block shape our parser can't read;
A over the tasks folder stays the vault-closed fallback. One connection node, **TaskNotes**,
with a provider selector (Settings gain `taskNotesUrl` default `http://localhost:8080` +
`taskNotesToken`; `http://**` is already allowed): **Tasks** (`GET /api/tasks` paged → one
**`cube`**: `path · title · status · priority · due · scheduled · timeEstimate ·
trackedMinutes · archived` + user fields as scalars, `projects · contexts · tags · blockedBy`
as **list cells** (`blockedBy` by task title), `timeEntries` (`start · end · minutes ·
description`) and `complete_instances` (`date`) as **nested frames** — a task IS a record with
sub-tables, which is what the cube exists for), **Calendar events** (`frame`: `title · start ·
end · source`, window from two date inputs), **Stats** (`/api/stats` as scalars — KPI-shaped,
deliberately not a one-row frame). No separate time-entries provider: **Unnest** the cube's
`timeEntries` for the long form and **Cube Rollup** (sum `minutes`) is `trackedMinutes`
recomputed. `blockedBy` as a list cell is what H6 Schedule reads directly (A′), so nothing
task-specific stands between the feed and the schedule. Pure
core `taskNotesApi.ts` (paging + cube mapping over a fetch stub; one fixture per endpoint).
What the tables unlock, ranked by what Bases cannot do:

- **F1 Schedule from dependencies.** Tasks → H6 Schedule (`../1.4-plan.md` § H6,
  now specced to the row: Task · Duration · Predecessors + Start / Working days / Holidays →
  Start · Finish · Float · Critical + Project finish). Duration = `timeEstimate` ÷ an hours-per-day literal (a
  Math node, or H6's own `hoursPerDay` if the author wants it on the card); then `PUT`
  `scheduled` back (F6). Bases formulas are per-row — a traversal is impossible there. Gate:
  the Track H pick; the feed ships without it. **Many projects at once** (checked against
  `composite.ts`): **by-row** iterates a wired FRAME's rows (one single-row frame per pass) or
  a list — not a cube — and collects each output as a plain series. So: by-row over the
  Projects frame, the tasks cube wired FIXED, Filter (A′, `projects contains`) inside the
  composite → H6 → `Project finish` collects as a list and the schedule as a series of frames,
  which **Build Cube** (a wired list → its elements are the cells) stacks into one cube
  column beside the project names. No by-row-over-cubes needed; noted as a gap, not a
  prerequisite. **A Gantt in Obsidian for free:** H6's
  `gantt` string output (the schedule as Mermaid `gantt` source) → the Mermaid node → a Report
  `=gantt` ref → Write to Obsidian already emits the fence, and Obsidian renders it natively.
  No figure code; the 2.0 canvas Gantt is a separate, later thing.
- **F2 Capacity and deadline probability.** GROUPBY due-week of `timeEstimate` minus calendar
  hours (H7 Common free time takes the busy windows) → overload chart. **The probability is
  analytic, not simulated** (corrected against `composite.ts`: the Monte Carlo run mode
  samples SCALAR input ports — each marker carries its own mean / ± spread / distribution —
  and summarises each scalar output as mean ± sd; it cannot sample a column per row): a
  per-task spread column (a user field, or actual ÷ estimate from F3 joined by project) →
  variance per task → sum along the critical path (H6's `Critical`) or over all tasks for
  effort → `NORM.DIST(deadline, mean, sd)` in an Expression — PERT, exact, all existing
  nodes. Monte Carlo fits where the uncertainty IS scalar: a composite around H6 with one
  uncertain "effort multiplier" port → `Project finish` as mean ± sd, today. Per-row
  uncertainty proper is `12-value-model-extensions.md` #21 (uncertain values, VERY LATE): when
  a column can carry ±, H6 propagates it and this item's full form falls out. An **Alert**
  node on the overload row count or the probability (`../subsystem-invariants.md` § Alert
  node) turns a vault edit, via E, into a toast + HUD entry — the one "tracking-shaped" thing
  Solenoid does, and it's a computed edge, not a task list. `timeEstimate` stays plain minutes
  (the unit lattice has no time dimension; an FC formats it).
- **F3 Time analytics and billing.** PIVOTBY week × project, Window running totals,
  actual ÷ estimate per project as a calibration table; join a rates frame → an invoice Report
  → Write to Obsidian (C into the client's note).
- **F4 "What next" via Decision Matrix.** Criteria from the row (priority, days-to-due,
  estimate, a user field); write `score` back (B, or F6 via the API); a Bases view sorted by it
  is the prioritized list.
- **F5 Recurrence adherence.** Unnest the cube's `complete_instances` → `task · date` → Window
  (lag) for streaks, GROUPBY for completion rate per task → heatmap.
- **F6 Write Tasks** (sink, Run-button only, Preview like B): rows → `POST /api/tasks` (new;
  an amortization schedule as payment tasks, a maintenance interval as a recurring task) or
  `PUT /api/tasks/:id` when the row carries `path` (F1's reschedules, F4's score into a user
  field). Field mapping is honoured and webhooks / workflows fire because the plugin writes.
  A single `text` column may go through `/api/nlp/create`.

**Out:** timer / pomodoro control, kanban or calendar rendering — Solenoid computes over tasks,
TaskNotes tracks them.

**G. Webhook → recompute.** TaskNotes can POST `task.updated` to a URL, but the desktop app has
no listener. Options: a tiny localhost listener in the Tauri shell (a Rust route that verifies
the HMAC and bumps a connection token), or the reverse — a `tasknotes-workflows` step that
shells out to `npm run run-graph` and B's headless twin. **HOLD:** E gives the same outcome for
file-backed reads with no new server surface; revisit if F's API reads need push.

**H. mdbase query passthrough.** Shell out to the native `mdbase --root <vault> query --types
task --where <CEL>` and read JSON — their engine does CEL, links and lifecycle so we don't.
**HOLD:** the binary is beta, its JSON output shape is undocumented, `tauri-plugin-shell` isn't
in the app, and Solenoid's Filter/Sort already cover the `where` on A's frame. Revisit at
mdbase 1.0.

**I. Import Obsidian Note keeps its class; it borrows the refresh.** Considered making it a
connection node so it gets `refreshMinutes` and the watcher for free — rejected: its value IS
the per-key typed sockets + the `document` output + the rendered body, and it extends
`NoteNode` for that machinery; a connection node emits one `frame`. What it gains instead:
(1) `refreshMinutes` as an init field, the component running the same `setInterval` →
`reload()` that `ConnectionNodes.tsx` runs for the sources; (2) registration as the watcher's
second client class in E (path → `reload()`, which already re-syncs sockets and prunes
stranded cables through `dropStrandedFrontmatterCables`); (3) a per-node `vault` like A's, so
an imported note travels with the graph. Nothing else moves; `obsidian.test.ts` pins the
disarmed-load rule for the writer, not this.

**K. Graphs as notes (HOLD — the one idea past this bundle's line).** The text form
(`textForm.ts`) is line-oriented and byte-stable; a Solenoid document could live IN the vault
as `Solenoid/<name>.md` with the text form in a fenced block and the visual sidecar in a
second — then a graph is a note: linkable, searchable, synced by Obsidian Sync, listed by
Bases, and D's stub becomes the document itself. It is also `21-collaboration.md` Stage 0
by another door (a synced folder holding the file), and it reopens the save format (`P1`
freeze in `../2.0-plan.md`). Not in this bundle: D's stub note gives the linking payoff
without touching persistence; revisit when P1 lands.

**J. Headless seam** (what makes G's reverse path and the fixture tests real). A connection
node fetches in the background through the Tauri bridges, so under `npm run run-graph` a Vault
Folder or TaskNotes node emits nothing today. The readers' pure cores already take files /
responses as data (`notesToCube(files)`, `taskNotesApi` over a fetch stub); the seam is a
**file provider** the runner can supply: `run-graph <graph> --vault <path>` reads the vault
with Node `fs` and hands each Vault Folder / Import Note its files; `--tasknotes <url>` does the
same for the feed with Node `fetch`. Writers: `--run <node name>` arms and runs ONE named sink
(B, C's Write to Obsidian, F6) — the CLI flag is the Run button's headless equivalent, named
per node so nothing fires by accident; `sinkRunButtonOnly`'s wording gains that one clause.
With J, a `tasknotes-workflows` step or an Obsidian "Shell commands" hotkey can run a graph
and write its results back without a listener (G), and `vaultCube.test.ts` runs the real
node over `fixtures/vault/` instead of only the pure core.

**Not doing.** `.canvas` export (`canvas-bases` already materializes Bases views; a Solenoid
graph is computation, not a whiteboard). Reading `.base` files as a query (§ Bases). mdbase views,
actions, CloudEvents, hosted Connect. Wikilink resolution inside Note bodies and the
`![[Note]]` transclusion switch on write — small polish after C. Inline `#tags` and
`[[links]]` from bodies as columns — a body scan is A's `includeBody` plus a Text node.

## What Bases gets right, and what of it to take (read 2026-09-06, author ask)

The `.base` file is YAML: global `filters` (an `and` / `or` / `not` tree of expression
strings), `formulas` (a JS-flavoured expression language with typed methods — `note.price`,
`file.hasTag("x")`, `list.containsAny(…)`, `date.relative()`, `if(…)`), `properties`
(display names), `summaries`, and `views` (table / cards / list / kanban / map, one `groupBy`,
`order`, `limit`, per-column `summaries`), embeddable in a note as `![[File.base#View]]`,
with `this` = the embedding note. What transfers:

1. **The `file.*` built-ins** — `name · path · folder · ext · size · ctime · mtime · tags ·
   links · embeds · backlinks · properties`. A's built-ins are now that set (without the
   `file.` prefix — a dotted name would need the `@[file.name]` bracket form in every
   formula; the Bases equivalence is one line in the node's help: `file.mtime` ↔ `modified`).
   `backlinks` is the one to skip: Bases marks it "performance heavy", and it is a Filter on
   `links` anyway. `tags` is content + frontmatter merged, exactly as Bases defines it.
2. **The list predicates** `contains` / `containsAny` / `containsAll` / `isEmpty` — adopted
   verbatim as A′'s Filter operators on list cells (above). `inFolder` is a text `starts
   with` on `folder`; `hasLink` is `links contains`.
3. **Summaries** — Bases offers Average · Min · Max · Sum · Range · Median · Stddev (number),
   Earliest · Latest · Range (date), Checked · Unchecked (boolean), Empty · Filled · Unique
   (any). The table popup's footer (`TablePopup.tsx` `FooterStat`) has sum · avg · min · max ·
   median · count · distinct · empty · errors; **missing: Range, Stddev, Earliest / Latest for
   date columns, Checked / Unchecked for logical columns.** Four cheap additions to a
   type-aware footer; a table-popup item, not a vault one — filed in `../backlog.md`.
4. **A live table in the note** — the one reason to WRITE a `.base`: after B writes `score`
   and `rank` into 43 task notes, a managed block (C) that contains `![[Solenoid scores.base#
   Ranked]]` shows a *live* Bases view over those notes instead of a frozen pipe table. The
   file is tiny and its syntax is now documented (v1.9+): `filters: file.inFolder("tasks")`,
   one `views:` entry with `order: [file.name, note.score, note.rank]`. Proposed as B's
   **`writeBase` toggle (off)**: B writes `<node name>.base` beside the notes and C's block
   can embed it. This reverses the earlier "never write `.base`" — the format was called "in
   motion" before it was read; it is small and official.

What NOT to take: the formula language (one formula surface, `../rules.md`; Excel parity is
Solenoid's contract, and Bases' `.toFixed()`-style methods would be a second grammar), view
types (cards / kanban / map are display — `../out-of-scope.md` §8), and reading a `.base`
as A's query. That last one is tempting (point Vault Folder at a `.base`, inherit its
filters) but means evaluating Bases expressions; the honest scope is A + Filter, and a `.base`
embed in a note (item 4) covers the round trip from the other side.

## Node specs (the catalog rows a build session writes; DESIGN.md §7 voice)

| Node | Kind · menu | In | Out | Init (persisted) | Pure core · test |
|---|---|---|---|---|---|
| Vault Folder | connection · Connections | — | `cube` ("Notes") | vault, folder, glob, includeBody, refreshMinutes | `vaultCube.ts` (`notesToCube`), `mdbaseTypes.ts`, `obsidianTypes.ts` · `vaultCube.test.ts` over `fixtures/vault/` |
| Filter / Sort / Head / Distinct / Get Row (exist) | passthrough | table input becomes `cubeIn` | adopts: cube in → cube out | — (Filter gains `contains` / `is empty` for list cells) | `selectCubeRows` in `frame.ts` · `cubeRowVerbs.test.ts` |
| Get Column / Decision Matrix / H6 (exist) | — | table input becomes `cubeIn` | unchanged (list / ranking frame / H6: the input cube + 4 columns) | — | same test file |
| Write Properties | sink · Connections | `cube` (frame widens) | `plan` frame | vault, keys, addMissing, stamp, writeBase | `frontmatterPatch.ts` (+ nested frame → `- {k: v}` block) · `frontmatterPatch.test.ts` (round-trips: untouched bytes identical; cube → vault → cube equal) |
| Write to Obsidian (+mode) | sink (exists) | `document` | — | + mode, fileName template | `managedBlock.ts` · `managedBlock.test.ts`; `fileNameTemplate.ts` (pure) |
| TaskNotes | connection · Connections | `from`, `to` (dates, Calendar provider only) | Tasks: `cube`; Calendar: `frame`; Stats: scalars | provider, refreshMinutes | `taskNotesApi.ts` · `taskNotesApi.test.ts` (fixtures per endpoint) |
| Write Tasks | sink · Connections | `cube` (frame widens) | `plan` frame | mode (create / update), keys, stamp | shares `taskNotesApi.ts`; list cells → the API's arrays |
| (CLI) `run-graph --vault --tasknotes --run` | — | — | — | — | `scripts/run-graph.test.ts` gains a vault-fixture case and a `--run` case against a temp copy |

Every write node: `enabled` stays out of the persistence whitelist (loads disarmed, the
existing `WriteObsidianNode` pattern), status line + Preview, `socketDocs` say "wiring never
writes". Every read node: background fetch, sync `data()`, `#VALUE!`-class error on an
unreachable vault/port with the reason in the status line, never a throw.

## Seeds

Seeds must load on web with no vault, so each ships a **Frame Input snapshot of the feed's
scalar columns** (a comment on the node: "replace me with a TaskNotes node"; the nested shape
is demonstrable with Build Cube + Nest Join if a seed needs it, and the row verbs take it):
**"Which task next?"** (F4: 12 tasks → Decision Matrix with priority / days-to-due / estimate →
Score → bar chart, and a Write Properties node disarmed at the end) and, when H6 lands,
**"Kitchen remodel from TaskNotes"** (H6's own seed re-based on the tasks shape, with
`predecessors` text). The existing `decision-matrix.json` already joins a Note-frontmatter frame;
it stays the "vault as a source" demo.

## Rules touched (cite in commits)

`sinkRunButtonOnly` (every writer; amended by J to "the Run button, or the CLI's explicit
`--run <name>`"), `noDataInComponents` (Preview is a pure plan over the
cached frame + reads), `retypeReconciles` avoided by design (one `cube` output; A′'s output adoption is derived
state, never persisted), `onePrunePath`
untouched (no per-key sockets), a new **`onePatchPath`** candidate (`frontmatterPatch.ts` is
the only writer of a note's YAML; `obsidianWrite.ts` writes whole documents, never patches).
The fs allowlist change (`.yaml`/`.yml` read) is a one-line capability edit, documented in
`../architecture.md`'s desktop section.

## Sequencing (dependency order)

A′ → A → B → D → C → F (feed + F4/F3/F5 + F6) → I → J → E; F1 when H6 lands; G and H on hold.
A′ first: a Vault Folder cube that nothing can filter is not a product. A alone is a
product ("your vault as a table"). A + B is the loop ("compute in Solenoid, see it in Bases").
F is independent of B and C and could go first if the author's own use is task-shaped.

## Recommendations standing in for author calls (author: no strong opinion, 2026-09-06)

1. **Vault binding is per node**, defaulting from the setting at creation — a graph may read
   two vaults, and the `FileLinkNode.path` pattern already exists. The setting stays as the
   default and as the Import Note's root.
2. **Typing sources in the order mdbase → `types.json` → guesser.** mdbase when present is the
   bet that Solenoid is the collection's compute layer; `types.json` makes every ordinary vault
   typed for free; the guesser is the floor.
3. **Property writes patch YAML (B) by default; F6 is the API path for task notes.** Patching
   works with Obsidian closed and covers every note; the API honours field mapping and fires
   workflows. The two never share a code path — B refuses a key it can't patch, F6 refuses a
   row without `path` in update mode.
4. **F ships as feed + F4/F3/F5/F6 without waiting on H6.** F1 attaches when Track H is picked;
   the `predecessors` column is emitted from day one so nothing changes shape later.
5. **Body inclusion is off by default** and previews stay small; `includeBody` is the switch,
   not a second node.
6. **Import Note stays a Note** (item I) and borrows the refresh timer + watcher hook rather
   than becoming a connection node.
7. **Readers emit one `cube`, the row verbs take it, writers take `cube`, and a sink's
   preview is a `plan` frame.** The nested form is the truth of a note folder; filtering and
   sorting it never needs a flattening step; the plan is data the graph can inspect rather than
   a string on a card.

## Risks

mdbase breaks by policy before 1.0 (pin the spec version we read; an unknown `spec_version`
→ fall back to `types.json`/guessing, never refuse the folder). TaskNotes' API is opt-in; port
and token are the user's (Settings, not discovery); a 401 reads as "token" in the status line.
The fs allowlist needs `.yaml`/`.yml`, and a vault outside `$HOME` needs a capability change
(document it, don't widen to `**`). Writes touch the author's notes: Preview + atomic writes +
line-level patching that never re-serializes + untouched bytes proven identical in tests are
the whole safety story, and each pure core gets its fixture test before a node exists. Large
vaults: the walk is depth-6 and unindexed; A reads every matched file per refresh — fine to a
few thousand notes, and the mtime built-in lets a later session add an mtime-keyed cache.
The cube is eager and lives in JS memory (no Polars offload for nested data); `includeBody`
off keeps it to properties, which is small.

## Sources (read 2026-09-06)

- Obsidian: https://obsidian.md/help/properties · https://obsidian.md/help/bases/syntax ·
  https://obsidian.md/help/bases/functions · https://obsidian.md/help/bases/views
- TaskNotes: https://github.com/callumalpass/tasknotes · https://tasknotes.dev/HTTP_API/ ·
  https://tasknotes.dev/webhooks/ · https://tasknotes.dev/developers/specification/ ·
  https://github.com/callumalpass/tasknotes/releases
- Companions: https://github.com/callumalpass/tasknotes-workflows ·
  https://github.com/callumalpass/canvas-bases · https://github.com/callumalpass/tasknotes-app
- mdbase: https://github.com/mdbase-dev/mdbase-spec · https://github.com/callumalpass/mdbase ·
  https://github.com/callumalpass/mdbase-cli (archived) ·
  https://github.com/mdbase-dev/mdbase-connect · https://github.com/mdbase-dev/mdbase-obsidian ·
  https://github.com/callumalpass/mdbase-tasknotes
