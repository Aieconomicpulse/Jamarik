import { describe, it, expect } from "vitest";
import { rung, expectedRecoverable, COLLECTABILITY } from "@/lib/triage";

const base = { signature: "under_invoicing", absent: false, persistent: false, years_flagged: 1, years_seen: 2, p_real: 0.6, fiscal_loss: 100 };

describe("rung", () => {
  it("strong: absent, persistent and under-declared", () => {
    const r = rung({ ...base, absent: true, persistent: true, years_flagged: 2 });
    expect(r.level).toBe("strong");
    expect(r.tests).toContain("absent from Lebanon's books under any origin");
    expect(r.tests).toContain("flagged in 2 of 2 years");
  });
  it("probable: persistent and under-declared, or absent and under-declared", () => {
    expect(rung({ ...base, persistent: true, years_flagged: 2 }).level).toBe("probable");
    expect(rung({ ...base, absent: true }).level).toBe("probable");
  });
  it("verify: anything else, including unrecorded corridors that pass every other test", () => {
    expect(rung(base).level).toBe("verify");
    expect(rung({ ...base, signature: "value_gap", absent: true, persistent: true }).level).toBe("verify");
  });
  it("names the noise correction and the preference", () => {
    const r = rung({ ...base, preference: "eu", hub: true });
    expect(r.tests).toContain("60% survives the noise correction");
    expect(r.tests).toContain("EU preference — duty not at stake");
    expect(r.tests).toContain("hub partner — attribution risk");
  });
});

describe("expectedRecoverable", () => {
  it("is corrected loss × collectability", () => {
    expect(expectedRecoverable(base)).toBeCloseTo(0.6 * 100 * COLLECTABILITY);
  });
  it("assumes half survives when p_real is missing", () => {
    expect(expectedRecoverable({ fiscal_loss: 100 })).toBeCloseTo(0.5 * 100 * COLLECTABILITY);
  });
});
