from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Configuração por variáveis de ambiente com prefixo ORBIT_ (ex.: ORBIT_DATA_DIR)."""

    model_config = SettingsConfigDict(env_prefix="ORBIT_")

    # Build do frontend servido pelo próprio backend (produção). Ignorado se não existir.
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Caches (consultas ao Celestrak, EOP, conjuntos de elementos). Em Docker, deve ser um volume.
    data_dir: Path = REPO_ROOT / "dados"


settings = Settings()
