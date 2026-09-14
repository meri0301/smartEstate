"""
Reading and writing the trained artefact.

A model is three LightGBM boosters and a JSON description of how it was built.
The boosters are saved in LightGBM's own text format rather than pickled: a
pickle is tied to the exact library version that wrote it and executes code on
load, while the text format is portable, reviewable in a diff, and safe to ship.

`metadata.json` is what makes a prediction reproducible. It records the feature
order, the category vocabularies, the reference year used for building age and a
fingerprint of the training set, so a stored valuation can always be traced to
the model and data that produced it.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Final

import lightgbm as lgb

MODEL_FILENAME: Final[str] = "valuation.txt"
QUANTILE_LOW_FILENAME: Final[str] = "valuation-q10.txt"
QUANTILE_HIGH_FILENAME: Final[str] = "valuation-q90.txt"
METADATA_FILENAME: Final[str] = "metadata.json"

#: Bumped when the artefact layout changes in a way older readers cannot handle.
ARTIFACT_SCHEMA_VERSION: Final[int] = 1


class ArtifactError(RuntimeError):
    """The artefact directory is missing, incomplete, or of an unreadable version."""


@dataclass(frozen=True, slots=True)
class ModelMetadata:
    """Everything needed to rebuild the input to a stored model, and to cite it."""

    model_version: str
    trained_at: str
    feature_columns: tuple[str, ...]
    districts: tuple[str, ...]
    market_reference_year: int
    target: str
    quantiles: tuple[float, float]
    #: Conformal widening applied to the raw quantile interval, on the log scale.
    interval_log_offset: float
    target_coverage: float
    training_rows: int
    dataset_fingerprint: str
    lightgbm_version: str
    metrics: dict[str, Any]
    schema_version: int = ARTIFACT_SCHEMA_VERSION

    def to_json(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "modelVersion": self.model_version,
            "trainedAt": self.trained_at,
            "featureColumns": list(self.feature_columns),
            "districts": list(self.districts),
            "marketReferenceYear": self.market_reference_year,
            "target": self.target,
            "quantiles": {"low": self.quantiles[0], "high": self.quantiles[1]},
            "intervalLogOffset": self.interval_log_offset,
            "targetCoverage": self.target_coverage,
            "trainingRows": self.training_rows,
            "datasetFingerprint": self.dataset_fingerprint,
            "lightgbmVersion": self.lightgbm_version,
            "metrics": self.metrics,
        }

    @classmethod
    def from_json(cls, payload: dict[str, Any]) -> ModelMetadata:
        schema_version = int(payload.get("schemaVersion", 0))
        if schema_version != ARTIFACT_SCHEMA_VERSION:
            raise ArtifactError(
                f"artefact schema version {schema_version} is not readable by this service "
                f"(expected {ARTIFACT_SCHEMA_VERSION}); retrain the model"
            )
        quantiles = payload.get("quantiles", {})
        return cls(
            model_version=str(payload["modelVersion"]),
            trained_at=str(payload["trainedAt"]),
            feature_columns=tuple(payload["featureColumns"]),
            districts=tuple(payload["districts"]),
            market_reference_year=int(payload["marketReferenceYear"]),
            target=str(payload["target"]),
            quantiles=(float(quantiles["low"]), float(quantiles["high"])),
            interval_log_offset=float(payload["intervalLogOffset"]),
            target_coverage=float(payload["targetCoverage"]),
            training_rows=int(payload["trainingRows"]),
            dataset_fingerprint=str(payload["datasetFingerprint"]),
            lightgbm_version=str(payload["lightgbmVersion"]),
            metrics=dict(payload.get("metrics", {})),
            schema_version=schema_version,
        )


@dataclass(frozen=True, slots=True)
class ValuationArtifact:
    """The three boosters and their description, already in memory."""

    median: lgb.Booster
    quantile_low: lgb.Booster
    quantile_high: lgb.Booster
    metadata: ModelMetadata


def artifact_exists(directory: Path) -> bool:
    """True when every file a load needs is present."""
    return all(
        (directory / name).is_file()
        for name in (
            MODEL_FILENAME,
            QUANTILE_LOW_FILENAME,
            QUANTILE_HIGH_FILENAME,
            METADATA_FILENAME,
        )
    )


def load_artifact(directory: Path) -> ValuationArtifact:
    """Read an artefact, or explain precisely what is missing."""
    if not directory.is_dir():
        raise ArtifactError(f"no model directory at {directory}")
    missing = [
        name
        for name in (
            MODEL_FILENAME,
            QUANTILE_LOW_FILENAME,
            QUANTILE_HIGH_FILENAME,
            METADATA_FILENAME,
        )
        if not (directory / name).is_file()
    ]
    if missing:
        raise ArtifactError(f"model directory {directory} is missing {', '.join(missing)}")

    metadata = ModelMetadata.from_json(
        json.loads((directory / METADATA_FILENAME).read_text(encoding="utf-8"))
    )
    return ValuationArtifact(
        median=lgb.Booster(model_file=str(directory / MODEL_FILENAME)),
        quantile_low=lgb.Booster(model_file=str(directory / QUANTILE_LOW_FILENAME)),
        quantile_high=lgb.Booster(model_file=str(directory / QUANTILE_HIGH_FILENAME)),
        metadata=metadata,
    )


def save_artifact(
    directory: Path,
    median: lgb.Booster,
    quantile_low: lgb.Booster,
    quantile_high: lgb.Booster,
    metadata: ModelMetadata,
) -> None:
    """Write the artefact, replacing whatever was there."""
    directory.mkdir(parents=True, exist_ok=True)
    median.save_model(str(directory / MODEL_FILENAME))
    quantile_low.save_model(str(directory / QUANTILE_LOW_FILENAME))
    quantile_high.save_model(str(directory / QUANTILE_HIGH_FILENAME))
    (directory / METADATA_FILENAME).write_text(
        json.dumps(metadata.to_json(), indent=2, ensure_ascii=False, sort_keys=False) + "\n",
        encoding="utf-8",
    )


def build_model_version(fingerprint: str, trained_at: datetime | None = None) -> str:
    """
    A version that says when the model was trained and on what.

    The fingerprint half means two models trained from different data can never
    share a version, which matters because every stored valuation cites one.
    """
    stamp = (trained_at or datetime.now(UTC)).strftime("%Y%m%d")
    return f"valuation-lgbm-{stamp}-{fingerprint[:8]}"
