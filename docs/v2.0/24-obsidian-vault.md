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
Obsidian plugin: every touchpoint is a file, a local HTTP port, or a URI. Reads emit **one
frame**, never per-key sockets — a folder's key set changes between refreshes, and a frame
absorbs that with no socket retype (`retypeReconciles` never fires; the Import Note keeps the
per-key form for the single-record case).

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
tools**. Solenoid is the companion tool with a canvas: read the collection as a Frame, run the
full verb set + Decision Matrix + Schedule + Monte Carlo + charts over it, and write properties
back. Nothing on the mdbase side does that today, and Bases formulas stop at per-row.

## The items

**A. Vault Folder → Frame** (the keystone; a connection node in `nodes/connection.ts`, kind
`connection`, Add → Connections, label **Vault Folder**). Init: `vault` (absolute path, the
`FileLinkNode.path` pattern, defaulting from the setting at creation and shown as a chip),
`folder` (vault-relative, "" = root), `glob` (optional, `tasks/**`), `includeBody` (off),
`refreshMinutes`. Emits one row per note. Columns: built-ins `path · name · folder · tags ·
created · modified` (file times as serials; `tags` merges the property and inline `#tags`
only if cheap — property-only in v1), then the **union of frontmatter keys in first-seen
order**. Column typing, first source that answers wins:

1. an **mdbase type** whose `path_glob` matches the note (walk up from `folder` to the vault
   root for `mdbase.yaml`; needs `.yaml`/`.yml` in the fs allowlist): JSON Schema `string` /
   `number` / `integer` / `boolean` / `enum` → `string` / `number` / `number` / `logical` /
   `string`; `format: date` / `date-time` → `date`; `array` of those → the list rungs;
   `required` keys always present;
2. **`.obsidian/types.json`** (a direct read — the walk skips dot-folders but a read is
   allowed; `.json` is in scope): `text→string`, `number→number`, `checkbox→logical`,
   `date`/`datetime→date`, `list`/`tags`/`aliases→strlist`;
3. the existing guesser, widened per column across rows (a column mixing numbers and text is
   `string`; all-null is `string`).

A value the subset parser cannot read (a block-style nested object) becomes the raw YAML text
in a `string` cell, never a dropped key — the row stays addressable. ISO datetimes parse to
fractional serials (fixing the Note path too, one parser). Desktop: a `FrameRef` through the
backend seam like Local File; web: the node exists, shows the desktop-only hint, emits the
last persisted preview (nothing — a vault read is desktop-only, unlike the Import Note's
persisted body). Pure cores: `vaultFrame.ts` (`notesToFrame(files: {path, text, mtime}[],
types: ColumnTypes)`), `mdbaseTypes.ts` (schema → `FrontmatterFieldType`),
`obsidianTypes.ts` (types.json → the same), each unit-tested off a fixture folder in
`fixtures/vault/` (an mdbase collection, a plain folder, a folder with types.json).

**B. Write Properties** (sink, Add → Connections beside Write File; Run-button only,
`sinkRunButtonOnly`). Inputs: `frame` (needs a `path` column — A's, or anything joined to it).
Init: `keys` (which columns to write; the path column never), `vault`, `addMissing` (on).
`data()` caches only. A **Preview** button (reads, never writes) renders the plan: "43 notes ·
update `score` in 43 · add `rank` to 12 · 2 unreadable · 1 refused (schema)". Run applies it
through the atomic tmp+rename write. The patch is **line-level over the raw text**, never a
parse-and-reserialize (which would lose comments, quoting, key order and the nested shapes we
don't parse): find the top-level `key:` line inside the fence; a scalar value replaces the
rest of that line (`yamlScalar` from `obsidianMarkdown.ts` does the quoting); a list value
replaces the line plus its following `- ` block; a key whose current value is a block we don't
understand is **refused** for that row; a missing key is appended before the closing `---`; a
note with no block gets one. Dates write as `YYYY-MM-DD`, datetimes as `YYYY-MM-DDTHH:MM:SS`
(Obsidian's forms), logicals as `true`/`false`. mdbase-aware: when the note's type has a
schema, validate the outgoing value (type / enum / minimum / maximum / required — an
in-process subset, no CLI) and refuse the row rather than corrupt a record. Pure core:
`frontmatterPatch.ts` (`patchFrontmatter(text, patch): {text, refused[]}`), the ONE place
that edits a note's YAML (a `onePatchPath` rule candidate).

**C. Managed block write mode** on Write to Obsidian: `mode: overwrite | append | block`.
`block` splices the assembled markdown between `%% solenoid:begin <node name> %%` and
`%% solenoid:end %%` (Obsidian hides `%%` comments in reading view; the node's addressable
name keys the pair, so two Write nodes can own two blocks in one note). First write appends
the pair at the end of the note; later writes replace only the span. A `%%` inside the
assembled content is broken up (a zero-width space between the two signs) so it cannot close
the block early. Pure
`managedBlock.ts` (`spliceBlock(text, name, content)`), tested on: no markers, two pairs,
markers inside a code fence (ignored — fences win), a begin with no end (append a fresh pair,
leave the orphan).

**D. Links both ways.** Every written note (B and Write to Obsidian) gets a `solenoid`
frontmatter key, `"<document name> › <node name>"` — the addressable name, never the rete id
(`../subsystem-invariants.md` § Addressable model). Vault Folder, Import Note and both writers
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
`taskNotesToken`; `http://**` is already allowed): **Tasks** (`GET /api/tasks` paged → `path
· title · status · priority · due · scheduled · projects · contexts · tags · timeEstimate ·
trackedMinutes · predecessors · archived` + user fields — `predecessors` is `blockedBy`
joined `"A, B"` by task title, **exactly H6 Schedule's input**), **Time entries** (long form
`task · start · end · minutes · description`), **Calendar events** (`title · start · end ·
source`, window from two date inputs), **Stats** (`/api/stats` as scalars). Pure core
`taskNotesApi.ts` (paging + row mapping over a fetch stub; one fixture per endpoint). What the
frames unlock, ranked by what Bases cannot do:

- **F1 Schedule from dependencies.** Tasks → H6 Schedule (`../1.4-plan.md` § H6, now specced
  to the row: Task · Duration · Predecessors + Start / Working days / Holidays → Start · Finish ·
  Float · Critical + Project finish). Duration = `timeEstimate` ÷ an hours-per-day literal (a
  Math node, or H6's own `hoursPerDay` if the author wants it on the card); then `PUT`
  `scheduled` back (F6). Bases formulas are per-row — a traversal is impossible there. Gate:
  the Track H pick; the feed ships without it.
- **F2 Capacity and deadline probability.** GROUPBY due-week of `timeEstimate` minus calendar
  hours (H7 Common free time takes the busy windows) → overload chart; estimates through the
  composite Monte Carlo run mode with a per-task spread → the probability of a date.
- **F3 Time analytics and billing.** PIVOTBY week × project, Window running totals,
  actual ÷ estimate per project as a calibration table; join a rates frame → an invoice Report
  → Write to Obsidian (C into the client's note).
- **F4 "What next" via Decision Matrix.** Criteria from the row (priority, days-to-due,
  estimate, a user field); write `score` back (B, or F6 via the API); a Bases view sorted by it
  is the prioritized list.
- **F5 Recurrence adherence.** `complete_instances` (a date list column) expanded via Unnest →
  streaks and completion rate per task → heatmap.
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

**Not doing.** `.canvas` export (`canvas-bases` already materializes Bases views; a Solenoid
graph is computation, not a whiteboard). Writing `.base` view files (format in motion; a
Bases view over B's written properties is one click in Obsidian anyway). mdbase views,
actions, CloudEvents, hosted Connect. Wikilink resolution inside Note bodies and the
`![[Note]]` transclusion switch on write — small polish after C. Inline `#tags` and
`[[links]]` from bodies as columns — a body scan is A's `includeBody` plus a Text node.

## Node specs (the catalog rows a build session writes; DESIGN.md §7 voice)

| Node | Kind · menu | In | Out | Init (persisted) | Pure core · test |
|---|---|---|---|---|---|
| Vault Folder | connection · Connections | — | `frame` | vault, folder, glob, includeBody, refreshMinutes | `vaultFrame.ts`, `mdbaseTypes.ts`, `obsidianTypes.ts` · `vaultFrame.test.ts` over `fixtures/vault/` |
| Write Properties | sink · Connections | `frame` | — | vault, keys, addMissing | `frontmatterPatch.ts` · `frontmatterPatch.test.ts` (round-trips: untouched bytes identical) |
| Write to Obsidian (+mode) | sink (exists) | `document` | — | + mode | `managedBlock.ts` · `managedBlock.test.ts` |
| TaskNotes | connection · Connections | `from`, `to` (dates, Calendar provider only) | `frame` (Stats: scalars) | provider, refreshMinutes | `taskNotesApi.ts` · `taskNotesApi.test.ts` (fixtures per endpoint) |
| Write Tasks | sink · Connections | `frame` | — | mode (create / update), keys | shares `taskNotesApi.ts` |

Every write node: `enabled` stays out of the persistence whitelist (loads disarmed, the
existing `WriteObsidianNode` pattern), status line + Preview, `socketDocs` say "wiring never
writes". Every read node: background fetch, sync `data()`, `#VALUE!`-class error on an
unreachable vault/port with the reason in the status line, never a throw.

## Seeds

Seeds must load on web with no vault, so each ships a **Frame Input snapshot in the exact
shape the feed emits** (a comment on the node: "replace me with a TaskNotes node"):
**"Which task next?"** (F4: 12 tasks → Decision Matrix with priority / days-to-due / estimate →
Score → bar chart, and a Write Properties node disarmed at the end) and, when H6 lands,
**"Kitchen remodel from TaskNotes"** (H6's own seed re-based on the tasks shape, with
`predecessors` text). The existing `decision-matrix.json` already joins a Note-frontmatter frame;
it stays the "vault as a source" demo.

## Rules touched (cite in commits)

`sinkRunButtonOnly` (every writer), `noDataInComponents` (Preview is a pure plan over the
cached frame + reads), `retypeReconciles` avoided by design (frame output), `onePrunePath`
untouched (no per-key sockets), a new **`onePatchPath`** candidate (`frontmatterPatch.ts` is
the only writer of a note's YAML; `obsidianWrite.ts` writes whole documents, never patches).
The fs allowlist change (`.yaml`/`.yml` read) is a one-line capability edit, documented in
`../architecture.md`'s desktop section.

## Sequencing (dependency order)

A → B → D → C → F (feed + F4/F3/F5 + F6) → I → E; F1 when H6 lands; G and H on hold. A alone is a
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

## Sources (read 2026-09-06)

- Obsidian: https://obsidian.md/help/properties · https://obsidian.md/help/bases/syntax
- TaskNotes: https://github.com/callumalpass/tasknotes · https://tasknotes.dev/HTTP_API/ ·
  https://tasknotes.dev/webhooks/ · https://tasknotes.dev/developers/specification/ ·
  https://github.com/callumalpass/tasknotes/releases
- Companions: https://github.com/callumalpass/tasknotes-workflows ·
  https://github.com/callumalpass/canvas-bases · https://github.com/callumalpass/tasknotes-app
- mdbase: https://github.com/mdbase-dev/mdbase-spec · https://github.com/callumalpass/mdbase ·
  https://github.com/callumalpass/mdbase-cli (archived) ·
  https://github.com/mdbase-dev/mdbase-connect · https://github.com/mdbase-dev/mdbase-obsidian ·
  https://github.com/callumalpass/mdbase-tasknotes
