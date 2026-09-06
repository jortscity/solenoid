# Solenoid — Backlog (1.4)

**OPEN items only, kept terse.** When an item lands, DELETE its line — git history and
the dev-notes digests are the record. **1.3 shipped** (v1.3.0 on `main`; `develop` is
level with it). **The 1.4 cut is PROPOSED, not ratified:** `1.4-plan.md` scores every
deferred idea and carries the per-item plans; nothing there is scheduled until the author
promotes it — a promoted item becomes a line here and its plan section is the spec. The
structural arcs are `2.0-plan.md` + `v2.0/`; parked-with-no-plan items: `deferrals.md`;
ruled-out ideas: `out-of-scope.md`; settled rationale: `decisions.md`.

## Dependency updates (walking them one at a time; TypeScript 7 landed 2026-08-11a)

Current state (2026-09-04): the walkable set is on latest in-range (`react` 19.2.8,
`vite` 8, `@xyflow/react` 12.11.6, the Tauri plugins, etc. — git has the walk), and
`@anthropic-ai/sdk` is on 0.123 (the palette's `beta.messages` surface, error classes
and client options were untouched across those majors). Remaining major: `vitest` 5
(4.1.11 stands). The rete RENDER packages and `styled-components` were removed outright
by the React Flow cutover (rete core 2.0.6 + rete-engine + elkjs 0.12 + `@xyflow/react`
remain). The `.npmrc` `legacy-peer-deps` workaround is REMOVED — the old
elkjs-vs-rete-auto-arrange peer conflict left with the plugin.

## Release planning (author-run)

- [ ] **Finish ratifying the 1.4 cut** — the author walked `1.4-plan.md` one item per turn on
  2026-09-04c and 2026-09-06 (Tracks A–H ruled; every ruling is in the table's Call column and
  the Track H headings). NEXT: G (release tail); then `2.0-plan.md`.
- [ ] **Ratify `out-of-scope.md`** (DRAFT since July, no ARR anywhere in it) — the deferral
  review's standing ask. Test 3 / §3 / §11 already read the author's 2026-09-01 order
  (collaboration IN); the rest is still the agent's inference awaiting the author's word.
- [ ] **The `rules.md` ARR pass** (author-present; the author: waits for 1.4) — early in the
  release, before the track work adds rules (`1.4-plan.md` D3).

## Composites

- [ ] **LATER — Optimize run mode on composites (1.4 A6; author 2026-09-04c: in, not now).** Excel
  Solver's shape as a sixth composite run mode beside Goal Seek; spec + steps in `1.4-plan.md`
  § A6. Gate: the author says go (and settles the constraint forms; integer no).

## Tables

- [ ] **Chip + case compose (1.4 B2.2 follow-up).** The Chip style (LANDED B2.2) shares the
  text-family style dropdown with letter-case, so it's exclusive with UPPER/lower/Proper this
  tranche. If wanted, let a chip also carry a case — a separate `chip` toggle beside the case
  dropdown rather than a fifth dropdown value (`chip` is already its own annotation flag).
  Record color-by and conditional formatting still inherit the one chip mechanism; enum column
  TYPE stays 2.0 (author).

## Sources

- [ ] **Widget nodes Tier 1 (1.4 C1, author 2026-09-04c).** The bundle in `v2.0/16-widget-nodes.md`:
  Weather + Geocode (Open-Meteo), Currency/FX (Frankfurter), Holidays (Nager.Date), Time Zone
  Convert + World Clock (pure `Intl`), QR Code (pure). Each on the Data Feed build (provider file
  + node + component + fixture tests + seed). Defaults taken from the plan unless the author
  overrules: FX in; the three keyless providers as built-in dependencies; the fetching four
  beside the Connections nodes, the pure two in Timesavers; a "Garden Dashboard" seed. Order:
  Geocode + Weather, Holidays, TZ/QR, FX last. Node-design rules in `node-coverage.md`;
  descriptions never explain wiring.

## Finance

- [ ] **Payment breakdown: ONE card (1.4 D2, author 2026-09-04c: in; designed, not started).**
  `PaymentBreakdownNode`, one `op` = ipmt | ppmt | cumipmt | cumprinc; two toggles SET it — Share
  (Interest | Principal) flips within the pair, Span (One period | Range) flips the pair AND drives
  the reshape; payment timing stays an arg toggle. Keys: single = [rate, per, nper, pv, fv];
  range = [rate, nper, pv, start, end]; shared sockets keep cables via `keysDroppedBySwitch` +
  `reshapeInputs` (`finance.ts` § Spec-table op cards), component hand-rolled like
  AccruedInterest. Math copied VERBATIM from `IpmtPpmtNode.data()` / `CumPmtNode.data()` (goldens
  byte-identical); nodeExcel merges the four names under one key; the two catalog pairs
  (`ipmtPpmtLeaf` / `cumPmtLeaf`) become one "Payment Breakdown" leaf; retired names "IpmtPpmt" /
  "CumPmt" → Placeholder (registry test). Suites: financeInvariants, parity, nodeOps,
  formulaNodeCoverage, seeds, catalogRegistry, uiCopy.

## Track H — Allocator-family nodes (author 2026-09-06: in)

Each ships WITH a seed baked via `scripts/tune-seeds.mjs`; specs are the `1.4-plan.md` § Track H
sections. Gate defaults below are the lead's picks unless the author overrules.

- [ ] **H3 Group Cost Settle** — people frame (Paid, optional Share) → transfers frame (From · To ·
  Amount) + per-person Net; greedy biggest-creditor-to-biggest-debtor. Default: equal split (Share
  weights when present). Seed "Trip split".
- [ ] **Hours-balancing seed on the Allocator** ("Balance a team's hours": people Min · Max · Weight,
  the Allocator with `h` on Min, a Display of Share as %) + loosen the Allocator's socket copy from
  "price range" to "range". Zero code beyond copy.
- [ ] **H1 Payoff Planner** — debts frame (Balance, APR, Min payment) + `extra`; Avalanche |
  Snowball; monthly cascade, closed-form. Output mode: summary (Debt · Months · Interest · Payoff
  date) default, schedule frame (Month · per-debt balance) the other. Currency unit carried. Seed
  "Debt payoff".
- [ ] **H6 Schedule (CPM)** — tasks frame/cube (Task · Duration · Predecessors) + Start, Working
  days (default on), Holidays → rows + Start · Finish · Float · Critical, `Project finish` scalar,
  `gantt` Mermaid source. Pure verb, Kahn + forward/backward pass; Float in v1. Seed "Kitchen
  remodel". Full spec `1.4-plan.md` § H6.

## Canvas annotation

- [ ] **Drawn cables: nothing tows one.** A drawn arrow annotating a node stays put when that node
  moves, Tidy runs, or a group expands. An optional per-END anchor to a node id would fix it and is
  the natural v2; deliberately out of v1 (they take no part in layout).

## Formatting & units

- [ ] **LATER (author, 2026-09-04): fold the Format Controller into the Display** — format and
  unit set at sources and displays, flowing downstream only; the docking subsystem and the
  upstream walk go. Analysis + scope in `1.4-plan.md` Track I. Gate: the author's go after the
  downstream-flow work has been lived with, plus the source-node control design.

## Seeds

- [ ] **Seed-layout sweep — the author eyeballs the 20 re-cut seeds** (2026-09-04b, two agent
  batches under the groups-over-standoffs rule in `subsystem-invariants.md` § Standoffs; per-seed
  outcomes in the dev-notes digest). Open calls: power-features kept its `in-sb ↔ grp-mon` data
  standoff because a Note narrates that very bar ("cut it and rewrite the Note?"); famous-math's
  loose expression chain was wrapped beside two pre-existing groups rather than merged. Not swept:
  sudoku-solver, composite-workbench, zz-scratch-new-nodes (not teaching galleries),
  personal-finance and live-market-data (held from tuning, see the 09-03 digest).
