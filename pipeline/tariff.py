"""
Jamarik — preference-aware duty rate (interim, until the HS-6 tariff table lands).

The shipped build applies one flat band per HS chapter to every partner. Lebanon
does not charge that duty on most of its imports:

  * EU and EFTA goods enter duty-free under the Euro-Mediterranean Association
    Agreement and the EFTA agreement (industrial goods, chapters 25-97, fully
    liberalised since 2015; agriculture only partly).
  * Goods of Arab origin enter duty-free under GAFTA.

so booking chapter-band duty on Italy, Greece, Saudi Arabia or the UAE
manufactures revenue that was never chargeable ($15M of the shipped 2024 figure).

This module keeps the chapter bands for MFN partners (China, the United States,
and everyone else), zeroes them where a preference applies, and always keeps
excise-type chapters, which are charged whatever the origin. It is deliberately
simple; Phase 2 replaces it with pipeline/tariff/lebanon_tariff_hs6.csv
(WITS/TRAINS applied rates + excise + VAT-exemption flags) through the same
function signature, so nothing downstream changes.

VERIFY the membership sets and the agricultural carve-outs against the Lebanese
Customs tariff and the agreement texts before citing any duty figure.
"""

from __future__ import annotations

# UN Comtrade uses a few codes that differ from M49 (France 251, Italy 381,
# Norway 579, Switzerland 757, India 699 ...). Both variants are listed so the
# rule holds whichever the download used.
EU = {
    40, 56, 100, 191, 196, 203, 208, 233, 246, 250, 251, 276, 300, 348, 372, 380, 381,
    428, 440, 442, 470, 528, 616, 620, 642, 703, 705, 724, 752,
}
EFTA = {352, 438, 578, 579, 756, 757}
GAFTA = {12, 48, 275, 368, 400, 414, 422, 434, 504, 512, 634, 682, 729, 736, 760, 784, 788, 818, 887}

# Charged whatever the origin: beverages/spirits, tobacco, fuels, vehicles.
EXCISE_HS2 = {"22", "24", "27", "87"}

# Chapter bands for MFN partners — unchanged from build_mirror.DUTY_BANDS.
DUTY_BANDS = {
    "default": 0.05,
    0.00: ["10", "27", "29", "30", "31", "47", "72", "84", "85", "90"],
    0.10: ["17", "19", "20", "21", "32", "33", "34", "39", "48", "69", "70", "73", "76", "83", "94", "96"],
    0.20: ["22", "42", "61", "62", "63", "64", "65", "66", "87", "91", "95"],
    0.35: ["24"],
}


def mfn_rate(hs2: str) -> float:
    for rate, chapters in DUTY_BANDS.items():
        if rate != "default" and hs2 in chapters:
            return rate
    return DUTY_BANDS["default"]


def preference(partner: int) -> str:
    if partner in EU:
        return "eu"
    if partner in EFTA:
        return "efta"
    if partner in GAFTA:
        return "gafta"
    return "mfn"


def duty_rate_for(hs4: str, partner: int) -> float:
    """Indicative applied duty for one heading from one origin."""
    hs2 = hs4[:2]
    pref = preference(partner)
    if pref == "mfn" or hs2 in EXCISE_HS2:
        return mfn_rate(hs2)
    if pref in ("eu", "efta"):
        # Industrial goods liberalised; agriculture (01-24) keeps the band.
        return 0.0 if hs2 >= "25" else mfn_rate(hs2)
    # GAFTA: duty-free across the board (excise handled above).
    return 0.0
