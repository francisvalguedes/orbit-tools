"""
Arquivo de orientação da Terra (EOP): baixado do IERS (com USNO e Celestrak como alternativas) e
guardado em `data_dir/eop/`. Renovado quando tem mais de `eop_cache_days`; se o download falhar,
continua com a última cópia. Sem nenhuma cópia, `EOP.zero()` (UT1 = UTC, polo nulo).
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable

import httpx2

from ..core.eop import EOP, parse_celestrak_csv, parse_finals2000a
from ..settings import settings
from . import http_client

log = logging.getLogger(__name__)

SOURCES: list[tuple[str, str, Callable[[str, str], EOP]]] = [
    ("IERS", "https://datacenter.iers.org/data/9/finals2000A.all", parse_finals2000a),
    ("USNO", "https://maia.usno.navy.mil/ser7/finals2000A.all", parse_finals2000a),
    ("Celestrak", "https://celestrak.org/SpaceData/EOP-All.csv", parse_celestrak_csv),
]

_lock = threading.Lock()
_current: tuple[EOP, float] | None = None  # (EOP, idade do arquivo em s no carregamento)


def _dir():
    return settings.data_dir / "eop"


def _load_from_disk() -> tuple[EOP, float] | None:
    for name, _, parser in SOURCES:
        path = _dir() / f"{name}.txt"
        if path.exists():
            try:
                return parser(path.read_text(), f"{name} ({path.name})"), time.time() - path.stat().st_mtime
            except ValueError:
                log.warning("arquivo EOP inválido: %s", path)
    return None


def refresh(transport: httpx2.BaseTransport | None = None) -> bool:
    """Baixa o EOP da primeira fonte que responder. Devolve True se atualizou."""
    global _current
    with http_client(transport) as client:
        for name, url, parser in SOURCES:
            try:
                res = client.get(url)
                res.raise_for_status()
                eop = parser(res.text, name)
            except (httpx2.HTTPError, ValueError) as exc:
                log.warning("EOP de %s indisponível: %s", name, exc)
                continue
            _dir().mkdir(parents=True, exist_ok=True)
            for other, _, _ in SOURCES:  # um arquivo só: o mais recente
                (_dir() / f"{other}.txt").unlink(missing_ok=True)
            (_dir() / f"{name}.txt").write_text(res.text)
            with _lock:
                _current = (eop, 0.0)
            log.info("EOP atualizado de %s", name)
            return True
    return False


def current() -> EOP:
    """EOP em uso (lido do disco na primeira chamada)."""
    global _current
    with _lock:
        if _current is None:
            _current = _load_from_disk() or (EOP.zero(), float("inf"))
        return _current[0]


def needs_refresh() -> bool:
    current()
    path_age = min(
        (time.time() - p.stat().st_mtime for p in _dir().glob("*.txt")),
        default=float("inf"),
    )
    return path_age > settings.eop_cache_days * 86400


def reset() -> None:
    """Para os testes."""
    global _current
    with _lock:
        _current = None
