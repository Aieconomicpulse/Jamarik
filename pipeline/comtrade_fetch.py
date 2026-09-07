#!/usr/bin/env python3
"""
Jamarik — UN Comtrade downloader.

Pulls both sides of the mirror for Lebanon:

  * Lebanon's own declarations   (reporter = Lebanon)
  * What every significant partner says it shipped to / received from Lebanon

and caches the raw results to disk so that the analysis step never touches the
network. Raw pulls are never edited in place — corrections happen downstream in
build.py, so the evidence chain from API response to published figure stays
inspectable.

Usage
-----
    python pipeline/comtrade_fetch.py check      # verify key + see what exists
    python pipeline/comtrade_fetch.py partners   # discover who to mirror
    python pipeline/comtrade_fetch.py fetch      # the actual download
    python pipeline/comtrade_fetch.py report     # what's in the cache

Each stage is separately re-runnable and skips work already cached, so an
interrupted download resumes rather than starting over.

Requires COMTRADE_KEY in the environment (or a .env file beside this script).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

import pandas as pd
import yaml

try:
    import comtradeapicall
except ImportError:  # pragma: no cover - environment guard
    sys.exit("comtradeapicall is not installed. Run: pip install -r pipeline/requirements.txt")

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "pipeline" / "config.yaml"

# The API accepts up to 250,000 records per call with a key, but responses that
# large time out often enough to be a nuisance. One reporter-year is comfortably
# under that, so we pull at that granularity and accept a few more calls.
PAUSE_SECONDS = 1.0  # courtesy delay between calls
MAX_RETRIES = 3


# --------------------------------------------------------------------------- #
# Setup                                                                        #
# --------------------------------------------------------------------------- #

def load_config() -> dict:
    with open(CONFIG_PATH) as fh:
        return yaml.safe_load(fh)


def load_key() -> str:
    """Read the subscription key from the environment or a local .env file."""
    key = os.environ.get("COMTRADE_KEY")
    if not key:
        env_file = ROOT / ".env"
        if env_file.exists():
            for line in env_file.read_text().splitlines():
                if line.strip().startswith("COMTRADE_KEY="):
                    key = line.split("=", 1)[1].strip().strip("\"'")
                    break
    if not key:
        sys.exit(
            "No COMTRADE_KEY found.\n"
            "  Register free at https://comtradedeveloper.un.org (Products -> Free APIs),\n"
            "  then:  export COMTRADE_KEY='your-key'   (or put it in a .env file)"
        )
    return key


def cache_dir(cfg: dict) -> Path:
    d = ROOT / cfg["output_dir"]
    d.mkdir(parents=True, exist_ok=True)
    return d


# --------------------------------------------------------------------------- #
# API wrapper                                                                  #
# --------------------------------------------------------------------------- #

def call_final(key: str, **kwargs) -> pd.DataFrame:
    """
    One getFinalData call, with retries.

    partner2Code / customsCode / motCode are pinned to their aggregate values.
    In 'classic' breakdown the API already aggregates, but pinning them makes
    the request explicit about wanting totals — and protects the sums if the
    breakdown mode is ever changed.
    """
    defaults = dict(
        typeCode="C",
        freqCode="A",
        clCode="HS",
        partner2Code=None,
        customsCode=None,
        motCode=None,
        maxRecords=None,
        format_output="JSON",
        aggregateBy=None,
        breakdownMode="classic",
        countOnly=None,
        includeDesc=False,
    )
    defaults.update(kwargs)

    last_error = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            df = comtradeapicall.getFinalData(key, **defaults)
            if df is None:
                return pd.DataFrame()
            return df
        except Exception as exc:  # noqa: BLE001 - the SDK raises many shapes
            last_error = exc
            wait = 5 * attempt
            print(f"    retry {attempt}/{MAX_RETRIES} in {wait}s ({exc})")
            time.sleep(wait)
    print(f"    FAILED after {MAX_RETRIES} attempts: {last_error}")
    return pd.DataFrame()


def write_cache(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)


def cached(path: Path) -> bool:
    return path.exists() and path.stat().st_size > 0


# --------------------------------------------------------------------------- #
# Stage 1 — check                                                              #
# --------------------------------------------------------------------------- #

def stage_check(cfg: dict, key: str) -> None:
    """Confirm the key works and show what Comtrade actually holds."""
    print("Verifying subscription key…")
    probe = call_final(
        key,
        period=str(cfg["years"][-1]),
        reporterCode=str(cfg["lebanon_code"]),
        cmdCode="TOTAL",
        flowCode="M",
        partnerCode="0",
    )
    if probe.empty:
        sys.exit("  Key rejected or no data returned. Check the key at comtradedeveloper.un.org.")

    total = float(probe["primaryValue"].iloc[0])
    print(f"  OK. Lebanon total imports {cfg['years'][-1]}: ${total/1e9:.2f}B\n")

    print("Data availability (annual, HS):")
    years = ",".join(str(y) for y in cfg["years"])
    avail = comtradeapicall.getFinalDataAvailability(
        key, typeCode="C", freqCode="A", clCode="HS",
        period=years, reporterCode=None,
    )
    if avail is None or avail.empty:
        print("  (availability lookup returned nothing — continuing anyway)")
        return

    reporters = set(avail["reporterCode"].astype(int))
    print(f"  {len(reporters)} reporters published at least one of {years}")
    missing = {c: n for c, n in cfg["known_non_reporters"].items() if c not in reporters}
    for code, name in missing.items():
        print(f"  confirmed non-reporter: {name} ({code})")

    leb = avail[avail["reporterCode"].astype(int) == cfg["lebanon_code"]]
    print("\n  Lebanon's own releases:")
    for _, row in leb.sort_values("period").iterrows():
        released = str(row.get("publicationDate", ""))[:10]
        print(f"    {row['period']}  released {released}  {row.get('totalRecords', '?')} records")


# --------------------------------------------------------------------------- #
# Stage 2 — partner discovery                                                  #
# --------------------------------------------------------------------------- #

def stage_partners(cfg: dict, key: str) -> pd.DataFrame:
    """
    Ask Lebanon's own data who its trading partners are.

    Deriving the list this way rather than hardcoding it means the selection can
    be defended: these are the partners Lebanese customs records say matter,
    ranked by the value Lebanon itself declared.
    """
    out = cache_dir(cfg) / "partners.csv"
    frames = []

    for year in cfg["years"]:
        print(f"  Lebanon totals by partner, {year}…")
        df = call_final(
            key,
            period=str(year),
            reporterCode=str(cfg["lebanon_code"]),
            cmdCode="TOTAL",
            flowCode="M,X",
            partnerCode=None,          # every partner
            includeDesc=True,
        )
        if not df.empty:
            frames.append(df)
        time.sleep(PAUSE_SECONDS)

    if not frames:
        sys.exit("No partner data returned — cannot continue.")

    allp = pd.concat(frames, ignore_index=True)

    # partnerCode 0 is "World", an aggregate row, not a partner.
    allp = allp[allp["partnerCode"] != 0]

    imports = allp[allp["flowCode"] == "M"]
    ranked = (
        imports.groupby(["partnerCode", "partnerDesc"], as_index=False)["primaryValue"]
        .sum()
        .sort_values("primaryValue", ascending=False)
    )
    ranked["share"] = ranked["primaryValue"] / ranked["primaryValue"].sum()
    ranked["cumulative"] = ranked["share"].cumsum()

    sel = cfg["partner_selection"]
    n_years = len(cfg["years"])
    keep = ranked[
        (ranked["cumulative"] <= sel["coverage_target"])
        & (ranked["primaryValue"] >= sel["min_annual_value"] * n_years)
    ].head(sel["max_partners"]).copy()

    # Hubs are always pulled, whatever their direct share, because their
    # re-export flows are what explain gaps on other corridors.
    for code, name in cfg["hubs"].items():
        if code not in set(keep["partnerCode"]):
            row = ranked[ranked["partnerCode"] == code]
            if not row.empty:
                keep = pd.concat([keep, row], ignore_index=True)

    non_reporters = set(cfg["known_non_reporters"])
    keep["mirrorable"] = ~keep["partnerCode"].isin(non_reporters)

    keep.to_csv(out, index=False)
    covered = keep[keep["mirrorable"]]["share"].sum()

    print(f"\n  {len(keep)} partners selected, {len(keep[~keep['mirrorable']])} non-reporting")
    print(f"  Mirrorable coverage of Lebanon's imports: {covered:.1%}")
    print(f"  Written to {out.relative_to(ROOT)}")
    return keep


# --------------------------------------------------------------------------- #
# Stage 3 — the download                                                       #
# --------------------------------------------------------------------------- #

def stage_fetch(cfg: dict, key: str) -> None:
    cache = cache_dir(cfg)
    partners_file = cache / "partners.csv"
    if not partners_file.exists():
        sys.exit("Run the 'partners' stage first.")

    partners = pd.read_csv(partners_file)
    mirrorable = partners[partners["mirrorable"]]
    calls = 0

    # -- Lebanon's own declarations, one call per year per direction --------- #
    flows = {"imports": "M", "exports": "X"}
    for direction in cfg["directions"]:
        flow = flows[direction]
        for year in cfg["years"]:
            path = cache / "lebanon" / f"{direction}_{year}.parquet"
            if cached(path):
                print(f"  cached   Lebanon {direction} {year}")
                continue
            print(f"  fetching Lebanon {direction} {year}…")
            df = call_final(
                key,
                period=str(year),
                reporterCode=str(cfg["lebanon_code"]),
                cmdCode=cfg["commodity_level"],
                flowCode=flow,
                partnerCode=None,
            )
            calls += 1
            if df.empty:
                print("    no rows returned")
                continue
            write_cache(df, path)
            print(f"    {len(df):,} rows")
            time.sleep(PAUSE_SECONDS)

    # -- The partner side: what each partner says about Lebanon ------------- #
    # Mirror flows are deliberately reversed: Lebanon's IMPORTS are compared
    # against partners' EXPORTS to Lebanon, and vice versa.
    mirror_flows = {"imports": "X", "exports": "M"}
    periods = ",".join(str(y) for y in cfg["years"])

    for direction in cfg["directions"]:
        flow = mirror_flows[direction]
        for _, p in mirrorable.iterrows():
            code = int(p["partnerCode"])
            name = str(p["partnerDesc"])
            path = cache / "partners" / f"{direction}_{code}.parquet"
            if cached(path):
                print(f"  cached   {name} ({code}) {direction}")
                continue
            print(f"  fetching {name} ({code}) {direction}…")
            # All years in one call: a single partner's trade with a single
            # country is small enough that six years fits comfortably.
            df = call_final(
                key,
                period=periods,
                reporterCode=str(code),
                cmdCode=cfg["commodity_level"],
                flowCode=flow,
                partnerCode=str(cfg["lebanon_code"]),
            )
            calls += 1
            if df.empty:
                print("    no rows returned")
                continue
            write_cache(df, path)
            print(f"    {len(df):,} rows")
            time.sleep(PAUSE_SECONDS)

    # -- Hub re-exports, so routed goods aren't mistaken for evasion -------- #
    for code, name in cfg["hubs"].items():
        path = cache / "hubs" / f"reexport_{code}.parquet"
        if cached(path):
            print(f"  cached   {name} re-exports")
            continue
        print(f"  fetching {name} re-exports to Lebanon…")
        df = call_final(
            key,
            period=periods,
            reporterCode=str(code),
            cmdCode=cfg["commodity_level"],
            flowCode="RX",                       # re-exports specifically
            partnerCode=str(cfg["lebanon_code"]),
        )
        calls += 1
        if not df.empty:
            write_cache(df, path)
            print(f"    {len(df):,} rows")
        time.sleep(PAUSE_SECONDS)

    # -- Monthly, for the early-warning view -------------------------------- #
    if cfg["monthly"]["enabled"]:
        months = [f"{y}{m:02d}" for y in cfg["monthly"]["years"] for m in range(1, 13)]
        period_str = ",".join(months)
        for _, p in mirrorable.head(20).iterrows():
            code = int(p["partnerCode"])
            path = cache / "monthly" / f"{code}.parquet"
            if cached(path):
                continue
            print(f"  fetching monthly {p['partnerDesc']} ({code})…")
            df = call_final(
                key,
                freqCode="M",
                period=period_str,
                reporterCode=str(code),
                cmdCode="AG2",                   # chapter level is enough here
                flowCode="X",
                partnerCode=str(cfg["lebanon_code"]),
            )
            calls += 1
            if not df.empty:
                write_cache(df, path)
            time.sleep(PAUSE_SECONDS)

    # -- Reference tables, so codes can be labelled offline ----------------- #
    ref_path = cache / "reference"
    ref_path.mkdir(parents=True, exist_ok=True)
    for category, filename in [("cmd:HS", "hs.csv"), ("partner", "partner.csv")]:
        target = ref_path / filename
        if target.exists():
            continue
        try:
            ref = comtradeapicall.getReference(category)
            if ref is not None and not ref.empty:
                ref.to_csv(target, index=False)
                print(f"  reference {category}: {len(ref):,} rows")
        except Exception as exc:  # noqa: BLE001
            print(f"  reference {category} unavailable ({exc})")

    manifest = {
        "fetched_at": pd.Timestamp.utcnow().isoformat(),
        "years": cfg["years"],
        "directions": cfg["directions"],
        "commodity_level": cfg["commodity_level"],
        "breakdown_mode": cfg["breakdown_mode"],
        "partners": int(len(mirrorable)),
        "api_calls": calls,
        "source": "UN Comtrade (comtradeapi.un.org), free subscription",
    }
    (cache / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"\nDone. {calls} API calls used. Manifest written.")


# --------------------------------------------------------------------------- #
# Stage 4 — report                                                             #
# --------------------------------------------------------------------------- #

def stage_report(cfg: dict) -> None:
    cache = cache_dir(cfg)
    files = sorted(cache.rglob("*.parquet"))
    if not files:
        print("Cache is empty — run the fetch stage.")
        return

    total_rows = 0
    total_bytes = 0
    by_group: dict[str, list] = {}
    for f in files:
        group = f.parent.name
        df = pd.read_parquet(f, columns=["primaryValue"])
        total_rows += len(df)
        total_bytes += f.stat().st_size
        by_group.setdefault(group, []).append(len(df))

    print(f"Cache: {len(files)} files, {total_rows:,} rows, {total_bytes/1e6:.1f} MB\n")
    for group, counts in sorted(by_group.items()):
        print(f"  {group:<10} {len(counts):>3} files  {sum(counts):>10,} rows")

    manifest = cache / "manifest.json"
    if manifest.exists():
        print(f"\n{manifest.read_text()}")


# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(description="Download UN Comtrade data for Jamarik.")
    parser.add_argument("stage", choices=["check", "partners", "fetch", "report", "all"])
    args = parser.parse_args()

    cfg = load_config()

    if args.stage == "report":
        stage_report(cfg)
        return

    key = load_key()

    if args.stage in ("check", "all"):
        stage_check(cfg, key)
    if args.stage in ("partners", "all"):
        stage_partners(cfg, key)
    if args.stage in ("fetch", "all"):
        stage_fetch(cfg, key)
        stage_report(cfg)


if __name__ == "__main__":
    main()
