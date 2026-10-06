import { describe, it, expect } from "vitest";
import { normalize, parseAmount, verifyRecord, verifyAll } from "@/lib/live/verify";
import { classify, htmlToText, tableFromGrid, summarize } from "@/lib/live/parse";

const SOURCE = `Hellenic Statistical Authority — monthly bulletin.
In March 2025, exports of olive oil (HS 1509) to Lebanon reached EUR 4,215,300 for 812,400 kg.
Tobacco exports to Lebanon were 3.4 million euros in the first quarter.`;

describe("parseAmount", () => {
  it("reads grouped thousands and decimals", () => {
    expect(parseAmount("EUR 4,215,300")).toBe(4215300);
    expect(parseAmount("1,234.5")).toBe(1234.5);
    expect(parseAmount("1.234.567")).toBe(1234567);
    expect(parseAmount("1.234,5")).toBe(1234.5);
    expect(parseAmount("12,5")).toBe(12.5);
    expect(parseAmount("1 234 567")).toBe(1234567);
  });
  it("applies a written scale word", () => {
    expect(parseAmount("3.4 million euros")).toBeCloseTo(3.4e6);
    expect(parseAmount("USD 2 bn")).toBe(2e9);
  });
  it("refuses text with no number or more than one", () => {
    expect(parseAmount("about half")).toBeNull();
    expect(parseAmount("2024 1,200")).toBeNull();
  });
});

describe("verifyRecord", () => {
  const good = {
    quote: "In March 2025, exports of olive oil (HS 1509) to Lebanon reached EUR 4,215,300 for 812,400 kg.",
    product: "olive oil", hs_code: "1509", period: "March 2025",
    value_text: "EUR 4,215,300", quantity_text: "812,400", quantity_unit: "kg",
  };

  it("accepts a record copied from the source and parses its figures", () => {
    const r = verifyRecord(good, SOURCE);
    expect(r.ok).toBe(true);
    expect(r.record.value).toBe(4215300);
    expect(r.record.quantity).toBe(812400);
  });
  it("tolerates retyped quotes, dashes and whitespace", () => {
    expect(verifyRecord({ ...good, quote: good.quote.replace(/ /g, "  ") }, SOURCE).ok).toBe(true);
  });
  it("rejects a quote that is not in the source", () => {
    expect(verifyRecord({ ...good, quote: "Olive oil exports reached EUR 4,215,300." }, SOURCE).reason).toMatch(/quote not found/);
  });
  it("rejects a figure the model changed, even by one digit or a rounding", () => {
    expect(verifyRecord({ ...good, value_text: "EUR 4,215,000" }, SOURCE).ok).toBe(false);
    expect(verifyRecord({ ...good, value_text: "EUR 4.2 million" }, SOURCE).ok).toBe(false);
  });
  it("rejects a figure taken from outside its own quote", () => {
    const r = verifyRecord({ ...good, value_text: "3.4 million euros" }, SOURCE);
    expect(r.ok).toBe(false);
  });
  it("never repeats the rejected figure in the reason", () => {
    const r = verifyRecord({ ...good, value_text: "EUR 9,999,999" }, SOURCE);
    expect(r.reason).not.toContain("9,999,999");
  });
  it("takes a period stated elsewhere in the document, and flags it", () => {
    const r = verifyRecord({ ...good, period: "March 2025", quote: "Tobacco exports to Lebanon were 3.4 million euros in the first quarter.", value_text: "3.4 million euros", quantity_text: undefined, hs_code: undefined }, SOURCE);
    expect(r.ok).toBe(true);
    expect(r.record.period).toBe("March 2025");
    expect(r.record.context_from_document).toEqual(["period"]);
  });
  it("removes context the document does not contain at all", () => {
    const r = verifyRecord({ ...good, period: "June 2031" }, SOURCE);
    expect(r.ok).toBe(true);
    expect(r.record.period).toBeUndefined();
    expect(r.record.context_removed).toEqual(["period"]);
  });
  it("rejects a record with no figure", () => {
    expect(verifyRecord({ quote: good.quote, product: "olive oil" }, SOURCE).ok).toBe(false);
  });
});

describe("verifyAll", () => {
  it("splits verified from rejected", () => {
    const { verified, rejected } = verifyAll([
      { quote: "Tobacco exports to Lebanon were 3.4 million euros in the first quarter.", value_text: "3.4 million euros" },
      { quote: "Tobacco exports to Lebanon were 3.5 million euros", value_text: "3.5 million euros" },
    ], SOURCE);
    expect(verified).toHaveLength(1);
    expect(verified[0].value).toBeCloseTo(3.4e6);
    expect(rejected).toHaveLength(1);
  });
});

describe("classify", () => {
  it("keeps a CSV as a table, cell text unchanged", () => {
    const t = classify(Buffer.from("hs,value\n1509,\"4,215,300\"\n2402,0012\n"), ".csv");
    expect(t.kind).toBe("table");
    expect(t.columns).toEqual(["hs", "value"]);
    expect(t.rows[0]).toEqual(["1509", "4,215,300"]);
    expect(t.rows[1][1]).toBe("0012");
  });
  it("treats a JSON list of flat records as a table", () => {
    const t = classify(Buffer.from(JSON.stringify({ data: [{ hs: "1509", value: 10 }, { hs: "2402", note: "x" }] })), ".json");
    expect(t.kind).toBe("table");
    expect(t.columns).toEqual(["hs", "value", "note"]);
    expect(t.rows[1]).toEqual(["2402", "", "x"]);
  });
  it("sends nested JSON and prose to extraction", () => {
    expect(classify(Buffer.from(JSON.stringify({ a: { b: [1, 2] } })), ".json").kind).toBe("text");
    expect(classify(Buffer.from(SOURCE), ".txt").kind).toBe("text");
  });
  it("strips HTML to readable text", () => {
    expect(normalize(htmlToText("<table><tr><td>Olive oil</td><td>4,215,300</td></tr></table><script>x()</script>"))).toBe("Olive oil | 4,215,300 |");
  });
});

describe("tableFromGrid and summarize", () => {
  const grid = [
    ["Exported 3 records in total", "", "", ""],
    ["Date", "HS Code", "Amount(USD)", ""],
    ["2026-08-31", "62092010", "$1301", ""],
    ["2026-08-31", "62046990", "$2412", ""],
    ["2026-08-31", "62092010", "Undisclosed", ""],
    ["", "", "", ""],
  ];
  it("finds the header below a title line and keeps the title as preamble", () => {
    const t = tableFromGrid(grid);
    expect(t.preamble).toEqual(["Exported 3 records in total"]);
    expect(t.columns).toEqual(["Date", "HS Code", "Amount(USD)"]);
    expect(t.total).toBe(3);
    expect(t.rows[0]).toEqual(["2026-08-31", "62092010", "$1301"]);
  });
  it("counts only cells that hold one readable number, and says how many", () => {
    const sm = summarize(tableFromGrid(grid), parseAmount);
    expect(sm.rows).toBe(3);
    expect(sm.totals).toEqual([{ column: "Amount(USD)", total: 3713, counted: 2, of: 3 }]);
    expect(sm.hs).toEqual(["62046990", "62092010"]);
  });
  it("still treats row one as the header when there is no title line", () => {
    expect(tableFromGrid([["a", "b"], ["1", "2"]]).columns).toEqual(["a", "b"]);
  });
});
