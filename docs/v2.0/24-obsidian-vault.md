# Bundle 24 — Obsidian: the vault as a table (+ TaskNotes, mdbase)

**Source:** author ask 2026-09-06 ("a tighter integration between Obsidian and Solenoid — not
an Obsidian plugin; using Solenoid's advanced features and objects", then "explore TaskNotes
and mdbase by the same developer"). **Verdict:** PROPOSAL, awaiting the author's pick.
**Written:** 2026-09-06, plan-only; the ecosystem facts below are a same-day web read and
WILL rot (mdbase is pre-1.0 and breaks by policy).

## What stands today (pointers, not restatement)

- **Import Obsidian Note** (`nodes/obsidian.ts` `ImportObsidianNode`, a `NoteNode` subclass):
  one `.md` → its frontmatter keys as typed output sockets + a `document` output. Manual Reload
  only. **Write to Obsidian** (`WriteObsidianNode`, `obsidianMarkdown.ts` + `obsidianWrite.ts`):
  a Document → one overwritten `.md` (pipe tables, mermaid fences, `$$` math, rasterized chart
  PNGs, `![[asset]]` embeds), Run-button only (rules `sinkRunButtonOnly`). Spec homes:
  `../node-coverage.md` § Connections & sinks / § Annotation, `../socket-reference.md`
  § `document`.
- **Note frontmatter** → sockets (`noteFrontmatter.ts`, `FIELD_SOCKETS` in `annotation.ts`):
  scalars, lists, and rows-of-objects → a frame. Date-only strings parse; **ISO datetimes
  (`2026-09-06T10:00`) do not** — they land as strings.
- **Decision Matrix** is the author's Decision Matrix Bases View plugin, math only
  (`../node-coverage.md` § Decision support).
- The constraints a vault feature meets: (1) the desktop fs allowlist
  (`src-tauri/capabilities/default.json`) is **by extension** — text read/write only for
  `$HOME/**/*.{json,csv,md}`, so `.base` / `.canvas` / `mdbase.yaml` are unreadable until added;
  (2) the vault root is the app-wide `obsidianVault` setting, not a per-document field, so a
  graph resolves its notes against whichever vault the current machine has configured;
  (3) there is **no file watcher** anywhere (`21-collaboration.md` Stage 0 is where one lands);
  (4) live sources are *connection* nodes (`nodes/connection.ts`, cache token +
  `refreshConnection`, `refreshMinutes` timer — `../subsystem-invariants.md` § Live
  connections); the Import node is not one.

## The line

The vault is the author's database and TaskNotes is its tracker. Solenoid **computes over**
the vault and writes results back as properties or blocks; it never stores, tracks, or renders
a kanban (`../out-of-scope.md` §5 "point at databases", §8 "computes, does not track"). No
Obsidian plugin: every touchpoint is a file, a local HTTP port, or a URI.

## The ecosystem, read 2026-09-06 (what the plan leans on)

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
`PUT /api/tasks/:id` (partial update), `POST /api/nlp/create`. **Webhooks**: 15 events
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
authorization, hosted mirrors, and an MCP endpoint), `mdbase-tasknotes` (`mtn`: ships a
the `_types` task type file with the TaskNotes field map + contract bindings, `list --json`),
`mdbase-obsidian` (v0.3, "type-first": inits collections, edits schemas, validates — it
**does not execute queries**, "delegating that to companion tools"), `mdbase-lsp`. TaskNotes
5.0 auto-upgrades its collection metadata to the v0.3 task type.

**The reading.** The author's ecosystem is converging on *typed markdown collections*: the
schema lives in the vault (`_types`), the tracker (TaskNotes) writes records, the Obsidian
plugin validates, and **query execution and computation are explicitly left to companion
tools**. Solenoid is the companion tool with a canvas: read the collection as a Frame, run the
full verb set + Decision Matrix + Monte Carlo + charts over it, and write properties back.
Nothing on the mdbase side does that today, and Bases formulas stop at per-row expressions.

## The items

**A. Vault Folder → Frame** (the keystone; a connection node in `nodes/connection.ts`, kind
`connection`, Add → Connections). Pick a vault folder (or the root) + an optional glob; emit
one row per note: the union of frontmatter keys as columns, typed by the existing guesser,
plus built-ins `path · name · folder · tags · created · modified` (a `body` column is an
opt-in toggle — it makes previews huge). **mdbase-aware:** if the folder or an ancestor holds
`mdbase.yaml`, read the `_types` files whose `path_glob` matches and take column types from the
JSON Schema instead of guessing (`string/number/integer/boolean` + `enum` → `string`,
`array` of those → the list rungs, `format: date/date-time` → `date`), `required` keys always
present. Fixes on the way: parse ISO datetimes to serials; bind the vault **per document**
(an init field defaulting from the setting) so a graph travels. Lazy on desktop like Local
File (a `FrameRef` behind the backend seam); `refreshMinutes` for free. Pure core:
`vaultFrame.ts` (`notesToFrame(files, schema?)`), `mdbaseTypes.ts` (schema → field types),
both unit-tested off a fixture folder.

**B. Write Properties** (sink, Run-button only, `sinkRunButtonOnly`). Input: a frame with a
`path` column (A's, or anything joined to it) + a picker of which columns to write. Per row,
patch **only the named keys** in that note's frontmatter, preserving key order, comments, the
body, and untouched keys byte-for-byte; add a missing key at the end; write through the
existing atomic tmp+rename. A **dry run** is the default state: "would update 43 notes, add
`score` to 12, 2 unreadable" before the write is armed. mdbase-aware: when the note's type has
a schema, validate the outgoing value (type/enum/min/max — a small in-process subset, no
external CLI) and refuse the row with a `#SCHEMA!`-style cell rather than corrupt a record.
Pure core: `frontmatterPatch.ts` (text in, text out) — the one place that edits a note's YAML.

**C. Managed block write mode** on Write to Obsidian: `mode: overwrite | append | block`.
`block` splices the assembled markdown between `%% solenoid:begin <node name> %%` and
`%% solenoid:end %%` (Obsidian hides `%%` comments in reading view), creating the pair at the
end of the note on first write, replacing only the span afterwards. The rest of the note is
the author's. Pure `managedBlock.ts` (splice), tested on the edge cases (no markers, two
pairs, markers inside a code fence).

**D. Links both ways.** Every written note gets a `solenoid` frontmatter key
(`"<document name> › <node name>"` — the addressable name, never the rete id,
`../subsystem-invariants.md` § Addressable model) and Import / Vault Folder / Write get an
"Open in Obsidian" button via `obsidian://open?vault=<name>&file=<path>` through
`openExternal` (no new capability). A `solenoid://` deep link back is a separate ask
(`tauri-plugin-deep-link` + single-instance); HOLD until a caller exists.

**E. Watch → refresh.** The Stage-0 watcher (`21-collaboration.md`) gets a second client: a
vault folder change bumps that node's connection token (`refreshConnection`) so an edit in
Obsidian recomputes the graph. Until it lands, A's `refreshMinutes` is the stopgap. This
closes `../deferrals.md`'s "auto-reload an imported note" item.

**F. TaskNotes Feed** (a connection node with a provider, like Data Feed; Settings gain
`taskNotesUrl` + `taskNotesToken`). Providers: **Tasks** (walk `GET /api/tasks` pages → one
frame: `path title status priority due scheduled projects contexts tags timeEstimate
trackedMinutes archived`), **Time entries** (`/api/tasks/:id/time` per task, or
`/api/time/summary` → `task · start · end · minutes`), **Stats** (`/api/stats` as scalars).
Why an API node when A reads the same files: the plugin applies the user's **field mapping**,
resolves recurrence instances, and totals `timeEntries` — replicating that from YAML is the
maintenance treadmill `../out-of-scope.md` §6 warns about. A stays the vault-closed fallback.
Writes: B gains a "via TaskNotes" switch that `PUT`s task rows through the API instead of
patching YAML, so field mapping is honoured and webhooks/workflows fire. Pure core:
`taskNotesApi.ts` (paging + row mapping over a fetch stub). Network goes through the existing
`tauri-plugin-http` allow (`http://**` is already allowed).

**G. Webhook → recompute.** TaskNotes can POST `task.updated` to a URL, but the desktop app has
no listener. Options: a tiny localhost listener in the Tauri shell (a Rust `axum` route that
verifies the HMAC and bumps a connection token), or the reverse — a `tasknotes-workflows` step
that shells out to `npm run run-graph` and B's headless twin. **HOLD:** E gives the same
outcome for file-backed reads with no new server surface; revisit if F's API reads need
push.

**H. mdbase query passthrough.** Shell out to the native `mdbase --root <vault> query --types
task --where <CEL>` and read JSON — their engine does CEL, links and lifecycle so we don't.
**HOLD:** the binary is beta, its JSON output shape is undocumented, `tauri-plugin-shell` isn't
in the app, and Solenoid's Filter/Sort already cover the `where` on A's frame. Revisit at
mdbase 1.0.

**Not doing.** `.canvas` export (`canvas-bases` already materializes Bases views; a Solenoid
graph is computation, not a whiteboard). Writing `.base` view files (format in motion; a
Bases view over B's written properties is one click in Obsidian anyway). mdbase views,
actions, CloudEvents, hosted Connect. Wikilink resolution inside Note bodies and the
`![[Note]]` transclusion switch on write — small polish after C.

## Sequencing (dependency order)

A → B → D → C → F → E; G and H on hold. A alone is a product ("your vault as a table").
A + B is the loop ("compute in Solenoid, see it in Bases"). F is the TaskNotes-specific slice
and is independent of B and C.

## Author calls before building

1. **Per-document vault binding** (A) vs keeping the single setting — recommend per-document
   with the setting as the default.
2. **mdbase types as the column truth** when present (A/B) — recommend yes; the guesser stays
   the fallback for untyped folders. This is the bet that Solenoid is the collection's
   compute layer.
3. **Property writes: YAML patch (B) first, API (F) as a switch** — or API-only for task
   notes? Recommend patch-first: it works with Obsidian closed and covers every note, not
   just tasks.
4. **Is F worth a provider now**, or does A over the tasks folder cover the author's own use
   until field mapping bites?

## Risks

mdbase breaks by policy before 1.0 (pin the spec version we read; a `spec_version` we don't
know → fall back to guessing, never refuse the folder). TaskNotes' API is opt-in, port and
token are the user's (Settings, not discovery). The fs allowlist needs `.yaml`/`.yml` for
`mdbase.yaml`, and a vault outside `$HOME` needs a capability change (document it, don't
widen to `**`). Writes touch the author's notes: B's dry run + atomic writes + never touching
the body are the whole safety story, and each pure core gets a fixture-folder test before a
node exists.

## Sources (read 2026-09-06)

- TaskNotes: https://github.com/callumalpass/tasknotes · https://tasknotes.dev/HTTP_API/ ·
  https://tasknotes.dev/webhooks/ · https://tasknotes.dev/developers/specification/ ·
  https://github.com/callumalpass/tasknotes/releases
- Companions: https://github.com/callumalpass/tasknotes-workflows ·
  https://github.com/callumalpass/canvas-bases · https://github.com/callumalpass/tasknotes-app
- mdbase: https://github.com/mdbase-dev/mdbase-spec · https://github.com/callumalpass/mdbase ·
  https://github.com/callumalpass/mdbase-cli (archived) ·
  https://github.com/mdbase-dev/mdbase-connect · https://github.com/mdbase-dev/mdbase-obsidian ·
  https://github.com/callumalpass/mdbase-tasknotes
