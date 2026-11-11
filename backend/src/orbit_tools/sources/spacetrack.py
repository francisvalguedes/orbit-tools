"""
Space-Track: elementos GP e histórico, com a conta do próprio usuário.

As credenciais chegam na requisição, servem para um login e são descartadas: nunca vão para disco
nem para o log. O acordo de uso do Space-Track proíbe redistribuir os dados, então nada daqui entra
nos caches compartilhados.

Limites do Space-Track: 30 requisições por minuto e 300 por hora por conta. Como a conta é do
usuário mas o servidor pode ser compartilhado, há também um limite global conservador aqui.
"""

from __future__ import annotations

import threading
import time
from collections import deque
from datetime import date

import httpx2

from ..settings import settings
from . import SourceError, http_client

_QUERY = "/basicspacedata/query"
# Filtro LEO do app antigo: movimento médio > 11,25 rev/dia, sem reentrada, RCS grande, perigeu < 500 km,
# época de até 1 dia atrás
LEO_FILTER = (
    "/class/gp/MEAN_MOTION/>11.25/DECAY_DATE/null-val/RCS_SIZE/Large/PERIAPSIS/<500"
    "/EPOCH/>now-1/orderby/EPOCH desc/format/json"
)


class _RateLimit:
    """Janela deslizante: no máximo `per_minute` e `per_hour` requisições ao Space-Track neste processo."""

    def __init__(self, per_minute: int = 20, per_hour: int = 250):
        self.per_minute = per_minute
        self.per_hour = per_hour
        self._times: deque[float] = deque()
        self._lock = threading.Lock()

    def acquire(self, n: int = 1) -> None:
        with self._lock:
            now = time.monotonic()
            while self._times and now - self._times[0] > 3600:
                self._times.popleft()
            last_minute = sum(1 for t in self._times if now - t < 60)
            if last_minute + n > self.per_minute or len(self._times) + n > self.per_hour:
                raise SourceError(
                    "Limite de consultas ao Space-Track atingido neste servidor; tente de novo em alguns minutos.", 429
                )
            self._times.extend([now] * n)


rate_limit = _RateLimit()


class SpaceTrack:
    """Sessão de uma requisição: login, consultas, logout."""

    def __init__(self, username: str, password: str, transport: httpx2.BaseTransport | None = None):
        self._username = username
        self._password = password
        self._client = http_client(transport)
        self._base = settings.spacetrack_url

    def __enter__(self) -> SpaceTrack:
        rate_limit.acquire()
        try:
            res = self._client.post(
                f"{self._base}/ajaxauth/login", data={"identity": self._username, "password": self._password}
            )
        except httpx2.HTTPError as exc:
            self._client.close()
            raise SourceError(f"Space-Track indisponível: {exc}") from None
        finally:
            self._password = ""  # não fica na memória além do login
        if res.status_code != 200 or "Failed" in res.text:
            self._client.close()
            raise SourceError("Login no Space-Track recusado: confira usuário e senha.", 401)
        return self

    def __exit__(self, *exc) -> None:
        try:
            self._client.get(f"{self._base}/ajaxauth/logout")
        except httpx2.HTTPError:
            pass
        finally:
            self._client.close()

    def _get(self, path: str) -> list[dict]:
        rate_limit.acquire()
        try:
            res = self._client.get(f"{self._base}{_QUERY}{path}")
        except httpx2.HTTPError as exc:
            raise SourceError(f"Space-Track indisponível: {exc}") from None
        if res.status_code == 401:
            raise SourceError("Sessão do Space-Track recusada.", 401)
        if res.status_code != 200:
            raise SourceError(f"Space-Track respondeu HTTP {res.status_code}: {res.text[:200]}")
        try:
            data = res.json()
        except ValueError:
            raise SourceError(f"Resposta inesperada do Space-Track: {res.text[:200]}") from None
        if isinstance(data, dict) and "error" in data:
            raise SourceError(f"Space-Track: {data['error']}", 400)
        if not isinstance(data, list):
            raise SourceError("Resposta inesperada do Space-Track.")
        return data

    def latest(self, norad_ids: list[int]) -> list[dict]:
        """Últimos elementos de cada objeto."""
        ids = ",".join(str(i) for i in norad_ids)
        return self._get(f"/class/gp/NORAD_CAT_ID/{ids}/orderby/NORAD_CAT_ID asc/format/json")

    def leo_filter(self) -> list[dict]:
        return self._get(LEO_FILTER)

    def history(self, norad_ids: list[int], start: date, end: date) -> list[dict]:
        """Todos os conjuntos publicados com época no intervalo (para a comparação de órbitas)."""
        ids = ",".join(str(i) for i in norad_ids)
        epoch = f"{start:%Y-%m-%d}--{end:%Y-%m-%d}"
        return self._get(
            f"/class/gp_history/NORAD_CAT_ID/{ids}/EPOCH/{epoch}/orderby/NORAD_CAT_ID desc,EPOCH desc/format/json"
        )
