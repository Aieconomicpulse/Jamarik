"""The decomposition: what the gap is not, checked on hand-made corridors."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import estimate as E  # noqa: E402
from build_mirror import VAT_RATE  # noqa: E402


def corridor(hs4, x_cif, m, signature, duty_rate, partner=1, year=2024):
    gap = x_cif - m
    shortfall = max(gap, 0.0) if signature in E.FLAGGED else 0.0
    outflow = max(-gap, 0.0) if signature == "over_invoicing" else 0.0
    return {
        "year": year, "partner": partner, "hs4": hs4, "hs2": hs4[:2], "x_cif": x_cif, "m": m, "gap": gap,
        "cover": (m / x_cif) if x_cif else None, "signature": signature, "shortfall": shortfall,
        "outflow": outflow, "duty_rate": duty_rate, "fiscal_loss": shortfall * (VAT_RATE + duty_rate),
    }


def test_identity_before_adjustment_minus_set_aside_minus_normal_is_flagged():
    cs = [
        corridor("8539", 4e6, 0, "value_gap", 0.0), corridor("8541", 1e6, 5e6, "over_invoicing", 0.0),
        corridor("6402", 1e6, 0.5e6, "under_invoicing", 0.2), corridor("8710", 2e6, 0, "exempt", 0.0),
        corridor("2710", 0, 9e6, "structural", 0.0), corridor("9403", 1e6, 0.9e6, "normal", 0.1),
    ]
    steps, _ = E._waterfall(cs)
    assert abs(steps["raw"] - steps["set_aside"] - steps["normal"] - steps["flagged_gross"]) < 1
    assert abs(steps["flagged_gross"] - sum(c["fiscal_loss"] for c in cs if c["signature"] in E.FLAGGED)) < 1


def test_same_chapter_over_offsets_under_to_nothing():
    # LED lamps short under 8539, the same value booked as diodes under 8541: chapter 85 balances.
    cs = [corridor("8539", 4e6, 0, "value_gap", 0.0), corridor("8541", 1e6, 5e6, "over_invoicing", 0.0)]
    steps, pairs = E._waterfall(cs)
    assert steps["short_offset"] == 4e6 and steps["after_chapter"] == 0 and steps["attributable"] == 0
    assert pairs == [] and steps["same_rate_offset"] == 4e6


def test_shift_to_a_cheaper_heading_leaves_the_duty_difference():
    cs = [corridor("6402", 2e6, 0, "value_gap", 0.2), corridor("6406", 0.5e6, 2.5e6, "over_invoicing", 0.05)]
    steps, pairs = E._waterfall(cs)
    assert len(pairs) == 1 and (pairs[0]["under_hs4"], pairs[0]["over_hs4"]) == ("6402", "6406")
    assert abs(pairs[0]["duty_at_stake"] - 2e6 * 0.15) < 1
    assert abs(steps["attributable"] - 2e6 * 0.15) < 1          # fully netted in value; the duty gap stays


def test_residual_when_the_over_side_is_smaller():
    cs = [corridor("5407", 10e6, 0, "value_gap", 0.1), corridor("5408", 0, 3e6, "not_in_partner", 0.1)]
    steps, _ = E._waterfall(cs)
    assert steps["short_offset"] == 3e6 and steps["short_after"] == 7e6
    assert abs(steps["after_chapter"] - 7e6 * (VAT_RATE + 0.1)) < 1


def test_decompose_totals_and_merge_keep_the_flagged_count():
    cs = [corridor("6402", 2e6, 0, "value_gap", 0.2, partner=156), corridor("6402", 1e6, 0.6e6, "under_invoicing", 0.0, partner=380)]
    dec = E.decompose(cs)
    y = dec["years"]["2024"]
    assert set(y["partners"]) == {"156", "380"}
    assert abs(y["attributable"] - sum(p["attributable"] for p in y["partners"].values())) < 1
    assert [p["key"] for p in dec["pending"]] == ["partner_bias", "transit", "quantity", "timing"]
    est = E.estimate(cs, draws=5)
    E._merge_decomposition(est, dec)
    assert est["years"]["2024"]["attributable"] == y["attributable"]
    assert est["years"]["2024"]["flagged"] == 2                  # the corridor count is untouched


def test_a_surplus_inside_ordinary_asymmetry_does_not_net():
    # Lebanon 30% above the partner on 8541 is noise for the reflected tail, not a landing heading.
    cs = [corridor("8539", 4e6, 0, "value_gap", 0.0), corridor("8541", 2e6, 2.6e6, "normal", 0.0)]
    steps, _ = E._waterfall(cs)
    assert steps["short_offset"] == 0 and steps["short_after"] == 4e6
