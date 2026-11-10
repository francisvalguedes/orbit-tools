from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..settings import settings
from .routes import router

app = FastAPI(
    title="orbit-tools",
    version=__version__,
    description="Elementos orbitais, passagens sobre sensores, trajetórias para rastreio e conversões de coordenadas.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
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
