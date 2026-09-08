#!/usr/bin/env python3
"""
Jamarik data build — multi-year, three loss types, VAT and duty.

Reads UN Comtrade bulk files (one per reporter-year) and produces
data/mirror_gaps.json: every partner x HS-4 corridor, for every year available,
with the fiscal loss split into the three things it can actually be.

The split is the point. A corridor where Lebanon declared 60% of what the
partner shipped and one where it declared 4% carry similar VAT arithmetic and
mean entirely different things. Summing them hands a minister a number that
falls apart under the first challenge.

  under_invoicing  cover 0.40-0.85   goods arrived, price short   -> VAT + duty uncollected
  value_gap        cover < 0.40      barely recorded at all       -> verify origin first
  over_invoicing   cover > 1.60      Lebanon records more         -> not customs revenue;
                                                                     a capital-outflow signal
  normal           everything else   ordinary asymmetry           -> not flagged

Usage:
  python pipeline/build_mirror.py --dir "collected data" \
      --out data/mirror_gaps.json --hs6-out data/mirror_hs6.json

Input files may be plain .csv, .gz or .zip, named either the Comtrade way
(C_A_H6_842_2024.gz) or by hand (USA_842_H6_2023.csv); duplicate downloads of
the same reporter-year are collapsed.

Lebanon reports in HS 2017 and every partner in HS 2022. Before any pairing,
partner codes are converted to HS 2017 with the official UNSD correlation
table (pipeline/hs/HS2022toHS2017.xlsx), so the two sides are compared on
the same code. Nothing is paired by prefix or by guesswork; a code the
table cannot place stays one-sided and is labelled as such.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path

import pandas as pd

LEBANON = 422
VAT_RATE = 0.11
CIF_FACTOR = 1.05          # documented constant — see note in meta
MIN_PARTNER_VALUE = 250_000
EXCLUDED_HS4 = {"9999", "9880"}

# Goods that enter under an exemption regime rather than as a commercial import:
# military equipment (US FMF deliveries to the armed forces) and aircraft with
# their parts (international-transport exemptions). The partner reports the
# export; Lebanese customs books no VAT on the entry. A gap here is real but
# it is not revenue, so it is read as "exempt" and carries no VAT or duty.
EXEMPT_HS = ("8710", "8802", "8803", "8805", "8806", "8906", "93")


def is_exempt(code: str) -> bool:
    return code.startswith(EXEMPT_HS)


# Extraordinary one-sided headings. A heading that is at least this share of
# the side it appears on, while the other side holds almost none of it, is a
# reporting-practice question rather than a customs gap: Saudi Arabia books
# every barrel of fuel to "Areas, not elsewhere specified", so Lebanon's $670M
# of Saudi fuel has no partner figure at all. Such a heading would dominate
# every total for that corridor, so it is set aside from all of them and shown
# on its own.
STRUCTURAL_SHARE = 0.30
ONE_SIDED = 0.05


def structural_share(x: float, m: float, total_x: float, total_m: float):
    if m > 0 and x < ONE_SIDED * m and total_m and m >= STRUCTURAL_SHARE * total_m:
        return m / total_m
    if x > 0 and m < ONE_SIDED * x and total_x and x >= STRUCTURAL_SHARE * total_x:
        return x / total_x
    return None

UNDER_LO, UNDER_HI = 0.40, 0.85
OVER_RATIO = 1.60

# Indicative duty rates by HS chapter. Lebanon's applied tariff is mostly 0-5%
# with higher bands on finished consumer goods and vehicles. These are ORDER OF
# MAGNITUDE ONLY and are labelled as such everywhere they surface — the real
# schedule carries excise, exemptions and free-trade preferences this cannot see.
DUTY_BANDS = {
    "default": 0.05,
    0.00: ["10", "27", "29", "30", "31", "47", "72", "84", "85", "90"],   # inputs, fuel, pharma, machinery
    0.10: ["17", "19", "20", "21", "32", "33", "34", "39", "48", "69", "70", "73", "76", "83", "94", "96"],
    0.20: ["22", "42", "61", "62", "63", "64", "65", "66", "87", "91", "95"],  # finished consumer goods
    0.35: ["24"],                                                          # tobacco, before excise
}


def duty_rate(hs2: str) -> float:
    for rate, chapters in DUTY_BANDS.items():
        if rate != "default" and hs2 in chapters:
            return rate
    return DUTY_BANDS["default"]


CHAPTERS = {
    "01": "Live animals", "02": "Meat", "03": "Fish & seafood", "04": "Dairy & eggs",
    "05": "Animal products", "06": "Live plants & flowers", "07": "Vegetables",
    "08": "Fruit & nuts", "09": "Coffee, tea & spices", "10": "Cereals",
    "11": "Milling products", "12": "Oil seeds", "13": "Gums & resins",
    "14": "Vegetable plaiting", "15": "Fats & oils", "16": "Prepared meat & fish",
    "17": "Sugar", "18": "Cocoa", "19": "Cereal preparations", "20": "Prepared vegetables",
    "21": "Food preparations", "22": "Beverages & spirits", "23": "Animal feed",
    "24": "Tobacco", "25": "Salt, stone & cement", "26": "Ores & slag",
    "27": "Mineral fuels", "28": "Inorganic chemicals", "29": "Organic chemicals",
    "30": "Pharmaceuticals", "31": "Fertilisers", "32": "Paints & dyes",
    "33": "Cosmetics & perfumery", "34": "Soaps & detergents", "35": "Albuminoids",
    "36": "Explosives", "37": "Photographic goods", "38": "Chemical products",
    "39": "Plastics", "40": "Rubber", "41": "Raw hides", "42": "Leather articles",
    "43": "Furskins", "44": "Wood", "45": "Cork", "46": "Basketware", "47": "Wood pulp",
    "48": "Paper", "49": "Printed matter", "50": "Silk", "51": "Wool",
    "52": "Cotton", "53": "Other vegetable fibres", "54": "Man-made filaments",
    "55": "Man-made staple fibres", "56": "Wadding & nonwovens", "57": "Carpets",
    "58": "Special woven fabrics", "59": "Coated fabrics", "60": "Knitted fabrics",
    "61": "Knitted apparel", "62": "Woven apparel", "63": "Textile articles",
    "64": "Footwear", "65": "Headgear", "66": "Umbrellas", "67": "Artificial flowers",
    "68": "Stone articles", "69": "Ceramics", "70": "Glass", "71": "Precious stones",
    "72": "Iron & steel", "73": "Iron/steel articles", "74": "Copper", "75": "Nickel",
    "76": "Aluminium", "78": "Lead", "79": "Zinc", "80": "Tin", "81": "Other base metals",
    "82": "Tools", "83": "Base metal articles", "84": "Machinery",
    "85": "Electrical machinery", "86": "Railway equipment", "87": "Vehicles",
    "88": "Aircraft", "89": "Ships", "90": "Optical & medical", "91": "Clocks & watches",
    "92": "Musical instruments", "93": "Arms & ammunition", "94": "Furniture & lighting",
    "95": "Toys & sports", "96": "Misc manufactures", "97": "Works of art",
}

HUBS = {784, 344, 792}  # re-export hubs: their "exports" to Lebanon are largely
                       # goods of other origin, so a gap there reads differently

COUNTRY = {
    156: "China", 300: "Greece", 380: "Italy", 422: "Lebanon",
    682: "Saudi Arabia", 784: "UAE", 842: "United States",
}


# --------------------------------------------------------------------------- #

# --------------------------------------------------------------------------- #
# HS edition concordance                                                       #
# --------------------------------------------------------------------------- #

HS_TABLE = Path(__file__).resolve().parent / "hs" / "HS2022toHS2017.xlsx"

# "year:partner" -> export basis, filled in main() and written into the HS-6 meta.
EXPORT_BASIS: dict[str, str] = {}

# Mapping kinds, worst first. A merged HS-2017 line inherits the worst kind of
# the HS-2022 codes that fed it.
MAP_RANK = {"unmapped": 0, "split": 1, "merged": 2, "recoded": 3, "same": 4}


class Concordance:
    """
    HS 2022 -> HS 2017, from the UNSD tables.

    The Conversions sheet gives one HS-2017 target for every HS-2022 code —
    the same rule Comtrade applies when it republishes data in another
    edition. The Correlations sheet lists every relationship, which is what
    tells us whether that single target was the only possibility ("same",
    "recoded"), one of several codes pooled into it ("merged"), or a code
    whose value could legitimately sit under more than one HS-2017 code
    ("split"). Split lines are still converted, but they are marked so a
    reader knows the pairing rests on a convention.
    """

    def __init__(self, path: Path = HS_TABLE):
        conv = pd.read_excel(path, sheet_name="HS2022-HS2017 Conversions",
                             header=None, skiprows=1, dtype=str).dropna()
        conv.columns = ["h22", "h17"]
        corr = pd.read_excel(path, sheet_name="HS2022-HS2017 Correlations",
                             header=None, skiprows=2, dtype=str).dropna(subset=[0, 1])
        corr.columns = ["h22", "h17", "rel"]
        z = lambda col: col.str.zfill(6)  # noqa: E731
        self.to17 = dict(zip(z(conv.h22), z(conv.h17)))
        self.targets = z(corr.h22).to_frame("h22").assign(h17=z(corr.h17)).groupby("h22").h17.apply(set).to_dict()
        self.sources = z(corr.h17).to_frame("h17").assign(h22=z(corr.h22)).groupby("h17").h22.apply(set).to_dict()

    def convert(self, code: str) -> tuple[str, str]:
        """
        (HS-2017 code, mapping kind) for one HS-2022 code.

        "split" is the only kind read off the table's relationships: it marks
        a code whose value could sit under more than one HS-2017 code, so the
        single target is a convention. "merged" is decided later, from what
        actually happened in a partner's data — several reported codes landing
        on one line — not from what the table says could happen.
        """
        t = self.to17.get(code)
        if t is None:
            return code, "unmapped"
        if len(self.targets.get(code, {code})) > 1:
            return t, "split"
        return t, "recoded" if t != code else "same"


def to_hs2017(partner: pd.DataFrame, hs: Concordance) -> pd.DataFrame:
    """Partner export rows with two extra columns: h17 and map."""
    out = partner.copy()
    conv = out.cmdCode.map(lambda c: hs.convert(c))
    out["h17"] = conv.map(lambda x: x[0])
    out["map"] = conv.map(lambda x: x[1])
    return out


def export_basis(partner: pd.DataFrame) -> str:
    flows = set(partner.flowCode.unique())
    return "domestic" if "DX" in flows else ("total_less_reexports" if "RX" in flows else "total")


def domestic_exports(partner: pd.DataFrame) -> pd.DataFrame:
    """
    The partner's exports to Lebanon on the basis Lebanon books them.

    Lebanon records an import under its country of origin. A partner's
    re-exports — goods made elsewhere and shipped on — never appear under
    that partner in Beirut, so comparing them to Lebanon's figure manufactures
    a gap (the UAE's 2023 "exports" to Lebanon were 73% re-exports). Where the
    partner publishes domestic exports (DX) they are used; where it publishes
    only re-exports (RX) they come off the total, code by code; where it
    publishes neither (China, Greece) the total stands and the basis says so.
    The re-exported amount is kept on each code so a reader can see it.
    """
    to_leb = partner[partner.partnerCode == LEBANON]
    basis = export_basis(partner)
    rx = (to_leb[to_leb.flowCode == "RX"].groupby("cmdCode").primaryValue.sum().rename("rx")
          if basis != "total" else None)
    if basis == "domestic":
        d = to_leb[to_leb.flowCode == "DX"].copy()
        d = d.merge(rx, on="cmdCode", how="left") if rx is not None else d.assign(rx=0.0)
        d["rx"] = d.rx.fillna(0.0)
        return d
    d = to_leb[to_leb.flowCode == "X"].copy()
    if basis == "total_less_reexports":
        d = d.merge(rx, on="cmdCode", how="left")
        d["rx"] = d.rx.fillna(0.0)
        d["primaryValue"] = (d.primaryValue - d.rx).clip(lower=0.0)
    else:
        d["rx"] = float("nan")
    return d


def read_lebanon(path: Path) -> tuple[pd.DataFrame, pd.Series, dict]:
    """
    Lebanon's detail rows, plus its imports of every HS-4 heading from every
    origin. The second is the attribution test: when Lebanon books less of a
    heading from the whole world than one partner says it sent, the goods are
    absent from Lebanon's records under any origin — not merely credited to a
    different one. That is the strongest evidence this method can give.
    """
    raw = pd.read_csv(path, sep="\t", dtype={"cmdCode": str}, low_memory=False)
    base = (raw.partner2Code == 0) & (raw.motCode == 0) & (raw.customsCode == "C00")
    detail = raw[base & (raw.cmdCode.str.len() == 6) & (raw.partnerCode != 0)].copy()
    world4 = (raw[base & (raw.flowCode == "M") & (raw.partnerCode == 0) & (raw.cmdCode.str.len() == 4)]
              .groupby("cmdCode").primaryValue.sum())
    return detail, world4, _checks(raw, base)


def _checks(raw: pd.DataFrame, base: pd.Series) -> dict:
    """The file's own TOTAL rows and its world HS-6 sums — what the build reconciles to."""
    six = raw.cmdCode.str.len() == 6
    return {
        "totals": raw.loc[base & (raw.cmdCode == "TOTAL"), ["flowCode", "partnerCode", "primaryValue"]],
        "world6": raw.loc[base & six & (raw.partnerCode == 0)].groupby("flowCode").primaryValue.sum().to_dict(),
    }


def reconcile(checks: dict, detail: pd.DataFrame, flow: str, partner: int,
              year: int, reporter: str, partner_name: str) -> dict:
    """One line of the reconciliation table: our HS-6 sum against the file's TOTAL row."""
    t = checks["totals"]
    t = t[(t.flowCode == flow) & (t.partnerCode == partner)].primaryValue
    total = float(t.iloc[0]) if len(t) else None
    if partner == 0:
        s, n = float(checks["world6"].get(flow, 0.0)), None
    else:
        sel = detail[(detail.flowCode == flow) & (detail.partnerCode == partner)]
        s, n = float(sel.primaryValue.sum()), int(len(sel))
    return {"year": year, "reporter": reporter, "flow": flow, "partner": partner_name, "lines": n,
            "hs6_sum": round(s, 2), "total_row": None if total is None else round(total, 2),
            "ratio": None if not total else round(s / total, 4)}


# Published figures the build is checked against, in USD. A build that drifts
# from these is reading the wrong file, not finding a bigger gap.
EXTERNAL_CHECKS = [
    {"figure": "Lebanon total imports", "year": 2024, "reporter": LEBANON, "flow": "M", "partner": 0,
     "published": 17.3e9, "source": "Lebanese Customs, cited in the US Country Commercial Guide (trade.gov)"},
    {"figure": "Lebanon imports from the United States", "year": 2024, "reporter": LEBANON, "flow": "M", "partner": 842,
     "published": 584e6, "source": "Lebanese Customs, cited in the US Country Commercial Guide (trade.gov)"},
    {"figure": "China exports to Lebanon", "year": 2024, "reporter": 156, "flow": "X", "partner": LEBANON,
     "published": 2.11e9, "source": "UN Comtrade, as published by Trading Economics"},
]


def read_bulk(path: Path) -> tuple[pd.DataFrame, dict]:
    """
    One reporter-year, reduced to genuine non-overlapping detail rows.

    The bulk files interleave as-reported rows with Comtrade's own rollups
    (HS-2, HS-4, TOTAL, 'World' partner) and, for some reporters, a breakdown by
    mode of transport. This filter yields exactly one row per reporter x flow x
    partner x HS-6 and reconciles to the file's own TOTAL row to the dollar.
    """
    # pandas infers gzip/zip from the extension, so a raw bulk download reads
    # the same as one that was unpacked by hand.
    df = pd.read_csv(path, sep="\t", dtype={"cmdCode": str}, low_memory=False)
    base = (df["partner2Code"] == 0) & (df["motCode"] == 0) & (df["customsCode"] == "C00")
    keep = base & (df["cmdCode"].str.len() == 6) & (df["partnerCode"] != 0)
    return df.loc[keep].copy(), _checks(df, base)


# Two naming schemes turn up in a download folder: Comtrade's own
# (C_A_<class>_<reporter>_<year>.gz) and the hand-renamed form
# (<Name>_<reporter>_<class>_<year>.csv). Browsers add " 2" or " (1)" to
# repeat downloads, so the match is anchored at the front only.
_COMTRADE = re.compile(r"^C_A_(H\d)_(\d{3})_(\d{4})")
_NAMED = re.compile(r"^[A-Za-z]+_(\d{3})_(H\d)_(\d{4})")
_PREFER = {".csv": 0, ".gz": 1, ".zip": 2}   # uncompressed reads fastest


def discover(dir_: Path) -> dict[int, dict[int, Path]]:
    """year -> reporter -> file, one file per reporter-year."""
    found: dict[tuple[int, int], Path] = {}
    for p in sorted(dir_.iterdir()):
        ext = p.suffix.lower()
        if ext not in _PREFER:
            continue
        m = _COMTRADE.match(p.name)
        if m:
            _, code, year = m.groups()
        else:
            m = _NAMED.match(p.name)
            if not m:
                continue
            code, _, year = m.groups()
        key = (int(year), int(code))
        if key not in found or _PREFER[ext] < _PREFER[found[key].suffix.lower()]:
            found[key] = p
    files: dict[int, dict[int, Path]] = defaultdict(dict)
    for (year, code), p in found.items():
        files[year][code] = p
    return files


def classify(cover: float) -> str:
    if cover >= OVER_RATIO:
        return "over_invoicing"
    if cover < UNDER_LO:
        return "value_gap"
    if cover < UNDER_HI:
        return "under_invoicing"
    return "normal"


def corridors_for(lebanon: pd.DataFrame, partner: pd.DataFrame,
                  code: int, year: int, hs: Concordance, world4: pd.Series) -> list[dict]:
    leb = lebanon[(lebanon.flowCode == "M") & (lebanon.partnerCode == code)].copy()
    ptr = domestic_exports(partner)
    if leb.empty or ptr.empty:
        return []

    # Both sides on HS 2017 before the heading is cut.
    ptr = to_hs2017(ptr, hs)
    leb["hs4"] = leb.cmdCode.str[:4]
    ptr["hs4"] = ptr.h17.str[:4]
    a = leb.groupby("hs4").primaryValue.sum().rename("m")
    b = ptr.groupby("hs4").agg(x_fob=("primaryValue", "sum"), x_kg=("netWgt", "sum"), rx=("rx", "sum"))
    total_x, total_m = float(b.x_fob.sum()) * CIF_FACTOR, float(a.sum())
    frame = pd.concat([a, b], axis=1).fillna(0.0).reset_index()
    frame = frame[(frame.x_fob >= MIN_PARTNER_VALUE) & (~frame.hs4.isin(EXCLUDED_HS4))]

    out = []
    for r in frame.itertuples():
        x_cif = r.x_fob * CIF_FACTOR
        gap = x_cif - r.m                       # positive = Lebanon declared less
        cover = r.m / x_cif if x_cif else 0.0
        share = structural_share(x_cif, r.m, total_x, total_m)
        sig = "structural" if share else ("exempt" if is_exempt(r.hs4) else classify(cover))
        hs2 = r.hs4[:2]
        rate = duty_rate(hs2)
        m_world = float(world4.get(r.hs4, 0.0))

        # Fiscal loss only where Lebanon declared LESS. Over-declaration is not a
        # revenue loss — it is money leaving, counted separately.
        shortfall = max(gap, 0.0) if sig in ("under_invoicing", "value_gap") else 0.0
        # Over-declared value is the outflow measure: what Lebanon recorded above
        # anything a partner reports shipping.
        outflow = max(-gap, 0.0) if sig == "over_invoicing" else 0.0

        out.append({
            "year": year,
            "partner": code,
            "partnerName": COUNTRY.get(code, str(code)),
            "hs4": r.hs4,
            "hs2": hs2,
            "chapter": CHAPTERS.get(hs2, f"Chapter {hs2}"),
            "label": f"HS {r.hs4}",
            "x_fob": round(r.x_fob, 2),
            "x_cif": round(x_cif, 2),
            "m": round(r.m, 2),
            "gap": round(gap, 2),
            "gap_pct": round(100 * gap / x_cif, 1) if x_cif else 0.0,
            "cover": round(cover, 3),
            "qty_gap_pct": None,                # Lebanon publishes no genuine weights
            "partner_kg": round(r.x_kg, 1) if r.x_kg else None,
            "rx": round(r.rx, 2) if r.rx == r.rx else None,   # re-exports through the partner, FOB
            "m_world": round(m_world, 2),                     # Lebanon's imports of the heading from every origin
            "absent": bool(x_cif > 0 and m_world < 0.85 * x_cif),
            "share": round(share, 3) if share else None,   # of the corridor, when set aside as one-sided
            "signature": sig,
            "shortfall": round(shortfall, 2),
            "outflow": round(outflow, 2),
            "vat_floor": round(shortfall * VAT_RATE, 2),
            "duty_rate": rate,
            "duty_loss": round(shortfall * rate, 2),
            "fiscal_loss": round(shortfall * (VAT_RATE + rate), 2),
            "confidence": "medium" if r.x_fob > 1e6 else "low",
            "hub": code in HUBS,
        })
    return out


def summarise(rows: list[dict]) -> dict:
    def s(key, pred=lambda c: True):
        return round(sum(c[key] for c in rows if pred(c)), 2)
    is_under = lambda c: c["signature"] == "under_invoicing"      # noqa: E731
    is_gap = lambda c: c["signature"] == "value_gap"              # noqa: E731
    is_over = lambda c: c["signature"] == "over_invoicing"        # noqa: E731
    counts = defaultdict(int)
    for c in rows:
        counts[c["signature"]] += 1
    return {
        "corridors": len(rows),
        "x_cif": s("x_cif"),
        "m": s("m"),
        "under": {"count": counts["under_invoicing"], "shortfall": s("shortfall", is_under),
                  "vat": s("vat_floor", is_under), "duty": s("duty_loss", is_under),
                  "fiscal": s("fiscal_loss", is_under)},
        "unrecorded": {"count": counts["value_gap"], "shortfall": s("shortfall", is_gap),
                       "vat": s("vat_floor", is_gap), "duty": s("duty_loss", is_gap),
                       "fiscal": s("fiscal_loss", is_gap)},
        "over": {"count": counts["over_invoicing"], "outflow": s("outflow", is_over)},
        "normal": {"count": counts["normal"]},
        "exempt": {"count": counts["exempt"], "gap": s("gap", lambda c: c["signature"] == "exempt" and c["gap"] > 0)},
        "structural": {"count": counts["structural"]},
        "vat_floor": s("vat_floor"),
        "duty_loss": s("duty_loss"),
        "fiscal_loss": s("fiscal_loss"),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path, default=Path("all"))
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--hs6-out", type=Path, default=None,
                    help="also write the HS-6 partner mirror, reading each file once")
    args = ap.parse_args()

    hs = Concordance()
    print(f"HS 2022 -> HS 2017: {len(hs.to17):,} codes, "
          f"{sum(1 for c, t in hs.to17.items() if c != t)} recoded, "
          f"{sum(1 for c in hs.to17 if len(hs.targets.get(c, ())) > 1)} split")

    files = discover(args.dir)
    years = sorted(y for y, f in files.items() if LEBANON in f)
    print(f"Years with a Lebanon file: {years}")
    for y in years:
        print(f"  {y}: " + ", ".join(f"{COUNTRY.get(c, c)} <- {p.name}" for c, p in sorted(files[y].items())))

    corridors: list[dict] = []
    per_year: dict[str, dict] = {}
    partners_by_year: dict[int, list[int]] = {}
    hs6: list[dict] = []
    recon: list[dict] = []
    totals_by: dict[tuple, pd.DataFrame] = {}

    for year in years:
        leb, world4, lchecks = read_lebanon(files[year][LEBANON])
        totals_by[(year, LEBANON)] = lchecks["totals"]
        recon.append(reconcile(lchecks, leb, "M", 0, year, "Lebanon", "World"))
        rows_this_year: list[dict] = []
        got = []
        basis_of: dict[int, str] = {}
        for code, path in sorted(files[year].items()):
            if code == LEBANON:
                continue
            ptr, pchecks = read_bulk(path)
            totals_by[(year, code)] = pchecks["totals"]
            recon.append(reconcile(lchecks, leb, "M", code, year, "Lebanon", COUNTRY.get(code, str(code))))
            recon.append(reconcile(pchecks, ptr, "X", LEBANON, year, COUNTRY.get(code, str(code)), "Lebanon"))
            recon.append(reconcile(pchecks, ptr, "X", 0, year, COUNTRY.get(code, str(code)), "World"))
            basis_of[code] = export_basis(ptr)
            rows = corridors_for(leb, ptr, code, year, hs, world4)
            if rows:
                rows_this_year.extend(rows)
                got.append(code)
                print(f"  {year} {COUNTRY.get(code, code):<15} {len(rows):>4} corridors · partner figure: {basis_of[code]}")
            if args.hs6_out:
                r = hs6_rows(leb, ptr, code, year, hs, world4)
                EXPORT_BASIS[f"{year}:{code}"] = basis_of[code]
                hs6.extend(r)
                n = lambda st: sum(1 for x in r if x["st"] == st)  # noqa: E731
                m = lambda k: sum(1 for x in r if x.get("map") == k)  # noqa: E731
                print(f"       HS-6 mirror {len(r):>5} lines | paired {n('matched'):>4} | "
                      f"one-sided: partner {n('partner_only'):>4}, Lebanon {n('lebanon_only'):>4} | "
                      f"mapping: recoded {m('recoded')}, merged {m('merged')}, split {m('split')}, unmapped {m('unmapped')}")
        partners_by_year[year] = got
        corridors.extend(rows_this_year)
        per_year[str(year)] = summarise(rows_this_year)
        per_year[str(year)]["partners"] = [
            {"code": c, "name": COUNTRY.get(c, str(c)), "hub": c in HUBS, "basis": basis_of[c]} for c in got
        ]

    # Partners present in every year — the only set where a year-on-year
    # comparison is like-for-like.
    comparable = sorted(set.intersection(*(set(v) for v in partners_by_year.values()))) \
        if len(partners_by_year) > 1 else sorted(partners_by_year.get(years[0], []))
    print(f"\n  comparable partner set: {[COUNTRY.get(c) for c in comparable]}")

    # Persistence: a heading flagged in every year it could have been is a
    # pattern; one flagged in a single year is usually noise or a reclassification.
    seen: dict[tuple, set] = defaultdict(set)
    flagged_in: dict[tuple, set] = defaultdict(set)
    for c in corridors:
        key = (c["partner"], c["hs4"])
        seen[key].add(c["year"])
        if c["signature"] in ("under_invoicing", "value_gap"):
            flagged_in[key].add(c["year"])
    for c in corridors:
        key = (c["partner"], c["hs4"])
        c["years_seen"] = len(seen[key])
        c["years_flagged"] = len(flagged_in[key])
        c["persistent"] = len(flagged_in[key]) > 1

    # Year-on-year is only honest across the partners present in every year.
    # 2023 carries the UAE and the USA, 2024 carries Saudi Arabia; comparing raw
    # totals across those sets would show a fall that is a coverage change, not
    # a policy result.
    for year in years:
        rows = [c for c in corridors if c["year"] == year and c["partner"] in comparable]
        per_year[str(year)]["comparable"] = summarise(rows)

    corridors.sort(key=lambda c: (-c["year"], -abs(c["gap"])))

    # The build checks itself and publishes the checks. Three tables: our HS-6
    # sums against every file's own TOTAL row; a few figures against what the
    # customs services published; and each partner-year's basis and mirror ratio.
    external = []
    for chk in EXTERNAL_CHECKS:
        t = totals_by.get((chk["year"], chk["reporter"]))
        if t is None:
            continue
        v = t[(t.flowCode == chk["flow"]) & (t.partnerCode == chk["partner"])].primaryValue
        if len(v):
            ours = float(v.iloc[0])
            external.append({**{k: chk[k] for k in ("figure", "year", "published", "source")},
                             "ours": round(ours, 2), "diff_pct": round(100 * (ours - chk["published"]) / chk["published"], 2)})
    pv = []
    for year in years:
        for code in partners_by_year[year]:
            lines = [r for r in hs6 if r["y"] == year and r["p"] == code]
            cs = [c for c in corridors if c["year"] == year and c["partner"] == code]
            kept = [r for r in lines if r["rd"] != "structural"]
            x = sum(r["xc"] for r in kept); m = sum(r["m"] for r in kept)
            aside = [r for r in lines if r["rd"] == "structural"]
            fiscal = sum(c["fiscal_loss"] for c in cs if c["signature"] in ("under_invoicing", "value_gap") and c["gap"] > 0)
            absent = sum(c["fiscal_loss"] for c in cs if c["signature"] in ("under_invoicing", "value_gap") and c["gap"] > 0 and c["absent"])
            pv.append({
                "year": year, "code": code, "name": COUNTRY.get(code, str(code)),
                "basis": EXPORT_BASIS.get(f"{year}:{code}"),
                "lines": len(lines), "x_cif": round(x, 2), "m": round(m, 2), "ratio": round(m / x, 3) if x else None,
                "set_aside": round(sum(r["xc"] + r["m"] for r in aside), 2),
                "set_aside_hs4": sorted({r["hs4"] for r in aside}),
                "rx": round(sum(r["rx"] or 0 for r in lines), 2),
                "exempt_gap": round(sum(r["g"] for r in lines if r["rd"] == "exempt" and r["g"] > 0), 2),
                "fiscal": round(fiscal, 2), "fiscal_absent": round(absent, 2),
            })
    validation = {
        "reconciliation": recon, "external": external, "partners": pv,
        "note": ("Every figure here is produced by the build itself. The reconciliation sums the HS-6 "
                 "rows the build uses and sets them against the TOTAL row Comtrade publishes in the same "
                 "file; a ratio other than 1.0000 would mean rows were double-counted or dropped. Mirror "
                 "ratios between 0.8 and 1.2 are ordinary for two customs services; outside that range "
                 "the basis column says why."),
    }

    payload = {
        "meta": {
            "demo": False,
            "years": years,
            "base_year": years[-1],
            "comparable_partners": [
                {"code": c, "name": COUNTRY.get(c, str(c))} for c in comparable
            ],
            "generated": date.today().isoformat(),
            "retrieved": datetime.now(timezone.utc).isoformat(),
            "source": "UN Comtrade bulk FINAL files (comtradeapi.un.org)",
            "coverage": "PARTIAL — only the partners listed per year are mirrored",
            "cif_factor": CIF_FACTOR,
            "cif_basis": (
                "Documented constant, not fitted. Fitting it to this data would be "
                "circular: systematic under-declaration depresses the very median a "
                "fit would use as its baseline. 1.05 is the conservative end of the "
                "published CIF/FOB range, so it understates gaps rather than inflating them."
            ),
            "vat_rate": VAT_RATE,
            "bands": {"under_lo": UNDER_LO, "under_hi": UNDER_HI, "over": OVER_RATIO},
            "signatures": {
                "under_invoicing": "Value under-declared",
                "value_gap": "Largely unrecorded",
                "over_invoicing": "Lebanon declares more",
                "normal": "Within normal asymmetry",
                "smuggling_risk": "Goods not presented",
                "exempt": "Exempt regime · military & aircraft",
                "structural": "Set aside · one-sided heading",
            },
            "structural_rule": (
                f"A heading that is at least {int(STRUCTURAL_SHARE * 100)}% of the side it appears on, "
                f"with the other side holding under {int(ONE_SIDED * 100)}% of it, is set aside from every "
                "total and shown on its own: it is a reporting-practice question, not a customs gap."
            ),
            "structural_share": STRUCTURAL_SHARE,
            "partner_basis": (
                "Lebanon books imports by country of origin, so a partner's re-exports never "
                "appear under that partner. The partner figure is domestic exports (DX) where "
                "published; total exports less re-exports where only RX is published; total "
                "exports where neither is (China, Greece). Each partner-year says which."
            ),
            "exempt_hs": list(EXEMPT_HS),
            "validation": validation,
            "classification": (
                "Lebanon reports in HS 2017 (H5); every partner in HS 2022 (H6). Partner codes "
                "are converted to HS 2017 with the UNSD HS2022-to-HS2017 conversion table before "
                "pairing. Codes the table cannot place stay one-sided and are labelled unmapped."
            ),
            "hs_table": "UNSD HS2022toHS2017ConversionAndCorrelationTables.xlsx",
            "quantity_available": False,
            "quantity_note": (
                "Lebanon publishes no genuine net weight to Comtrade — every non-zero "
                "weight on its import rows is a UN estimate. Under-pricing therefore "
                "cannot be separated from missing goods on public data; declaration-level "
                "weights (NAJM) are what would settle it."
            ),
            "duty_note": (
                "Duty is INDICATIVE, applied as a flat band per HS chapter. It ignores "
                "excise, exemptions and free-trade preferences. Verify against the "
                "Lebanese tariff schedule before citing any duty figure."
            ),
        },
        "years": per_year,
        "corridors": corridors,
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=1))

    print(f"\n{len(corridors)} corridors across {len(years)} years -> {args.out}")
    for y in years:
        v = per_year[str(y)]
        print(f"\n  {y}:  {v['corridors']} corridors, {len(v['partners'])} partners")
        print(f"    under-declared  {v['under']['count']:>4} lines  "
              f"shortfall ${v['under']['shortfall']/1e6:>8,.1f}M  fiscal ${v['under']['fiscal']/1e6:>7,.1f}M")
        print(f"    unrecorded      {v['unrecorded']['count']:>4} lines  "
              f"shortfall ${v['unrecorded']['shortfall']/1e6:>8,.1f}M  fiscal ${v['unrecorded']['fiscal']/1e6:>7,.1f}M")
        print(f"    over-declared   {v['over']['count']:>4} lines  "
              f"outflow   ${v['over']['outflow']/1e6:>8,.1f}M")
        print(f"    TOTAL FISCAL    ${v['fiscal_loss']/1e6:,.1f}M  "
              f"(VAT ${v['vat_floor']/1e6:,.1f}M + duty ${v['duty_loss']/1e6:,.1f}M)")
    print("\n  LIKE-FOR-LIKE (comparable partners only):")
    for y in years:
        v = per_year[str(y)]["comparable"]
        print(f"    {y}: fiscal ${v['fiscal_loss']/1e6:>7,.1f}M  "
              f"(under ${v['under']['fiscal']/1e6:>6,.1f}M + unrecorded ${v['unrecorded']['fiscal']/1e6:>6,.1f}M), "
              f"outflow ${v['over']['outflow']/1e6:>7,.1f}M")
    print(f"  persistent flagged headings: {sum(1 for c in corridors if c['persistent'])//2}")

    if args.hs6_out:
        write_hs6(hs6, args.hs6_out)



# --------------------------------------------------------------------------- #
# HS-6 layer — the partner-by-partner mirror the portal serves through its API  #
# --------------------------------------------------------------------------- #

def _row(code, status, m, x_fob, kg, lc, pc, year, partner, src, kind, rx, lw):
    x_cif = x_fob * CIF_FACTOR
    gap = x_cif - m
    if m > 0 and x_fob == 0:
        cover, reading = None, "not_in_partner"
    elif m == 0 and x_fob > 0:
        cover, reading = 0.0, "not_in_lebanon"
    else:
        cover = m / x_cif
        reading = classify(cover)
    if is_exempt(code):
        reading = "exempt"
    hs2 = code[:2]
    return {
        "y": year, "p": partner, "hs6": code,
        "hs4": code[:4], "hs2": hs2, "ch": CHAPTERS.get(hs2, ""),
        "st": status,
        "x": round(x_fob, 2), "xc": round(x_cif, 2), "m": round(m, 2),
        "g": round(gap, 2), "cv": None if cover is None else round(cover, 3),
        "rd": reading,
        "vat": round(gap * VAT_RATE, 2) if gap > 0 and reading != "exempt" else 0.0,
        "duty": round(gap * duty_rate(hs2), 2) if gap > 0 and reading != "exempt" else 0.0,
        "kg": round(kg, 1) if kg else None,
        "lv": lc, "pv": pc,
        # What the partner actually reported (HS 2022) and how it was placed.
        "pc": src, "map": kind,
        # Re-exports through the partner on this code (FOB), and Lebanon's imports
        # of the whole HS-4 heading from every origin — the attribution test.
        "rx": round(rx, 2) if rx == rx else None,
        "lw": round(lw, 2),
    }


def hs6_rows(lebanon: pd.DataFrame, partner: pd.DataFrame, code: int, year: int,
             hs: Concordance, world4: pd.Series) -> list[dict]:
    """
    Every product code on which either side reported the corridor, paired on
    HS 2017.

    The partner's HS-2022 codes are converted with the official table first,
    so a code that was renumbered between editions lands on the code Lebanon
    would have used. Several HS-2022 codes that the table pools into one
    HS-2017 code are summed; their original codes are kept on the line. What
    remains one-sided after that is genuinely one-sided — nothing is paired
    by prefix.
    """
    a = lebanon[(lebanon.flowCode == "M") & (lebanon.partnerCode == code)]
    a = a.groupby("cmdCode").agg(m=("primaryValue", "sum"), lc=("classificationCode", "first"))
    b = to_hs2017(domestic_exports(partner), hs)
    b = b.groupby("h17").agg(
        x_fob=("primaryValue", "sum"), kg=("netWgt", "sum"), rx=("rx", "sum"),
        pc=("classificationCode", "first"),
        src=("cmdCode", lambda v: "+".join(sorted(set(v)))),
        kind=("map", lambda v: min(v, key=lambda k: MAP_RANK[k])),
        nsrc=("cmdCode", "nunique"),
    )
    # Several reported codes on one HS-2017 line: that is a merge, whatever
    # each code's own kind was.
    b.loc[b.nsrc > 1, "kind"] = "merged"
    j = a.join(b, how="outer").reset_index().rename(columns={"index": "cmdCode"})
    j["m"] = j.m.fillna(0.0)
    j["x_fob"] = j.x_fob.fillna(0.0)
    j["kg"] = j.kg.fillna(0.0)
    # A code the partner only re-exported and Lebanon never registered has
    # nothing on either side once re-exports come off; it is not a line.
    j = j[(j.m > 0) | (j.x_fob > 0)]
    has_rx = export_basis(partner) != "total"

    out: list[dict] = []
    for r in j.itertuples(index=False):
        status = "matched" if (r.m > 0 and r.x_fob > 0) else ("lebanon_only" if r.m > 0 else "partner_only")
        out.append(_row(
            r.cmdCode, status, r.m, r.x_fob, r.kg,
            r.lc if isinstance(r.lc, str) else None,
            r.pc if isinstance(r.pc, str) else None,
            year, code,
            r.src if isinstance(r.src, str) else None,
            r.kind if isinstance(r.kind, str) else None,
            (r.rx if r.rx == r.rx else 0.0) if has_rx else float("nan"),
            float(world4.get(r.cmdCode[:4], 0.0)),
        ))
    tx, tm = sum(r["xc"] for r in out), sum(r["m"] for r in out)
    by4: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for r in out:
        by4[r["hs4"]][0] += r["xc"]; by4[r["hs4"]][1] += r["m"]
    for r in out:
        share = structural_share(*by4[r["hs4"]], tx, tm)
        if share:
            r["rd"], r["vat"], r["duty"], r["sx"] = "structural", 0.0, 0.0, round(share, 3)
    return out


def write_hs6(rows: list[dict], out: Path) -> None:
    out.write_text(json.dumps({
        "meta": {"cif_factor": CIF_FACTOR, "vat_rate": VAT_RATE, "countries": COUNTRY,
                 "generated": date.today().isoformat(),
                 "basis": dict(EXPORT_BASIS), "exempt_hs": list(EXEMPT_HS),
                 "structural_share": STRUCTURAL_SHARE, "one_sided": ONE_SIDED},
        "rows": rows,
    }, separators=(",", ":")))
    print(f"  {len(rows):,} HS-6 lines -> {out} ({out.stat().st_size/1e6:.1f} MB)")


if __name__ == "__main__":
    main()
