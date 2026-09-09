# Tariff — Phase 2

`pipeline/tariff.py` is the interim rule: chapter bands for MFN partners, zero
for EU/EFTA industrial goods and GAFTA goods, excise chapters always charged.

Phase 2 replaces the bands with Lebanon's applied tariff at HS-6, through the
same `duty_rate_for(hs4_or_hs6, partner)` signature so nothing downstream
changes.

## `lebanon_tariff_hs6.csv`

Place it in this directory. Columns:

| column | meaning |
|---|---|
| `hs6` | six-digit HS 2017 code, zero-padded, as Lebanon reports |
| `mfn_rate` | applied MFN ad-valorem rate as a fraction (0.05 = 5%) |
| `excise` | 1 when the line carries excise that is charged whatever the origin, else 0 |
| `vat_exempt` | 1 when the line is VAT-exempt on import (medicines, some foodstuffs), else 0 |

Source: WITS / UNCTAD TRAINS applied rates for Lebanon (latest year available),
with excise and VAT-exemption flags from the Lebanese Customs tariff.

## Loading

When the file is present, `duty_rate_for()` reads it once at import and:

- returns `mfn_rate` for MFN partners;
- returns 0 for EU/EFTA (chapters 25–97) and GAFTA partners unless `excise` is
  set, in which case the MFN rate stands;
- exposes `vat_exempt` so the VAT side of the estimate can skip exempt lines.

Absent the file, the interim bands apply. Not implemented yet.
