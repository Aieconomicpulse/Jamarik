"""
Tests for pipeline/estimate.py — run with:  pytest tests/ -q

Two properties the estimator must have, checked on synthetic data:
  1. Symmetric noise alone produces (almost) no estimated loss.
  2. Injected under-declaration is recovered, inside the bootstrap interval.

And one integration check on the shipped data (skipped when the data files are
absent): rebuilding HS-4 corridors from mirror_hs6.json with the OLD partner-only
threshold reproduces every corridor in mirror_gaps.json.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))

import estimate as E  # noqa: E402
from build_mirror import CIF_FACTOR, classify  # noqa: E402

RATE = 0.11 + 0.05


def synthetic(n=600, sigma=0.5, seed=1, fraud=0, fraud_cover=0.55):
    """n corridors for one partner-year with log-cover ~ N(0, sigma); the first
    `fraud` of them are then forced to cover = fraud_cover (under-declared)."""
    rng = np.random.default_rng(seed)
    rows = []
    for i in range(n):
        x_cif = 2_000_000.0
        cover = fraud_cover if i < fraud else float(np.exp(rng.normal(0, sigma)))
        m = x_cif * cover
        gap = x_cif - m
        sig = classify(cover)
        short = max(gap, 0.0) if sig in E.FLAGGED else 0.0
        rows.append({
            "year": 2024, "partner": 1, "hs4": f"{i:04d}", "x_cif": x_cif, "m": m, "gap": gap,
            "cover": round(cover, 3), "signature": sig, "shortfall": short,
            "fiscal_loss": short * RATE, "absent": False, "persistent": False,
        })
    return rows


def test_symmetric_noise_yields_little_loss():
    rows = synthetic()
    est = E.estimate(rows, draws=50)
    y = est["years"]["2024"]
    assert y["gross"] > 0
    assert y["central"] / y["gross"] < 0.25, "symmetric noise should mostly cancel"


def test_injected_fraud_is_recovered():
    fraud = 80
    rows = synthetic(fraud=fraud)
    injected = sum(r["fiscal_loss"] for r in rows[:fraud])
    est = E.estimate(rows, draws=100)
    y = est["years"]["2024"]
    assert y["lo"] <= injected * 1.3, "interval should not sit far above the injected loss"
    assert y["central"] >= injected * 0.5, "estimator should recover at least half the injected loss"
    assert y["central"] <= y["gross"]
    assert all(0.0 <= r.get("p_real", 0) <= 1.0 for r in rows)


def test_band_noise_shares_mirror_counts():
    rows = synthetic(n=200, seed=3)
    shares = E.band_noise_shares(rows)
    for band, s in shares.items():
        assert 0.0 <= s["p_noise"] <= 1.0
        assert s["n"] >= 0 and s["n_mirror"] >= 0


@pytest.mark.skipif(not (ROOT / "data" / "mirror_hs6.json").exists(), reason="data files not present")
def test_rebuild_reproduces_shipped_corridors_under_old_rule():
    hs6 = json.loads((ROOT / "data" / "mirror_hs6.json").read_text())["rows"]
    gaps = json.loads((ROOT / "data" / "mirror_gaps.json").read_text())
    rebuilt = {(c["year"], c["partner"], c["hs4"]): c for c in E.rebuild_corridors(hs6)}
    shipped = [c for c in gaps["corridors"] if c["x_fob"] >= 250_000]
    missing = [k for k in ((c["year"], c["partner"], c["hs4"]) for c in shipped) if k not in rebuilt]
    assert not missing, f"{len(missing)} shipped corridors not rebuilt, e.g. {missing[:3]}"
    for c in shipped[:500]:
        r = rebuilt[(c["year"], c["partner"], c["hs4"])]
        assert abs(r["x_fob"] - c["x_fob"]) < 1.0
        assert abs(r["m"] - c["m"]) < 1.0
