#!/usr/bin/env python3
"""
Jamarik post-processor — symmetric corridors and the noise-corrected estimate.

Reads the two files the build writes (data/mirror_gaps.json, data/mirror_hs6.json),
rebuilds the HS-4 corridor set SYMMETRICALLY from the HS-6 lines, runs the
reflected-tail estimator, and writes mirror_gaps.json back with:

  meta.estimate            the headline figure with its range, per year and partner
  corridors[].p_real       share of each flagged corridor's fiscal loss that survives
                           the noise correction (0..1)
  corridors[].signature    now includes "not_in_partner" (Lebanon-only headings) and
                           "structural" fires for one-sided headings on either side

It needs no raw Comtrade files: mirror_hs6.json carries everything the corridor
file was built from (verified: rebuilding with the old partner-only threshold
reproduces all 1,969 shipped corridors to the cent).

Usage:
    python pipeline/estimate.py --gaps data/mirror_gaps.json --hs6 data/mirror_hs6.json
    python pipeline/estimate.py ... --out data/mirror_gaps.json     (write in place)
    python pipeline/estimate.py ... --dry-run                       (print, write nothing)

Why a reflected tail
--------------------
Two customs services classify, time and value the same goods differently, so a
mirror comparison shows gaps in both directions even when nobody cheats.
Under-declaration only ever produces gaps in one direction (Lebanon below the
partner). The mirror image of the under-declaration band — corridors where
Lebanon records MORE than the partner by the same log-distance — contains
noise and over-declaration but no under-declaration, so it says how many
"under-declared" corridors ordinary noise would produce on its own. The share
of a band explained by noise is  n_mirror / n_band  (capped at 1); the
fiscal loss that survives is  band_fiscal × (1 − that share).  Because
over-declaration inflates the noise estimate, the result is conservative.

A 400-draw bootstrap over corridors gives the 90% interval. The "floor" is a
second, cruder correction — net shortfall per partner-year × the effective
VAT-plus-duty rate — and should land in the same region.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_mirror import (  # noqa: E402
    CHAPTERS, CIF_FACTOR, COUNTRY, EXCLUDED_HS4, HUBS, MIN_PARTNER_VALUE, VAT_RATE,
    UNDER_LO, UNDER_HI, OVER_RATIO, classify, is_exempt, structural_share, summarise,
)
from tariff import duty_rate_for, preference  # noqa: E402

FLAGGED = ("under_invoicing", "value_gap")
BANDS = {"under_invoicing": (UNDER_LO, UNDER_HI), "value_gap": (0.0, UNDER_LO)}
BOOTSTRAP_DRAWS = 400
SEED = 7


# --------------------------------------------------------------------------- #
# 1. Symmetric corridor set                                                    #
# --------------------------------------------------------------------------- #

def rebuild_corridors(hs6_rows: list[dict]) -> list[dict]:
    """
    HS-4 corridors from HS-6 lines, keeping a heading when EITHER side reaches
    MIN_PARTNER_VALUE. The shipped build thresholds on the partner side only,
    which drops every Lebanon-only heading before the structural rule can see
    it (Saudi fuel 2710, UAE diamonds 7102) and understates the outflow side.
    """
    agg: dict[tuple, dict] = {}
    for r in hs6_rows:
        k = (r["y"], r["p"], r["hs4"])
        a = agg.setdefault(k, {"x_fob": 0.0, "m": 0.0, "kg": 0.0, "rx": 0.0, "rx_seen": False, "lw": r.get("lw", 0.0)})
        a["x_fob"] += r["x"]; a["m"] += r["m"]; a["kg"] += (r.get("kg") or 0.0)
        if r.get("rx") is not None:
            a["rx"] += r["rx"]; a["rx_seen"] = True

    # Totals per partner-year on the FULL frame, as build_mirror does.
    tot_x: dict[tuple, float] = defaultdict(float)
    tot_m: dict[tuple, float] = defaultdict(float)
    for (y, p, _), a in agg.items():
        tot_x[(y, p)] += a["x_fob"] * CIF_FACTOR; tot_m[(y, p)] += a["m"]

    out = []
    for (y, p, hs4), a in agg.items():
        if hs4 in EXCLUDED_HS4 or hs4.startswith("99"):
            continue
        x_cif = a["x_fob"] * CIF_FACTOR
        if x_cif < MIN_PARTNER_VALUE and a["m"] < MIN_PARTNER_VALUE:
            continue
        m = a["m"]
        gap = x_cif - m
        cover = (m / x_cif) if x_cif else None
        share = structural_share(x_cif, m, tot_x[(y, p)], tot_m[(y, p)])
        if share:
            sig = "structural"
        elif is_exempt(hs4):
            sig = "exempt"
        elif x_cif == 0:
            sig = "not_in_partner"
        else:
            sig = classify(cover)
        hs2 = hs4[:2]
        rate = duty_rate_for(hs4, p)
        shortfall = max(gap, 0.0) if sig in FLAGGED else 0.0
        outflow = max(-gap, 0.0) if sig == "over_invoicing" else 0.0
        out.append({
            "year": y, "partner": p, "partnerName": COUNTRY.get(p, str(p)),
            "hs4": hs4, "hs2": hs2, "chapter": CHAPTERS.get(hs2, f"Chapter {hs2}"), "label": f"HS {hs4}",
            "x_fob": round(a["x_fob"], 2), "x_cif": round(x_cif, 2), "m": round(m, 2),
            "gap": round(gap, 2), "gap_pct": round(100 * gap / x_cif, 1) if x_cif else None,
            "cover": None if cover is None else round(cover, 3),
            "qty_gap_pct": None,
            "partner_kg": round(a["kg"], 1) if a["kg"] else None,
            "rx": round(a["rx"], 2) if a["rx_seen"] else None,
            "m_world": round(a["lw"], 2),
            "absent": bool(x_cif > 0 and a["lw"] < 0.85 * x_cif),
            "share": round(share, 3) if share else None,
            "signature": sig,
            "shortfall": round(shortfall, 2), "outflow": round(outflow, 2),
            "vat_floor": round(shortfall * VAT_RATE, 2), "duty_rate": rate,
            "duty_loss": round(shortfall * rate, 2), "fiscal_loss": round(shortfall * (VAT_RATE + rate), 2),
            "confidence": "medium" if a["x_fob"] > 1e6 else "low",
            "preference": preference(p),
            "hub": p in HUBS,
        })
    return out


def add_persistence(corridors: list[dict]) -> None:
    seen: dict[tuple, set] = defaultdict(set)
    flagged_in: dict[tuple, set] = defaultdict(set)
    for c in corridors:
        k = (c["partner"], c["hs4"])
        seen[k].add(c["year"])
        if c["signature"] in FLAGGED:
            flagged_in[k].add(c["year"])
    for c in corridors:
        k = (c["partner"], c["hs4"])
        c["years_seen"] = len(seen[k]); c["years_flagged"] = len(flagged_in[k])
        c["persistent"] = len(flagged_in[k]) > 1


# --------------------------------------------------------------------------- #
# 2. Reflected-tail estimator                                                  #
# --------------------------------------------------------------------------- #

def _eligible(c: dict) -> bool:
    """Corridors that take part in the noise test: everything with a cover, plus
    Lebanon-only headings (cover = ∞, the mirror of partner-only headings)."""
    return c["signature"] not in ("exempt", "structural")


def _cover(c: dict) -> float:
    return math.inf if c["cover"] is None else c["cover"]


def band_noise_shares(group: list[dict]) -> dict[str, dict]:
    """For one partner-year: per band, how many corridors sit in it, how many in
    its mirror image, and the share explained by noise."""
    res = {}
    elig = [c for c in group if _eligible(c)]
    for band, (lo, hi) in BANDS.items():
        n_band = sum(1 for c in elig if c["signature"] == band)
        mlo, mhi = 1 / hi, (math.inf if lo == 0 else 1 / lo)
        n_mirror = sum(1 for c in elig if mlo < _cover(c) <= mhi)
        p_noise = min(1.0, n_mirror / n_band) if n_band else 0.0
        res[band] = {"n": n_band, "n_mirror": n_mirror, "p_noise": round(p_noise, 3)}
    return res


def estimate(corridors: list[dict], draws: int = BOOTSTRAP_DRAWS, seed: int = SEED) -> dict:
    """Writes p_real on every flagged corridor; returns meta.estimate."""
    rng = np.random.default_rng(seed)
    by_year: dict[int, list[dict]] = defaultdict(list)
    for c in corridors:
        by_year[c["year"]].append(c)

    out_years = {}
    for year, rows in sorted(by_year.items()):
        by_partner: dict[int, list[dict]] = defaultdict(list)
        for c in rows:
            by_partner[c["partner"]].append(c)

        partners = {}
        gross = central = 0.0
        floor = 0.0
        for p, grp in sorted(by_partner.items()):
            shares = band_noise_shares(grp)
            for c in grp:
                if c["signature"] in FLAGGED:
                    c["p_real"] = round(1.0 - shares[c["signature"]]["p_noise"], 3)
            g = sum(c["fiscal_loss"] for c in grp if c["signature"] in FLAGGED)
            e = sum(c["fiscal_loss"] * c["p_real"] for c in grp if c["signature"] in FLAGGED)
            # Floor: net shortfall × effective rate over this partner-year's flagged set.
            elig = [c for c in grp if _eligible(c)]
            pos = sum(max(c["gap"], 0.0) for c in elig); neg = sum(max(-c["gap"], 0.0) for c in elig)
            short = sum(c["shortfall"] for c in grp if c["signature"] in FLAGGED)
            eff = (g / short) if short else 0.0
            f = max(0.0, pos - neg) * eff
            gross += g; central += e; floor += f
            partners[str(p)] = {
                "name": COUNTRY.get(p, str(p)), "gross": round(g, 2), "central": round(e, 2), "floor": round(f, 2),
                "bands": shares,
            }

        # Bootstrap over corridors within the year (partner structure re-derived each draw).
        idx = np.arange(len(rows))
        totals = []
        for _ in range(draws):
            sample = [rows[i] for i in rng.choice(idx, size=len(idx), replace=True)]
            bp: dict[int, list[dict]] = defaultdict(list)
            for c in sample:
                bp[c["partner"]].append(c)
            t = 0.0
            for grp in bp.values():
                shares = band_noise_shares(grp)
                t += sum(c["fiscal_loss"] * (1.0 - shares[c["signature"]]["p_noise"])
                         for c in grp if c["signature"] in FLAGGED)
            totals.append(t)
        lo, hi = np.percentile(totals, [5, 95])

        out_years[str(year)] = {
            "gross": round(gross, 2), "central": round(central, 2),
            "lo": round(float(lo), 2), "hi": round(float(hi), 2), "floor": round(floor, 2),
            "flagged": sum(1 for c in rows if c["signature"] in FLAGGED),
            "partners": partners,
        }

    return {
        "method": "reflected_tail",
        "note": (
            "Noise between two customs services is symmetric in log(cover); under-declaration is not. "
            "For each partner-year and band, the corridors in the band's mirror image (cover in (1/hi, 1/lo]) "
            "count how many the noise alone would produce; the share explained by noise is n_mirror/n_band, "
            "and p_real = 1 - that share is applied to each corridor's fiscal loss. 'central' is the sum; "
            "'lo'/'hi' are a 90% bootstrap interval over corridors; 'floor' is net shortfall x effective rate; "
            "'gross' is the uncorrected sum. Over-declaration inflates the noise estimate, so 'central' is conservative."
        ),
        "bands": {k: list(v) for k, v in BANDS.items()},
        "bootstrap_draws": draws,
        "computed": date.today().isoformat(),
        "years": out_years,
    }


# --------------------------------------------------------------------------- #
# 3. Decomposition — what the gap is not, before a dollar is called lost      #
# --------------------------------------------------------------------------- #
#
# The first objection a customs economist raises is that the mirror gap is
# transit, partner over-reporting and reclassification, not evasion. The
# answer is to take the gap apart on screen and put the revenue claim only on
# what is left. Each step is one number a reader can click into. The steps
# the data in hand can settle are computed here; the ones that need Customs'
# own records are listed as pending, with what each needs.

TARIFF_SHIFT_LIMIT = 60
DECOMPOSITION_KEYS = (
    "raw", "set_aside", "normal", "flagged_gross", "chapter_netting", "after_chapter",
    "tariff_shift_duty", "attributable", "short_flagged", "short_offset", "short_after",
    "same_rate_offset", "tariff_shift_count",
)

PENDING = [
    {"key": "partner_bias", "label": "Partner reporting bias",
     "why": "China's export-VAT rebate rewards a higher declared export value, so part of the gap is the "
            "partner's reporting, not Lebanon's. A gap Lebanon shares with Germany or Japan on the same "
            "heading is not a Lebanese loss.",
     "needs": "Cover ratios for the same partner headings into control importers with strong customs "
              "(Germany, Netherlands, Japan, Korea, Australia, Canada): six more Comtrade reporter pulls per partner."},
    {"key": "transit", "label": "Transit to Syria and beyond",
     "why": "China books Syria-bound cargo landed at Beirut or Tripoli as an export to Lebanon; Lebanon "
            "records a transit, not an import. It shows as goods missing, never as low prices — the same "
            "shape as smuggling.",
     "needs": "Lebanese Customs transit and re-export statistics by chapter; Port of Beirut and Tripoli "
              "monthly container series; China's exports to Syria as the dynamic test as direct routes reopen."},
    {"key": "quantity", "label": "Under-valuation versus missing goods",
     "why": "A declaration at 40% of value with the weight intact is under-pricing; the same 40% with the "
            "weight missing is goods that never cleared. Comtrade carries no genuine Lebanese weights, so "
            "the two cannot be told apart here.",
     "needs": "Lebanese Customs' own statistics with value and net weight by HS-8 and origin, or NAJM "
              "declaration extracts."},
    {"key": "timing", "label": "Timing and the customs dollar",
     "why": "A December shipment clears in January and shows as a gap in both years. Before 2023 duty was "
            "assessed at 1,507.5 LBP to the dollar, so a dollar of gap then was worth a fraction of a "
            "dollar of gap now.",
     "needs": "2019–2024 bulk files for three-year centred averages, and the customs exchange rate by year."},
]


def _pot(c: dict) -> float:
    """Fiscal exposure if a corridor's whole positive gap were lost — before any exclusion."""
    return max(c["gap"], 0.0) * (VAT_RATE + c["duty_rate"])


def _waterfall(group: list[dict]) -> tuple[dict, list[dict]]:
    """One partner-year: the steps, and the heading pairs behind the chapter netting."""
    raw = sum(_pot(c) for c in group)
    set_aside = sum(_pot(c) for c in group if c["signature"] in ("exempt", "structural"))
    normal = sum(_pot(c) for c in group if c["signature"] == "normal")
    flagged = sum(c["fiscal_loss"] for c in group if c["signature"] in FLAGGED)

    chapters: dict[str, list[dict]] = defaultdict(list)
    for c in group:
        if c["signature"] not in ("exempt", "structural"):
            chapters[c["hs2"]].append(c)

    after = 0.0
    short_flagged = short_offset = 0.0
    same_rate = 0.0
    pairs: list[dict] = []
    for hs2, cs in sorted(chapters.items()):
        under = sorted((c for c in cs if c["signature"] in FLAGGED), key=lambda c: -c["shortfall"])
        if not under:
            continue
        u_short = sum(c["shortfall"] for c in under)
        # The other side of the same chapter: headings that read "Lebanon declares
        # more" (cover 160% and above) or that the partner never reports at all.
        # Surpluses inside ordinary asymmetry are noise, and the reflected tail
        # already corrects for noise; netting against them would count it twice.
        over = sorted((c for c in cs if c["signature"] in ("over_invoicing", "not_in_partner") and c["m"] > c["x_cif"]),
                      key=lambda c: -(c["m"] - c["x_cif"]))
        surplus = sum(c["m"] - c["x_cif"] for c in over)
        offset = min(u_short, surplus)
        residual = u_short - offset
        rate = sum(c["shortfall"] * c["duty_rate"] for c in under) / u_short
        after += residual * (VAT_RATE + rate)
        short_flagged += u_short
        short_offset += offset

        # Which headings offset which: greedy, largest against largest, until the
        # offset is spent. A pair on the same duty rate cancels to nothing; a pair
        # where goods moved to a cheaper heading leaves the duty difference.
        i = j = 0
        ru = under[0]["shortfall"]
        ro = (over[0]["m"] - over[0]["x_cif"]) if over else 0.0
        left = offset
        while left > 1.0 and i < len(under) and j < len(over):
            a = min(ru, ro, left)
            du, do = under[i]["duty_rate"], over[j]["duty_rate"]
            if abs(du - do) < 1e-9:
                same_rate += a
            else:
                pairs.append({
                    "hs2": hs2, "chapter": CHAPTERS.get(hs2, f"Chapter {hs2}"),
                    "under_hs4": under[i]["hs4"], "over_hs4": over[j]["hs4"],
                    "amount": round(a, 2), "rate_under": du, "rate_over": do,
                    "duty_at_stake": round(max(0.0, a * (du - do)), 2),
                })
            ru -= a; ro -= a; left -= a
            if ru <= 1e-6:
                i += 1
                ru = under[i]["shortfall"] if i < len(under) else 0.0
            if ro <= 1e-6:
                j += 1
                ro = (over[j]["m"] - over[j]["x_cif"]) if j < len(over) else 0.0

    tariff_duty = sum(x["duty_at_stake"] for x in pairs)
    steps = {
        "raw": round(raw, 2), "set_aside": round(set_aside, 2), "normal": round(normal, 2),
        "flagged_gross": round(flagged, 2),
        "chapter_netting": round(flagged - after, 2), "after_chapter": round(after, 2),
        "tariff_shift_duty": round(tariff_duty, 2), "attributable": round(after + tariff_duty, 2),
        "short_flagged": round(short_flagged, 2), "short_offset": round(short_offset, 2),
        "short_after": round(short_flagged - short_offset, 2),
        "same_rate_offset": round(same_rate, 2), "tariff_shift_count": len(pairs),
    }
    return steps, pairs


def decompose(corridors: list[dict]) -> dict:
    """The waterfall per year and partner; writes meta.decomposition."""
    by_year: dict[int, list[dict]] = defaultdict(list)
    for c in corridors:
        by_year[c["year"]].append(c)
    years = {}
    for year, rows in sorted(by_year.items()):
        by_partner: dict[int, list[dict]] = defaultdict(list)
        for c in rows:
            by_partner[c["partner"]].append(c)
        totals = {k: 0.0 for k in DECOMPOSITION_KEYS}
        partners = {}
        shifts = []
        for p, grp in sorted(by_partner.items()):
            steps, pairs = _waterfall(grp)
            partners[str(p)] = {"name": COUNTRY.get(p, str(p)), **steps}
            for k in DECOMPOSITION_KEYS:
                totals[k] += steps[k]
            shifts.extend({"partner": p, "partnerName": COUNTRY.get(p, str(p)), **x} for x in pairs)
        shifts.sort(key=lambda x: (-x["duty_at_stake"], -x["amount"]))
        years[str(year)] = {
            **{k: round(v, 2) for k, v in totals.items()},
            "tariff_shift_count": int(totals["tariff_shift_count"]),
            "partners": partners,
            "tariff_shift": shifts[:TARIFF_SHIFT_LIMIT],
        }
    return {
        "method": "waterfall",
        "note": (
            "Every positive HS-4 gap, in VAT-and-duty terms, is taken apart step by step: exempt and one-sided "
            "headings are set aside; corridors within ordinary asymmetry (85-160% cover) are left out; what remains "
            "is the flagged gross. Within each HS-2 chapter the flagged shortfall is then offset by what Lebanon "
            "books above the partner on the chapter's headings that read 'Lebanon declares more' or that the "
            "partner never reports (reclassification; surpluses inside ordinary asymmetry are left to the "
            "reflected tail, so noise is not counted twice), and the duty difference "
            "on pairs that moved to a cheaper heading is added back. What is left is customs-attributable by the "
            "current method - before partner reporting bias, transit and timing, which need Customs' own data and "
            "are listed as pending. Duty rates are chapter bands until the HS-6 tariff table is loaded, so every "
            "pair inside a chapter carries the same rate today and duty_at_stake is zero; the pairs are still the "
            "classification audit list. The reflected-tail figure in meta.estimate is a second, independent "
            "reading of the same flagged gross."
        ),
        "pending": PENDING,
        "computed": date.today().isoformat(),
        "years": years,
    }


def _merge_decomposition(est: dict, dec: dict) -> None:
    """Put the waterfall beside the reflected tail, so one object carries both methods."""
    for y, yv in dec["years"].items():
        ey = est["years"].get(y)
        if not ey:
            continue
        for k in DECOMPOSITION_KEYS:
            ey[k] = yv[k]
        for p, pv in yv["partners"].items():
            if p in ey["partners"]:
                for k in DECOMPOSITION_KEYS:
                    ey["partners"][p][k] = pv[k]


# --------------------------------------------------------------------------- #
# 4. Glue                                                                      #
# --------------------------------------------------------------------------- #

def _summarise(rows: list[dict]) -> dict:
    s = summarise(rows)
    s["not_in_partner"] = {"count": sum(1 for c in rows if c["signature"] == "not_in_partner")}
    return s


def run(gaps: dict, hs6: dict) -> dict:
    corridors = rebuild_corridors(hs6["rows"])
    add_persistence(corridors)
    years = sorted({c["year"] for c in corridors})
    comparable = {p["code"] for p in gaps["meta"].get("comparable_partners", [])}

    per_year = {}
    for y in years:
        rows = [c for c in corridors if c["year"] == y]
        per_year[str(y)] = _summarise(rows)
        per_year[str(y)]["partners"] = gaps["years"].get(str(y), {}).get("partners", [])
        per_year[str(y)]["comparable"] = _summarise([c for c in rows if c["partner"] in comparable])

    est = estimate(corridors)
    dec = decompose(corridors)
    _merge_decomposition(est, dec)
    corridors.sort(key=lambda c: (-c["year"], -abs(c["gap"])))

    meta = dict(gaps["meta"])
    meta["estimate"] = est
    meta["decomposition"] = dec
    meta["signatures"] = {**meta.get("signatures", {}), "not_in_partner": "Only in Lebanon's books"}
    meta["signatures"].pop("smuggling_risk", None)
    meta["corridor_rule"] = (
        f"A heading is a corridor when either side reaches ${MIN_PARTNER_VALUE:,.0f} (CIF); "
        "Lebanon-only headings read not_in_partner and carry no shortfall."
    )
    meta["postprocessed"] = date.today().isoformat()
    return {"meta": meta, "years": per_year, "corridors": corridors}


def report(payload: dict) -> None:
    est = payload["meta"]["estimate"]["years"]
    for y, v in est.items():
        print(f"{y}: gross ${v['gross']/1e6:6.1f}M  central ${v['central']/1e6:6.1f}M  "
              f"[{v['lo']/1e6:.0f}–{v['hi']/1e6:.0f}M]  floor ${v['floor']/1e6:.1f}M  flagged {v['flagged']}")
        for p, s in v["partners"].items():
            b = s["bands"]
            print(f"     {s['name']:14s} gross {s['gross']/1e6:6.1f}M -> central {s['central']/1e6:6.1f}M   "
                  f"under {b['under_invoicing']['n']:>3}/{b['under_invoicing']['n_mirror']:<3} "
                  f"value_gap {b['value_gap']['n']:>3}/{b['value_gap']['n_mirror']:<3}")
    ys = payload["years"]
    for y, v in ys.items():
        print(f"{y}: corridors {v['corridors']}  structural {v['structural']['count']}  "
              f"not_in_partner {v['not_in_partner']['count']}  fiscal ${v['fiscal_loss']/1e6:.1f}M")
    dec = payload["meta"]["decomposition"]["years"]
    for y, v in dec.items():
        print(f"{y}: waterfall  before adjustment ${v['raw']/1e6:.1f}M  - set aside ${v['set_aside']/1e6:.1f}M  "
              f"- ordinary asymmetry ${v['normal']/1e6:.1f}M  = flagged ${v['flagged_gross']/1e6:.1f}M  "
              f"- reclassification ${v['chapter_netting']/1e6:.1f}M  + tariff shift ${v['tariff_shift_duty']/1e6:.1f}M  "
              f"= attributable ${v['attributable']/1e6:.1f}M   ({v['tariff_shift_count']} pairs with a rate difference)")
        for p, s in v["partners"].items():
            share = s["short_offset"] / s["short_flagged"] if s["short_flagged"] else 0.0
            print(f"     {s['name']:14s} shortfall ${s['short_flagged']/1e6:6.1f}M, offset within chapter "
                  f"${s['short_offset']/1e6:6.1f}M ({share:.0%}) -> attributable ${s['attributable']/1e6:6.1f}M")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gaps", type=Path, default=Path("data/mirror_gaps.json"))
    ap.add_argument("--hs6", type=Path, default=Path("data/mirror_hs6.json"))
    ap.add_argument("--out", type=Path, default=None, help="defaults to --gaps (in place)")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    gaps = json.loads(args.gaps.read_text())
    hs6 = json.loads(args.hs6.read_text())
    payload = run(gaps, hs6)
    report(payload)
    if args.dry_run:
        return
    out = args.out or args.gaps
    out.write_text(json.dumps(payload, indent=1))
    print(f"-> {out}")


if __name__ == "__main__":
    main()
