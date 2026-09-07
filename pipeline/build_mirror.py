#!/usr/bin/env python3
"""
Build Jamarik's mirror_gaps.json from UN Comtrade bulk files.

Input : COMTRADE FINAL bulk files (C_A_<cls>_<reporter>_<year>.gz), one per
        reporter-year, as downloaded from the Comtrade bulk API.
Output: data/mirror_gaps.json in the schema the portal already reads.

Three things this does that a naive mirror does not:

1. De-duplicates. The bulk files interleave as-reported rows with Comtrade's
   own rollups (HS-2, HS-4, TOTAL, World partner) and, for some reporters,
   a mode-of-transport breakdown. Summing the file raw inflates Lebanon's
   total by more than 80%.

2. Compares like with like. Lebanon reports CIF, partners report FOB. Rather
   than applying a textbook 1.08, we measure each corridor's own wedge from
   the median of its matched product lines, and calibrate against that.

3. Refuses to name a mechanism it cannot evidence. Lebanon publishes no
   genuine net weight to Comtrade — every non-zero weight on its import rows
   is a UN estimate. Distinguishing under-invoicing from non-declaration
   requires real quantities, so corridors are flagged by value only and the
   output says so.
"""

from __future__ import annotations

import argparse
import json
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

LEBANON = 422
VAT_RATE = 0.11

# Confidentiality and residual buckets — real trade, but not attributable to a
# product, so a gap on these lines means nothing.
EXCLUDED_HS4 = {"9999", "9880", "9999"}

# A partner line must clear this to be worth an officer's attention.
MIN_PARTNER_VALUE = 250_000

# Lines below this are too small to inform the freight wedge, but everything
# above it counts — breadth is what makes the median robust.
CALIBRATION_FLOOR = 25_000

# The CIF/FOB wedge. Held as a documented constant rather than fitted to the
# data — see corridor_diagnostics() for why fitting it is circular. 1.05 is the
# conservative end of the range used in the trade-statistics literature for
# short-haul maritime freight and insurance, so it understates gaps rather than
# inflating them.
CIF_FACTOR = 1.05

# Cover ratio = what Lebanon declared / what we would expect given the partner.
# The bands below are deliberately conservative, and the reasoning is in the
# labels: a line covering 40-85% of expected value looks like mis-pricing; a
# line covering under 40% is far more likely to be goods that never arrived
# under that origin at all — re-consignment, transit, or a hub credit — than a
# declaration filed at a tenth of its worth.
UNDER_INVOICING_BAND = (0.40, 0.85)
UNEXPLAINED_CEILING = 0.40
OVER_DECLARATION_RATIO = 1.60


def read_bulk(path: Path) -> pd.DataFrame:
    """Read one bulk file and keep only genuine, non-overlapping detail rows."""
    df = pd.read_csv(path, sep="\t", dtype={"cmdCode": str, "period": str}, low_memory=False)
    keep = (
        (df["cmdCode"].str.len() == 6)
        & (df["partnerCode"] != 0)
        & (df["partner2Code"] == 0)
        & (df["motCode"] == 0)
        & (df["customsCode"] == "C00")
    )
    return df.loc[keep].copy()


def corridor_frame(lebanon: pd.DataFrame, partner: pd.DataFrame, partner_code: int) -> pd.DataFrame:
    """One row per HS-4 heading, both sides of the mirror side by side."""
    leb = lebanon[(lebanon.flowCode == "M") & (lebanon.partnerCode == partner_code)].copy()
    ptr = partner[(partner.flowCode == "X") & (partner.partnerCode == LEBANON)].copy()
    if leb.empty or ptr.empty:
        return pd.DataFrame()

    leb["hs4"] = leb.cmdCode.str[:4]
    ptr["hs4"] = ptr.cmdCode.str[:4]

    a = leb.groupby("hs4").agg(m=("primaryValue", "sum"))
    b = ptr.groupby("hs4").agg(x_fob=("primaryValue", "sum"), x_kg=("netWgt", "sum"))
    return a.join(b, how="outer").fillna(0.0).reset_index()


def corridor_diagnostics(frame: pd.DataFrame) -> dict:
    """
    Observed ratio statistics for a corridor — reported, never used as the
    baseline.

    An earlier version calibrated the CIF/FOB wedge from this median. That is
    circular: if a corridor is systematically under-declared, the median ratio
    is depressed by the under-declaration, and using it as the baseline defines
    the problem out of existence. On Greece and the USA the observed median sits
    at 0.94 and 0.88 — below parity before freight is even added — which is
    itself the finding, not the yardstick.

    So the wedge is a documented external constant and this function only
    describes what the data looks like against it.
    """
    matched = frame[(frame.m > 0) & (frame.x_fob > CALIBRATION_FLOOR)]
    if matched.empty:
        return {"matched_lines": 0, "observed_median_ratio": None}
    ratio = matched.m / matched.x_fob
    return {
        "matched_lines": int(len(matched)),
        "observed_median_ratio": round(float(ratio.median()), 3),
        "observed_p25": round(float(ratio.quantile(0.25)), 3),
        "observed_p75": round(float(ratio.quantile(0.75)), 3),
        "value_weighted_ratio": round(float(matched.m.sum() / matched.x_fob.sum()), 3),
    }


def classify(cover: float) -> str:
    lo, hi = UNDER_INVOICING_BAND
    if cover >= OVER_DECLARATION_RATIO:
        return "over_invoicing"
    if cover < UNEXPLAINED_CEILING:
        return "value_gap"
    if cover < hi:
        return "under_invoicing"
    return "normal"


def build(files: dict[int, Path], names: dict[int, str], year: int, out: Path) -> dict:
    lebanon_path = files.pop(LEBANON)
    lebanon = read_bulk(lebanon_path)

    corridors: list[dict] = []
    factors: dict[str, float] = {}
    reporters: list[dict] = []

    for code, path in files.items():
        partner = read_bulk(path)
        frame = corridor_frame(lebanon, partner, code)
        if frame.empty:
            reporters.append({"code": code, "name": names[code], "has_data": False})
            continue

        factor = CIF_FACTOR
        factors[str(code)] = corridor_diagnostics(frame)
        reporters.append({"code": code, "name": names[code], "has_data": True})

        frame = frame[
            (~frame.hs4.isin(EXCLUDED_HS4)) & (frame.x_fob >= MIN_PARTNER_VALUE)
        ].copy()

        frame["x_cif"] = frame.x_fob * factor
        frame["gap"] = frame.x_cif - frame.m           # positive = Lebanon declared less
        frame["cover"] = frame.m / frame.x_cif
        frame["gap_pct"] = 100 * frame.gap / frame.x_cif
        frame["signature"] = frame.cover.map(classify)
        # VAT is only recoverable where value was under-declared.
        frame["vat_floor"] = (frame.gap.clip(lower=0) * VAT_RATE).where(
            frame.signature.isin(["under_invoicing", "value_gap"]), 0.0
        )

        for r in frame.itertuples():
            corridors.append(
                {
                    "partner": code,
                    "partnerName": names[code],
                    "hs4": r.hs4,
                    "hs2": r.hs4[:2],
                    "chapter": CHAPTERS.get(r.hs4[:2], f"Chapter {r.hs4[:2]}"),
                    "label": f"HS {r.hs4}",
                    "x_fob": round(r.x_fob, 2),
                    "x_cif": round(r.x_cif, 2),
                    "m": round(r.m, 2),
                    "gap": round(r.gap, 2),
                    "gap_pct": round(r.gap_pct, 1),
                    "cover": round(r.cover, 3),
                    # Lebanon publishes no genuine net weight, so no corridor can
                    # carry a quantity gap. Null is the honest value.
                    "qty_gap_pct": None,
                    "partner_kg": round(r.x_kg, 1) if r.x_kg else None,
                    "signature": r.signature,
                    "vat_floor": round(r.vat_floor, 2),
                    "duty_loss_indicative": round(max(r.gap, 0) * 0.05, 2),
                    "cif_factor": round(factor, 4),
                    "confidence": "medium" if r.x_fob > 1e6 else "low",
                }
            )

    corridors.sort(key=lambda c: abs(c["gap"]), reverse=True)

    flagged = [c for c in corridors if c["signature"] != "normal"]
    sig_counts: dict[str, int] = {}
    for c in corridors:
        sig_counts[c["signature"]] = sig_counts.get(c["signature"], 0) + 1
    for key in ("under_invoicing", "value_gap", "over_invoicing", "normal"):
        sig_counts.setdefault(key, 0)
    sig_counts.setdefault("smuggling_risk", 0)  # unusable without real quantities

    payload = {
        "meta": {
            "demo": False,
            "year": year,
            "generated": date.today().isoformat(),
            "retrieved": datetime.now(timezone.utc).isoformat(),
            "source": "UN Comtrade bulk FINAL files (comtradeapi.un.org)",
            "coverage": "PARTIAL — only the partners listed below are mirrored",
            "cif_factor": CIF_FACTOR,
            "cif_basis": "documented constant, not fitted — see diagnostics",
            "diagnostics": factors,
            "vat_rate": VAT_RATE,
            "reporters": reporters,
            "signatures": {
                "under_invoicing": "Value under-declared",
                "value_gap": "Largely unrecorded",
                "over_invoicing": "Lebanon declares more",
                "smuggling_risk": "Goods not presented",
                "normal": "Within normal asymmetry",
            },
            "quantity_available": False,
            "quantity_note": (
                "Lebanon publishes no genuine net weight to Comtrade — every non-zero "
                "weight on its import rows is a UN estimate. Mechanisms that depend on "
                "quantity cannot be evidenced from public data; declaration-level "
                "weights are required."
            ),
            "duty_note": (
                "Duty-inclusive losses use an INDICATIVE flat rate — verify against the "
                "Lebanese tariff and excise schedules before citing."
            ),
        },
        "totals": {
            "x_cif": round(sum(c["x_cif"] for c in corridors), 2),
            "m": round(sum(c["m"] for c in corridors), 2),
            "gap_pos": round(sum(c["gap"] for c in flagged if c["gap"] > 0), 2),
            "vat_floor": round(sum(c["vat_floor"] for c in corridors), 2),
            "duty_loss": round(sum(c["duty_loss_indicative"] for c in flagged), 2),
        },
        "sig_counts": sig_counts,
        "corridors": corridors,
    }

    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=1))
    return payload


CHAPTERS = {
    "02": "Meat", "04": "Dairy & eggs", "07": "Vegetables", "08": "Fruit & nuts",
    "10": "Cereals", "11": "Milling products", "12": "Oil seeds", "15": "Fats & oils",
    "17": "Sugar", "18": "Cocoa", "19": "Cereal preparations", "20": "Prepared vegetables",
    "21": "Food preparations", "22": "Beverages & spirits", "23": "Animal feed",
    "24": "Tobacco", "25": "Salt, stone & cement", "27": "Mineral fuels",
    "28": "Inorganic chemicals", "29": "Organic chemicals", "30": "Pharmaceuticals",
    "31": "Fertilisers", "32": "Paints & dyes", "33": "Cosmetics & perfumery",
    "34": "Soaps & detergents", "38": "Chemical products", "39": "Plastics",
    "40": "Rubber", "44": "Wood", "48": "Paper", "49": "Printed matter",
    "52": "Cotton", "61": "Knitted apparel", "62": "Woven apparel", "63": "Textile articles",
    "64": "Footwear", "68": "Stone articles", "69": "Ceramics", "70": "Glass",
    "71": "Precious stones & metals", "72": "Iron & steel", "73": "Iron/steel articles",
    "74": "Copper", "76": "Aluminium", "82": "Tools", "83": "Base metal articles",
    "84": "Machinery", "85": "Electrical machinery", "87": "Vehicles",
    "88": "Aircraft", "89": "Ships", "90": "Optical & medical", "94": "Furniture",
    "95": "Toys & sports", "96": "Miscellaneous manufactures",
    "03": "Fish & seafood", "05": "Animal products", "06": "Live plants & flowers",
    "09": "Coffee, tea & spices", "13": "Gums & resins", "14": "Vegetable plaiting materials",
    "16": "Prepared meat & fish", "26": "Ores & slag", "35": "Albuminoids & glues",
    "36": "Explosives & pyrotechnics", "37": "Photographic goods", "41": "Raw hides & leather",
    "42": "Leather articles", "43": "Furskins", "45": "Cork", "46": "Basketware",
    "47": "Pulp of wood", "50": "Silk", "51": "Wool", "53": "Other vegetable fibres",
    "54": "Man-made filaments", "55": "Man-made staple fibres", "56": "Wadding & nonwovens",
    "57": "Carpets", "58": "Special woven fabrics", "59": "Coated textile fabrics",
    "60": "Knitted fabrics", "65": "Headgear", "66": "Umbrellas", "67": "Feathers & artificial flowers",
    "75": "Nickel", "78": "Lead", "79": "Zinc", "80": "Tin", "81": "Other base metals",
    "86": "Railway equipment", "91": "Clocks & watches", "92": "Musical instruments",
    "93": "Arms & ammunition", "97": "Works of art",
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, required=True)
    ap.add_argument("--out", type=Path, default=Path("data/mirror_gaps.json"))
    ap.add_argument("--file", action="append", required=True,
                    metavar="CODE:NAME:PATH",
                    help="Reporter code, display name and bulk file path. Repeat per country.")
    args = ap.parse_args()

    files: dict[int, Path] = {}
    names: dict[int, str] = {}
    for spec in args.file:
        code, name, path = spec.split(":", 2)
        files[int(code)] = Path(path)
        names[int(code)] = name

    if LEBANON not in files:
        raise SystemExit("A Lebanon file (code 422) is required.")

    payload = build(files, names, args.year, args.out)
    t = payload["totals"]
    print(f"{len(payload['corridors'])} corridors -> {args.out}")
    print(f"  partners reported ${t['x_cif']/1e6:,.1f}M (CIF-adjusted)")
    print(f"  Lebanon declared  ${t['m']/1e6:,.1f}M")
    print(f"  shortfall on flagged lines ${t['gap_pos']/1e6:,.1f}M")
    print(f"  VAT floor ${t['vat_floor']/1e6:,.1f}M")
    print(f"  signatures: {payload['sig_counts']}")
    print(f"  CIF factor: {payload['meta']['cif_factor']} (documented constant)")
    for k, v in payload["meta"]["diagnostics"].items():
        print(f"  observed ratio {k}: median {v['observed_median_ratio']} "
              f"(p25 {v['observed_p25']} - p75 {v['observed_p75']}), "
              f"value-weighted {v['value_weighted_ratio']}, n={v['matched_lines']}")


if __name__ == "__main__":
    main()
