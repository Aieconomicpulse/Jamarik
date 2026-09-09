"""The build's own rules, checked on hand-made values."""

import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import build_mirror as B  # noqa: E402
from tariff import duty_rate_for  # noqa: E402

T = json.loads((ROOT / "config" / "thresholds.json").read_text())


def test_constants_come_from_the_config_file():
    assert (B.VAT_RATE, B.CIF_FACTOR, B.MIN_PARTNER_VALUE) == (T["vat_rate"], T["cif_factor"], T["min_corridor_value"])
    assert (B.UNDER_LO, B.UNDER_HI, B.OVER_RATIO) == (T["under_lo"], T["under_hi"], T["over"])
    assert (B.STRUCTURAL_SHARE, B.ONE_SIDED, B.ABSENT_RATIO) == (T["structural_share"], T["one_sided"], T["absent_ratio"])


def test_classify_bands():
    assert B.classify(0.5) == "under_invoicing"
    assert B.classify(0.3) == "value_gap"
    assert B.classify(1.7) == "over_invoicing"
    assert B.classify(1.0) == "normal"


def test_structural_share():
    assert B.structural_share(0, 670e6, 300e6, 900e6)          # Saudi fuel: Lebanon-only, 74% of its side
    assert B.structural_share(100, 90, 1e9, 1e9) is None       # ordinary two-sided line


def test_is_exempt():
    assert B.is_exempt("8710") and B.is_exempt("930690") and B.is_exempt("880330")
    assert not B.is_exempt("8703")


def test_duty_rate_for_preferences():
    assert duty_rate_for("6402", 380) == 0.0    # Italy, footwear: EU industrial, duty-free
    assert duty_rate_for("6402", 156) == 0.2    # China, footwear: MFN band
    assert duty_rate_for("2402", 380) == 0.35   # tobacco: excise, charged whatever the origin
    assert duty_rate_for("0805", 380) == 0.05   # citrus from Italy: agriculture keeps the band
    assert duty_rate_for("9405", 682) == 0.0    # Saudi Arabia: GAFTA


@pytest.mark.skipif(not B.HS_TABLE.exists(), reason="UNSD correlation table not present")
def test_concordance_unchanged_code():
    assert B.Concordance().convert("010121") == ("010121", "same")
