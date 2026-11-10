"""orbit-tools: propagação de órbita, passagens, trajetórias para rastreio e conversões de coordenadas."""

from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("orbit-tools")
except PackageNotFoundError:  # código rodando sem instalação
    __version__ = "0.0.0"


def main() -> None:
    """Servidor de desenvolvimento: `uv run orbit-tools` (em produção, uvicorn com --host/--port)."""
    import uvicorn

    uvicorn.run("orbit_tools.api.main:app", host="127.0.0.1", port=8000, reload=True)
