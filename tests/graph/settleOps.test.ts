import { describe, it, expect } from "vitest";
import { settleGroup } from "../../src/graph/nodes/settleOps";
import { settleFrame } from "../../src/graph/nodes/frame";
import type { FrameValue } from "../../src/graph/frame";

// 1.4 H3 Group Cost Settle: net everyone, then the biggest creditor takes from the biggest
// debtor — the fewest transfers a greedy pass gives, exact to the cent.

describe("settleGroup", () => {
  it("the trip: four people, uneven payments, settled in three transfers", () => {
    const r = settleGroup([
      { name: "Ada", paid: 300 }, { name: "Bo", paid: 100 }, { name: "Cy", paid: 40 }, { name: "Di", paid: 0 },
    ]);
    expect(r.shares).toEqual([110, 110, 110, 110]);
    expect(r.nets).toEqual([190, -10, -70, -110]);
    expect(r.transfers).toEqual([
      { from: "Di", to: "Ada", amount: 110 },
      { from: "Cy", to: "Ada", amount: 70 },
      { from: "Bo", to: "Ada", amount: 10 },
    ]);
    const paidBack = r.transfers.reduce((s, t) => s + t.amount, 0);
    expect(paidBack).toBe(190);
  });
  it("share weights: a couple counts double; blank weighs 1; opting out of weights ignores them", () => {
    const rows = [{ name: "Ada", paid: 90, share: 2 }, { name: "Bo", paid: 0, share: null }];
    expect(settleGroup(rows).shares).toEqual([60, 30]);
    expect(settleGroup(rows).transfers).toEqual([{ from: "Bo", to: "Ada", amount: 30 }]);
    expect(settleGroup(rows, { weighted: false }).shares).toEqual([45, 45]);
  });
  it("already even → no transfers; cents round and still balance", () => {
    expect(settleGroup([{ name: "A", paid: 10 }, { name: "B", paid: 10 }]).transfers).toEqual([]);
    const r = settleGroup([{ name: "A", paid: 10 }, { name: "B", paid: 0 }, { name: "C", paid: 0 }]);
    expect(r.shares).toEqual([3.33, 3.33, 3.33]);
    expect(r.transfers).toEqual([{ from: "B", to: "A", amount: 3.33 }, { from: "C", to: "A", amount: 3.33 }]);
  });
  it("an empty group settles nothing", () => {
    expect(settleGroup([])).toEqual({ nets: [], shares: [], transfers: [] });
  });
  it("settleFrame: the net frame names the fair share Owes, never the input's Share weights", () => {
    const f: FrameValue = { __frame: true, columns: [
      { name: "Person", type: "string", values: ["Ada", "Bo"] },
      { name: "Paid", type: "number", values: [90, 0] },
      { name: "Share", type: "number", values: [2, 1] },
    ] };
    const { transfers, net } = settleFrame(f, "weighted");
    expect(net.columns.map((c) => c.name)).toEqual(["Person", "Paid", "Owes", "Net"]);
    expect(net.columns[2].values).toEqual([60, 30]);
    expect(transfers.columns.map((c) => c.name)).toEqual(["From", "To", "Amount"]);
  });
});
