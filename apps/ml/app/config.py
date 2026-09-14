"""Typed runtime settings loaded from environment variables (prefix `ML_`)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

#: Artefacts ship inside the package, so the default works in the container and
#: in a checkout alike.
DEFAULT_MODEL_DIR = Path(__file__).resolve().parent / "models"


class Settings(BaseSettings):
    """Service configuration. Every field has a safe local default."""

    model_config = SettingsConfigDict(env_prefix="ML_", extra="ignore")

    port: int = 8000
    log_level: str = "info"
    #: Where the trained valuation artefact is read from.
    model_dir: Path = DEFAULT_MODEL_DIR


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance (cached after first load)."""
    return Settings()
