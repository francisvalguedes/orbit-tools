import logging
import threading
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..cache import DiskCache
from ..settings import settings
from ..sources import SourceError, celestrak
from ..sources import eop as eop_source
from . import element_sets
from .routes import routers

log = logging.getLogger(__name__)
MAINTENANCE_INTERVAL_S = 12 * 3600


def maintenance() -> None:
    """Apaga caches vencidos e renova o EOP quando tem mais de `eop_cache_days`."""
    removed = element_sets.purge()
    removed += DiskCache(settings.data_dir / "cache" / "celestrak", settings.celestrak_cache_hours * 3600).purge()
    if removed:
        log.info("manutenção: %d arquivos de cache vencidos apagados", removed)
    try:
        celestrak.satcat()  # baixa ou renova antes da primeira consulta de usuário (~7 MB)
    except SourceError as exc:
        log.warning("SATCAT indisponível: %s", exc)
    if eop_source.needs_refresh() and not eop_source.refresh():
        log.warning("EOP não renovado; continua o anterior (%s)", eop_source.current().source)


@asynccontextmanager
async def lifespan(app: FastAPI):
    stop = threading.Event()

    def loop() -> None:
        while True:
            try:
                maintenance()
            except Exception:
                log.exception("falha na manutenção")
            if stop.wait(MAINTENANCE_INTERVAL_S):
                return

    if settings.maintenance:
        threading.Thread(target=loop, daemon=True, name="manutencao").start()
    yield
    stop.set()


app = FastAPI(
    title="orbit-tools",
    version=__version__,
    description="Elementos orbitais, passagens sobre sensores, trajetórias para rastreio e conversões de coordenadas.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
for router in routers:
    app.include_router(router)

# Os JS e CSS do Vite têm hash no nome e podem ficar em cache; o index.html não, senão o navegador
# continua carregando a versão anterior do app depois de uma atualização.
INDEX_HEADERS = {"Cache-Control": "no-cache"}


def mount_frontend(app: FastAPI, dist: Path) -> None:
    """Serve o frontend compilado (produção); não faz nada se o build não existir."""
    index = dist / "index.html"
    if not index.exists():
        return
    app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")
    if (dist / "cesium").exists():
        app.mount("/cesium", StaticFiles(directory=dist / "cesium"), name="cesium")

    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str) -> FileResponse:
        file = (dist / path).resolve()
        if path and file.is_file() and file.is_relative_to(dist.resolve()) and file != index.resolve():
            return FileResponse(file)
        return FileResponse(index, headers=INDEX_HEADERS)


# Em produção o backend também serve o frontend compilado (um único processo).
mount_frontend(app, settings.frontend_dist)
