# Yerevan apartment listings, May 2021

Real asking prices, for training the valuation model.

| | |
| --- | --- |
| `flats.csv` | the source, unchanged |
| `training.csv` | the same rows in the shape `train.py --csv` reads |
| Rows | 7 040 in, **7 037 out** |
| Collected | May 2021 |
| Sources | list.am and estate.am |
| Collected by | the author, for an earlier project (EstimateYVN) |

Both files are committed, so a retrain is reproducible on a machine with no
network — the same rule the OpenStreetMap boundaries follow. Nothing in the
seed or the service fetches either of them.

## Why this exists

The model was trained on the seeded catalogue: 300 listings whose prices the
seed generates from a structural formula plus log-normal noise. A model trained
on that is measured on how well it recovers a formula that is committed a few
directories away, not on how well it predicts the Armenian market. The reported
error was flattering for a reason that had nothing to do with the model.

These are prices people actually asked.

## What was changed on the way in

`scripts/convert-yerevan-2021.ts` does the mapping and prints what it dropped.

**Currency.** Prices are in dollars. Converted once at **503.8 AMD/USD**, the
CBA 2021 annual average, confirmed by the author. Training in dollars and
converting when serving would put a floating rate between the model and its own
output, so a valuation would move when nothing about the property had.

**Districts.** All twelve map one-to-one onto the product's Yerevan slugs.

**Building type.** `panelayin` and `kasetayin` → `PANEL`; `qare` and `aghyuse`
→ `STONE` (the vocabulary has no separate brick); `monolit` → `MONOLITH`. A row
flagged `norakaruyc` becomes `NEW_BUILD`, because the product models "new build"
as a type rather than a flag; that costs the structural type of those rows.
`payte` (wooden) has no counterpart and is dropped — two rows.

**Condition.** Three levels against the product's five:
`bad_cond` → `NEEDS_REPAIR`, `norm_cond` → `GOOD`, `good_cond` →
`EURO_RENOVATION`, the last because `good_cond` meant renovated. `OLD_RENOVATION`
and `DESIGNER` go unused: the scrape did not distinguish them, and inventing the
distinction would put detail in the training set that nobody observed.

**Rows dropped:** 2 wooden buildings, 1 with the flat above the top floor.

## What this dataset does not have

Left **blank**, never guessed — a blank is a fact about the scrape, a plausible
number would be a fact about nothing:

`construction_year`, `lat`/`lon`, `heating`, `living_area`, `kitchen_area`,
`ceiling_height`, `has_loggia`, `has_parking`, `has_storage`,
`seismic_retrofit`, `ownership_docs`.

Two of those matter. `building_age` and `distance_to_centre_m` are derived from
`construction_year` and the coordinates, and both are currently among the
model's largest contributors. A model trained here will score worse than the
one trained on generated data, and that difference is the finding, not a
regression.

## Regenerating

```bash
pnpm --filter @smartestate/api exec tsx ../../apps/ml/scripts/convert-yerevan-2021.ts
```

Deterministic: same input, same `training.csv`, including the identifiers.

## Per-district median, for calibration

Medians of asking price per m², 2021, from the rows kept. They are candidates
to replace the hand-set constants in `prisma/seed/data/calibration.ts`, which
would make the synthetic catalogue calibrated to measurement rather than to
estimate.

| District | n | USD/m² | AMD/m² |
| --- | ---: | ---: | ---: |
| Kentron | 1375 | 1 579 | 795 500 |
| Arabkir | 1097 | 1 159 | 583 900 |
| Nork-Marash | 23 | 1 077 | 542 600 |
| Davtashen | 280 | 974 | 490 700 |
| Kanaker-Zeytun | 493 | 917 | 461 900 |
| Ajapnyak | 791 | 879 | 442 800 |
| Avan | 346 | 864 | 435 300 |
| Shengavit | 703 | 860 | 433 300 |
| Erebuni | 373 | 833 | 419 700 |
| Nor Nork | 922 | 833 | 419 700 |
| Malatia-Sebastia | 600 | 810 | 408 100 |
| Nubarashen | 34 | 603 | 303 800 |

## Still to do

1. Relax the training CSV loader: `construction_year`, `heating`,
   `ownership_docs`, `lat` and `lon` are currently required columns.
2. Retrain from `training.csv` and publish the metrics. The FAQ reads them from
   the model, so it updates itself.
3. Decide whether the catalogue moves to 2021 price levels using the medians
   above. Model and catalogue must agree on an era, or every listing reads as
   mispriced.
