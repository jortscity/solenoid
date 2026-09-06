import { describe, it, expect } from "vitest";
import { fxLatestUrl, parseFxRate, FX_CURRENCIES } from "../../src/graph/fxProvider";
import { parseDateToSerial } from "../../src/graph/nodes/dateSerial";
import { applyFcUnit } from "../../src/graph/unitBridge";
import { isUnitCell, dimOf } from "../../src/graph/unitValue";

// C1 Currency / FX — the Frankfurter parse is pure + fixture-tested (widget rule 5), and
// importing fxProvider registers every currency code with the display bridge.

const usdEur = JSON.stringify({ amount: 1, base: "USD", date: "2026-09-04", rates: { EUR: 0.86044 } });

describe("fxLatestUrl", () => {
  it("builds the base/symbols endpoint, upper-casing and trimming", () => {
    expect(fxLatestUrl(" usd ", "eur")).toBe("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR");
  });
});

describe("parseFxRate", () => {
  it("pulls the requested rate and the as-of date", () => {
    const r = parseFxRate(usdEur, "EUR");
    expect(r.rate).toBe(0.86044);
    expect(r.date).toBe("2026-09-04");
    expect(r.serial).toBe(parseDateToSerial("2026-09-04"));
  });
  it("a missing target rate is null", () => {
    expect(parseFxRate(usdEur, "GBP").rate).toBeNull();
  });
  it("a malformed body is a null rate with no date", () => {
    expect(parseFxRate("not json", "EUR")).toEqual({ date: "", serial: NaN, rate: null });
  });
});

describe("FX_CURRENCIES — the bundled picker list", () => {
  it("parses code + name, keeping multi-word names whole", () => {
    expect(FX_CURRENCIES.length).toBeGreaterThan(25);
    expect(FX_CURRENCIES.find((c) => c.code === "USD")?.name).toBe("United States Dollar");
    expect(FX_CURRENCIES.find((c) => c.code === "CNY")?.name).toBe("Chinese Renminbi Yuan");
  });
  it("every code is three upper-case letters", () => {
    for (const c of FX_CURRENCIES) expect(c.code).toMatch(/^[A-Z]{3}$/);
  });
});

describe("currency-unit registration — applyFcUnit authors a currency cell for any code", () => {
  it("a code beyond the four built-ins (CAD) tags the value on the currency dimension", () => {
    const cell = applyFcUnit(100, "cad");
    expect(isUnitCell(cell)).toBe(true);
    expect(dimOf(cell)).toEqual({ currency: 1 });
    expect((cell as { display?: string }).display).toBe("cad");
  });
});
