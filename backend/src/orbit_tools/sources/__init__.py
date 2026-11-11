"""Clientes das fontes externas (Celestrak, Space-Track, EOP). Requer o extra `server`."""

from __future__ import annotations

import httpx2

from .. import __version__
from ..settings import settings

# Só o nome e a versão do software: nada que identifique o usuário ou a instalação
USER_AGENT = f"orbit-tools/{__version__}"


class SourceError(Exception):
    """Falha de uma fonte externa; a mensagem é mostrada ao usuário."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


# Os testes trocam a rede por um httpx2.MockTransport aqui
test_transport: httpx2.BaseTransport | None = None


def http_client(transport: httpx2.BaseTransport | None = None) -> httpx2.Client:
    """Cliente HTTP comum. Respeita HTTPS_PROXY / NO_PROXY do ambiente."""
    return httpx2.Client(
        timeout=settings.http_timeout_s,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
        transport=transport or test_transport,
    )
