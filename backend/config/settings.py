"""Application settings loaded from environment variables (no magic numbers in code)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration comes from ENV / .env file."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Application
    app_name: str = "Rack Insight"
    app_version: str = "1.1.2"
    debug: bool = False
    api_prefix: str = "/api"
    cors_origins: str = "http://localhost:5173,http://localhost:3000,http://localhost"

    # Database
    database_url: str = "postgresql+asyncpg://rackinsight:rackinsight@postgres:5432/rackinsight"

    # Redis
    redis_url: str = "redis://redis:6379/0"
    cache_ttl_seconds: int = 600

    # Auth / JWT
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # Credential encryption (Fernet key, 32 url-safe base64 bytes)
    encryption_key: str = "0RPYS0nOu5f5xkbXi3wYlLYasNci4RMOtayEqUKmyNI="

    # Default admin bootstrap
    default_admin_username: str = "admin"
    default_admin_password: str = "admin123!"

    # Collector
    collector_timeout_seconds: int = 10
    collector_retry_count: int = 3
    collector_version: str = "1.0.0"

    # Scheduler
    scheduler_enabled: bool = True
    scheduler_interval_seconds: int = 1800

    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
