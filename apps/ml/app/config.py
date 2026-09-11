"""Typed runtime settings loaded from environment variables (prefix `ML_`)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Service configuration. Every field has a safe local default."""

    model_config = SettingsConfigDict(env_prefix="ML_", extra="ignore")

    port: int = 8000
    log_level: str = "info"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance (cached after first load)."""
    return Settings()
