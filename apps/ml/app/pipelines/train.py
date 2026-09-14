"""
Training entry point: `python -m app.pipelines.train` or `pnpm ml:train`.

The run does four things in order, and refuses to continue if any of them looks
wrong: read and check the dataset, validate the model two ways, fit the final
boosters on everything, then write the artefact and the evaluation chapter
together so the deployed model and its published numbers can never disagree.
"""

from __future__ import annotations

import argparse
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import lightgbm as lgb
import numpy as np

from app.pipelines import dataset as dataset_module
from app.pipelines.artifact import ModelMetadata, build_model_version, save_artifact
from app.pipelines.evaluate import (
    QUANTILE_HIGH,
    QUANTILE_LOW,
    TARGET_COVERAGE,
    CrossValidationResult,
    cross_validate,
    feature_importance,
    fit_booster,
    summarise,
)
from app.pipelines.features import (
    FEATURE_COLUMNS,
    MARKET_REFERENCE_YEAR,
    build_feature_frame,
    price_per_sqm,
    to_log_target,
)
from app.pipelines.report import render_report

DEFAULT_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="smartestate-train",
        description="Train the SmartEstate price valuation model.",
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument(
        "--database-url",
        default=os.environ.get("DATABASE_URL"),
        help="Postgres connection string; defaults to $DATABASE_URL.",
    )
    source.add_argument(
        "--csv",
        type=Path,
        help="Train from an exported dataset instead of a live database.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_MODEL_DIR,
        help="Where the artefact is written (default: app/models).",
    )
    parser.add_argument(
        "--report",
        type=Path,
        help="Write the evaluation chapter here, e.g. docs/thesis/evaluation.md.",
    )
    parser.add_argument(
        "--export-csv",
        type=Path,
        help="Also save the training set, so the run can be reproduced without the database.",
    )
    parser.add_argument(
        "--min-rows",
        type=int,
        default=50,
        help="Refuse to train on fewer listings than this (default: 50).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Evaluate and print the metrics without writing anything.",
    )
    return parser.parse_args(argv)


def load_rows(args: argparse.Namespace) -> list[dict[str, Any]]:
    """Read the training set from whichever source was named."""
    if args.csv is not None:
        if not args.csv.is_file():
            raise dataset_module.DatasetError(f"no dataset at {args.csv}")
        return dataset_module.load_from_csv(args.csv)
    if not args.database_url:
        raise dataset_module.DatasetError(
            "no data source: pass --csv, or set DATABASE_URL / --database-url"
        )
    return dataset_module.load_from_postgres(args.database_url)


def fit_final_models(
    rows: list[dict[str, Any]],
    districts: tuple[str, ...],
) -> tuple[lgb.Booster, lgb.Booster, lgb.Booster]:
    """Refit on the whole dataset once validation has decided the model is worth shipping."""
    frame = build_feature_frame(rows, districts)
    prices = np.asarray([float(row["price_amd"]) for row in rows], dtype="float64")
    areas = np.asarray([float(row["total_area"]) for row in rows], dtype="float64")
    log_target = np.asarray(to_log_target(price_per_sqm(prices, areas)), dtype="float64")

    median = fit_booster(frame, log_target)
    low = fit_booster(frame, log_target, objective="quantile", alpha=QUANTILE_LOW)
    high = fit_booster(frame, log_target, objective="quantile", alpha=QUANTILE_HIGH)
    return median, low, high


def _print_summary(results: dict[str, CrossValidationResult]) -> None:
    for scheme in ("random", "grouped"):
        result = results[scheme]
        model = result.model
        baseline = result.baseline
        print(
            f"{scheme:>8} cv ({result.folds} folds): "
            f"MAE {model.mae_amd:>12,.0f} AMD  MAPE {model.mape:6.1%}  R² {model.r2:6.3f}  "
            f"| baseline MAE {baseline.mae_amd:>12,.0f} AMD  "
            f"| coverage {result.coverage:5.1%} -> {result.coverage_calibrated:5.1%}"
        )


def run(args: argparse.Namespace) -> int:
    rows = load_rows(args)
    dataset_module.validate(rows, minimum_rows=args.min_rows)
    districts = dataset_module.districts_of(rows)
    fingerprint = dataset_module.fingerprint(rows)
    print(f"dataset: {len(rows)} listings, {len(districts)} districts, {fingerprint[:16]}…")

    results = {
        "random": cross_validate(rows, districts, "random"),
        "grouped": cross_validate(rows, districts, "grouped"),
    }
    _print_summary(results)

    if args.dry_run:
        print("dry run: nothing written")
        return 0

    median, low, high = fit_final_models(rows, districts)
    trained_at = datetime.now(UTC)
    metadata = ModelMetadata(
        model_version=build_model_version(fingerprint, trained_at),
        trained_at=trained_at.isoformat(timespec="seconds"),
        feature_columns=FEATURE_COLUMNS,
        districts=districts,
        market_reference_year=MARKET_REFERENCE_YEAR,
        target="log_price_per_sqm_amd",
        quantiles=(QUANTILE_LOW, QUANTILE_HIGH),
        # Calibrated on the random folds: they are the larger sample and the
        # regime the service actually serves, since a listing it is asked about
        # is almost always in a district it was trained on.
        interval_log_offset=results["random"].log_offset,
        target_coverage=TARGET_COVERAGE,
        training_rows=len(rows),
        dataset_fingerprint=fingerprint,
        lightgbm_version=lgb.__version__,
        metrics=summarise(results.values()),
    )

    save_artifact(args.output_dir, median, low, high, metadata)
    print(f"model:   {metadata.model_version} -> {args.output_dir}")

    if args.export_csv is not None:
        dataset_module.write_csv(rows, args.export_csv)
        print(f"dataset: exported to {args.export_csv}")

    if args.report is not None:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(
            render_report(
                model_version=metadata.model_version,
                trained_at=metadata.trained_at,
                training_rows=metadata.training_rows,
                districts=districts,
                dataset_fingerprint=fingerprint,
                results=results,
                importance=feature_importance(median),
                lightgbm_version=lgb.__version__,
            ),
            encoding="utf-8",
        )
        print(f"report:  {args.report}")

    return 0


def main(argv: list[str] | None = None) -> int:
    """CLI wrapper that turns an expected failure into a message, not a traceback."""
    args = parse_args(argv)
    try:
        return run(args)
    except dataset_module.DatasetError as error:
        print(f"training aborted: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":  # pragma: no cover - exercised through the console script
    raise SystemExit(main())
