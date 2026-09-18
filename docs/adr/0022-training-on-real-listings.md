# ADR-0022: The model trains on real listings, and the catalogue moves to meet it

Status: accepted
Date: 2026-09-18

## Context

The valuation model was trained on the seeded catalogue: 300 listings whose
prices `prisma/seed` generates from a structural formula plus log-normal noise.

That is circular. The seed multiplies a district median by factors for building
type, condition, floor and ceiling height; LightGBM is then asked to recover
those factors from the output. It reported 12.8% error and an R² of 0.93, and
both were measuring how well a gradient-boosted tree can invert a formula
committed a few directories away. Nothing about them said whether the model
could price a flat in Yerevan.

The author had 7 040 real listings, scraped from list.am and estate.am in May
2021 for an earlier project, with the columns this model needs.

## Decision

### Train on the real listings; keep the catalogue generated

The catalogue stays synthetic because it needs photographs, addresses,
translations and coordinates that the scrape has no columns for, and inventing
those per row is the fabrication this project has spent its time avoiding. The
model, which needs none of them, trains on what was actually observed.

### Nothing absent is filled in

The scrape records no construction year, no coordinates, no heating, no
room-level areas or ceiling height. Twelve optional features are absent from
every row and the training run says so out loud:

```
12 optional feature(s) absent from every row and therefore unused:
ceiling_height, construction_year, has_loggia, has_parking, has_storage,
heating, kitchen_area, lat, living_area, lon, ownership_docs, seismic_retrofit
```

`building_age` and `distance_to_centre_m` were among the largest contributors
to the previous model, and both are now unavailable. They could have been
imputed — a district median year, a district centroid — and the model would
have scored better. It would have scored better on invented inputs.

`REQUIRED_COLUMNS` was split accordingly: nine columns must be present _and
populated_, the rest may be missing. The "populated" half is new, because a
column of empty strings satisfied the old key check and taught the model
nothing.

### One conversion, at the boundary

Prices are in dollars and everything downstream is dram. Converted once at
**503.8 AMD/USD**, the CBA 2021 average, at the point the file is prepared.
Converting at serving time would put a floating rate between the model and its
own output, so a valuation would change when nothing about the property had.

### The catalogue moves to 2021

A model trained on 2021 prices and a catalogue calibrated to 2025 would call
every listing wildly overpriced — not because it was, but because they
disagreed about the year.

So the twelve Yerevan medians in `calibration.ts` are now **measured**: the
median asking price per m² of the real listings in each district. The synthetic
catalogue is calibrated to observation rather than to estimate, which is a
second gain that was not the point of the exercise.

The three towns outside Yerevan are not in the scrape and keep estimates,
scaled by the median ratio between the measured Yerevan figures and the ones
they replaced (0.728). They are the only assumed prices left in the file.

## Consequences

The reported accuracy got worse, and that is the finding:

|                  | Synthetic, 300 rows | **Real, 7 037 rows** |
| ---------------- | ------------------- | -------------------- |
| Random CV, MAPE  | 12.8%               | **17.3%**            |
| Random CV, R²    | 0.93                | **0.73**             |
| Grouped CV, MAPE | 24.4%               | **22.7%**            |
| Grouped CV, R²   | 0.53                | **0.32**             |

The within-distribution collapse is the circularity leaving. R² falls from 0.93
to 0.73 because the model is no longer recovering a formula, and the 0.93 was
never a statement about Yerevan.

The grouped error — hold out a whole district, predict somewhere the model has
never been — barely moved, and improved slightly. That is the number worth
quoting, and it is now honest.

Everything published updates itself: the FAQ reads the metrics from the model
rather than from the copy, so it already states 17.3% and 22.7%.

The catalogue now describes 2021. That is a visible consequence — prices on
screen are lower than a buyer would see today — and the alternative was a
catalogue and a model that disagreed.

## Alternatives considered

**Impute the missing features.** A district median construction year and a
district centroid would restore two strong features and raise the score. They
would also be the model's own priors fed back to it as evidence, which is the
circularity this ADR exists to remove, in a smaller font.

**Import the 7 037 as the catalogue.** Most faithful to the data, and it would
need a fabricated address, photograph, description and coordinate for every
row.

**Leave the catalogue at 2025 and index the training prices forward.** Requires
a residential price index for Armenia 2021→2025. There is one, and this project
does not have it; inventing a multiplier to avoid moving the catalogue would be
the invented statistic again.
