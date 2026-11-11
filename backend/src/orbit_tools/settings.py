from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Configuração por variáveis de ambiente com prefixo ORBIT_ (ex.: ORBIT_DATA_DIR)."""

    model_config = SettingsConfigDict(env_prefix="ORBIT_")

    # Build do frontend servido pelo próprio backend (produção). Ignorado se não existir.
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"
    cors_origins: list[str] = ["http://localhost:5173"]
    # Caches (consultas ao Celestrak, SATCAT, EOP, conjuntos de elementos). Em Docker, deve ser um volume.
    data_dir: Path = REPO_ROOT / "dados"
    # Locais e radares oferecidos a todos os usuários. Sem arquivo, os exemplos fictícios do pacote.
    # Uma instalação pode apontar para um arquivo seu, fora do git (mesmo formato de data/example_sites.json).
    sites_file: Path | None = None
    # Pontos por requisição de conversão
    max_points: int = 500_000

    # Fontes externas. O proxy, se houver, vem das variáveis padrão HTTPS_PROXY / NO_PROXY.
    celestrak_url: str = "https://celestrak.org"
    spacetrack_url: str = "https://www.space-track.org"
    http_timeout_s: float = 60.0
    # Validade dos caches
    celestrak_cache_hours: float = 2.0  # o Celestrak pede para não repetir a mesma consulta antes da atualização
    satcat_cache_hours: float = 24.0
    eop_cache_days: float = 7.0
    element_set_days: float = 7.0  # conjuntos enviados pelo navegador (por hash do conteúdo)
    # Manutenção em segundo plano (apagar caches vencidos, renovar o EOP); desligada nos testes
    maintenance: bool = True
    # Limites
    max_elements: int = 40_000  # conjuntos de elementos por requisição
    max_celestrak_ids: int = 100  # o Celestrak aceita um NORAD por consulta
    max_spacetrack_ids: int = 650  # como no app antigo
    max_history_days: float = 10.0  # intervalo de época no histórico do Space-Track
    # Busca de passagens: janela máxima e custo máximo (objetos × dias; ~1 s a cada 1 000 objeto·dia)
    max_search_days: float = 10.0
    max_object_days: float = 60_000.0
    # Pontos por trajetória consultada (globo, gráficos) e total de pontos de uma exportação
    max_trajectory_points: int = 200_000
    max_export_points: int = 30_000_000
    export_hours: float = 2.0  # validade dos ZIPs gerados


settings = Settings()
