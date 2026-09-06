// Group cost settlement (1.4 H3): people paid uneven amounts; who pays whom, in the fewest
// transfers, so everyone ends up even. Net each person (paid − fair share), then greedily
// match the biggest creditor to the biggest debtor. Linear, exact, no solver. Pure.

export interface SettleRow {
  name: string;
  paid: number;
  /** Optional weight of the share this person owes (1 = an equal share). */
  share?: number | null;
}

export interface Transfer {
  from: string;
  to: string;
  amount: number;
}

export interface Settlement {
  /** Each person's net: positive = is owed, negative = owes. Same order as the input. */
  nets: number[];
  /** Everyone's fair share (paid total × weight / Σ weights). Same order as the input. */
  shares: number[];
  transfers: Transfer[];
}

const round2 = (x: number) => Math.round(x * 100) / 100;

/** Settle the group. Shares come from the `share` weights when any row carries one (a blank
 *  weighs 1); otherwise everyone owes an equal share. Amounts round to cents; a residual
 *  cent lands on the last transfer so the transfers sum to the debts exactly. */
export function settleGroup(rows: readonly SettleRow[], opts: { weighted?: boolean } = {}): Settlement {
  const n = rows.length;
  const total = rows.reduce((s, r) => s + (Number.isFinite(r.paid) ? r.paid : 0), 0);
  const useWeights = opts.weighted ?? rows.some((r) => r.share != null);
  const weights = rows.map((r) => (useWeights && r.share != null && Number.isFinite(r.share) && r.share >= 0 ? r.share : 1));
  const wsum = weights.reduce((a, b) => a + b, 0) || n;
  const shares = weights.map((w) => (n ? (total * w) / wsum : 0));
  const nets = rows.map((r, i) => (Number.isFinite(r.paid) ? r.paid : 0) - shares[i]);

  // Greedy: the biggest creditor takes from the biggest debtor until one of them is even.
  const creditors = nets.map((v, i) => ({ i, v: round2(v) })).filter((x) => x.v > 0.005).sort((a, b) => b.v - a.v);
  const debtors = nets.map((v, i) => ({ i, v: round2(-v) })).filter((x) => x.v > 0.005).sort((a, b) => b.v - a.v);
  const transfers: Transfer[] = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci], d = debtors[di];
    const amount = round2(Math.min(c.v, d.v));
    if (amount > 0) transfers.push({ from: rows[d.i].name, to: rows[c.i].name, amount });
    c.v = round2(c.v - amount);
    d.v = round2(d.v - amount);
    if (c.v <= 0.005) ci++;
    if (d.v <= 0.005) di++;
  }
  return { nets: nets.map(round2), shares: shares.map(round2), transfers };
}
