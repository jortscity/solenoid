# Solenoid demo vault

A small, self-contained Obsidian vault for building and eyeballing the Obsidian
integration. It is also the fixture set: the pure-core tests read this tree directly
(one source of truth, no `tests/fixtures/vault/` copy to drift), and it is the vault to
point a desktop build at.

It is deliberately varied so every typing path and cell shape is exercised:

- **`Projects/`** — an **mdbase collection** (`mdbase.yaml` + `_types/project.md`). Types
  come from the mdbase schema: `status` (enum → string), `priority` (integer → number),
  `budget` (number), `due` (date), `tags` (list), `milestones` (array of objects → a
  nested cube cell). The typing source of first resort.
- **`Notes/`** — a **plain folder** with no schema. `Deep Work.md`'s `rating` / `read` /
  `started` / `finished` are typed from **`.obsidian/types.json`**; everything else falls
  to the guesser. `Spanish course.md`'s `sessions` is a list of records with their own tag
  lists — a nested cube. Wikilinks, `#tags`, and an `![[embed]]` appear in bodies.
- **`Daily/`** — the **daily-notes folder** (`.obsidian/daily-notes.json`: `YYYY-MM-DD`).
  Each note carries `mood` / `sleep` / `weight` / `exercised`. With R3 the file name
  parses into a `date` column, so these become a time series.
- **`Tasks/`** — **TaskNotes-shaped** notes: the frontmatter the plugin writes, including
  block-style `timeEntries` (the nested shape the v1 parser keeps as raw text) and
  `complete_instances`, `blockedBy` as a wikilink list.
- **`People/`** — link targets, so wikilinks in properties and bodies resolve.
- **`Projects.base`** — one Bases table view, so a note can show a live table over what a
  Solenoid Write Properties run produces.

## What the seeds do to it

- **Your vault as a table** — a Vault Folder over `Notes/` (or the whole vault) → the cube;
  Filter `tags contains book`, Sort by `rating`. The A showcase.
- Later seeds (B, F) write properties back and read TaskNotes through the HTTP API; they
  target this vault so a change is visible in Obsidian immediately.

Nothing here is secret or real; edit freely.
