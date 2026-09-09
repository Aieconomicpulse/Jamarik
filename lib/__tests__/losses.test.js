import { describe, it, expect } from "vitest";
import { classifyCover, estimateFor, summary, BANDS } from "@/lib/losses";
import T from "@/config/thresholds.json";

describe("classifyCover", () => {
  it("reads the bands from config/thresholds.json", () => {
    expect(BANDS).toEqual({ under_lo: T.under_lo, under_hi: T.under_hi, over: T.over });
  });
  it("under-declared between 40% and 85%", () => expect(classifyCover(100, 50)).toBe("under_invoicing"));
  it("largely unrecorded below 40%", () => expect(classifyCover(100, 30)).toBe("value_gap"));
  it("Lebanon declares more above 160%", () => expect(classifyCover(100, 170)).toBe("over_invoicing"));
  it("only in Lebanon's books when the partner reports nothing", () => expect(classifyCover(0, 10)).toBe("not_in_partner"));
});

describe("estimateFor", () => {
  const meta = { estimate: { years: {
    2023: { gross: 10, central: 6, lo: 4, hi: 8, floor: 5, flagged: 3 },
    2024: { gross: 20, central: 12, lo: 9, hi: 15, floor: 10, flagged: 4 },
  } } };
  it("returns one year", () => expect(estimateFor(meta, 2024).central).toBe(12));
  it("sums every year for 'all'", () => {
    const e = estimateFor(meta, "all");
    expect(e.gross).toBe(30); expect(e.central).toBe(18); expect(e.lo).toBe(13); expect(e.hi).toBe(23); expect(e.flagged).toBe(7);
  });
  it("is null without an estimate", () => expect(estimateFor({}, 2024)).toBeNull());
});

describe("summary", () => {
  const c = (signature, extra) => ({
    signature, x_cif: 100, m: 60, shortfall: 40, outflow: 0, vat_floor: 4.4, duty_loss: 2, fiscal_loss: 6.4, p_real: 0.5, ...extra,
  });
  const rows = [
    c("under_invoicing"),
    c("value_gap", { p_real: 0.25 }),
    c("over_invoicing", { shortfall: 0, outflow: 30, vat_floor: 0, duty_loss: 0, fiscal_loss: 0, p_real: undefined }),
  ];
  const s = summary(rows);
  it("keeps under, unrecorded and over apart", () => {
    expect(s.under.count).toBe(1); expect(s.unrecorded.count).toBe(1); expect(s.over.count).toBe(1);
    expect(s.fiscal).toBeCloseTo(12.8); expect(s.outflow).toBe(30);
  });
  it("weights the corrected figure by p_real", () => {
    expect(s.correctedFiscal).toBeCloseTo(6.4 * 0.5 + 6.4 * 0.25);
    expect(s.under.corrected).toBeCloseTo(3.2);
  });
});
