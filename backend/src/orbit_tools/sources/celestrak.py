"""
Celestrak: elementos GP (OMM) e o catálogo SATCAT.

O GP aceita um NORAD por consulta (CATNR), um grupo (GROUP), um nome (NAME) ou um designador
internacional (INTDES). Erros vêm como texto ("Invalid query…" com HTTP 200, "No GP data found"
com 404). Cada consulta fica em cache por `celestrak_cache_hours`, compartilhado entre usuários: o
Celestrak bloqueia quem repete a mesma consulta antes da atualização dos dados.
"""

from __future__ import annotations

import csv
import io
import json
import threading
import time
from dataclasses import dataclass
from typing import Literal

import httpx2

from ..cache import DiskCache
from ..settings import settings
from . import SourceError, http_client

QueryKind = Literal["catnr", "group", "name", "intdes"]
_PARAM = {"catnr": "CATNR", "group": "GROUP", "name": "NAME", "intdes": "INTDES"}


@dataclass
class GpResult:
    records: list[dict]
    not_found: list[str]
    from_cache: bool


def _gp_cache() -> DiskCache:
    return DiskCache(settings.data_dir / "cache" / "celestrak", settings.celestrak_cache_hours * 3600)


def fetch_gp(kind: QueryKind, values: list[str], transport: httpx2.BaseTransport | None = None) -> GpResult:
    """Elementos GP para cada valor da consulta (um pedido por valor, salvo os que estão no cache)."""
    cache = _gp_cache()
    records: list[dict] = []
    not_found: list[str] = []
    all_cached = True
    with http_client(transport) as client:
        for value in values:
            key = f"gp:{_PARAM[kind]}={value}"
            body = cache.get(key)
            if body is None:
                all_cached = False
                body = _request_gp(client, kind, value)
                cache.put(key, body)
            data = json.loads(body)
            if not data:
                not_found.append(value)
            records.extend(data)
    return GpResult(records, not_found, all_cached)


def _request_gp(client: httpx2.Client, kind: QueryKind, value: str) -> bytes:
    url = f"{settings.celestrak_url}/NORAD/elements/gp.php"
    try:
        res = client.get(url, params={_PARAM[kind]: value, "FORMAT": "json"})
    except httpx2.HTTPError as exc:
        raise SourceError(f"Celestrak indisponível: {exc}") from None
    text = res.text.strip()
    if res.status_code == 404 or text.startswith("No GP data found"):
        return b"[]"
    if res.status_code != 200 or not text.startswith("["):
        detail = text.splitlines()[0][:200] if text else f"HTTP {res.status_code}"
        status = 400 if text.startswith("Invalid query") else 502
        raise SourceError(f"Celestrak recusou a consulta {_PARAM[kind]}={value}: {detail}", status)
    return res.content


# --- SATCAT ----------------------------------------------------------------------------------------

SATCAT_FIELDS = ("OBJECT_TYPE", "RCS", "DECAY_DATE", "OPS_STATUS_CODE", "OWNER", "LAUNCH_DATE")
_satcat_lock = threading.Lock()
_satcat_memo: tuple[float, dict[int, dict]] | None = None


def satcat(transport: httpx2.BaseTransport | None = None) -> dict[int, dict]:
    """
    Catálogo SATCAT do Celestrak por NORAD (tipo de objeto, RCS, reentrada…), baixado no máximo uma
    vez por `satcat_cache_hours`. Se o download falhar, usa a última cópia; sem cópia, levanta erro.
    """
    global _satcat_memo
    with _satcat_lock:
        ttl = settings.satcat_cache_hours * 3600
        if _satcat_memo is not None and time.time() - _satcat_memo[0] < ttl:
            return _satcat_memo[1]
        cache = DiskCache(settings.data_dir / "cache" / "satcat", ttl)
        body = cache.get("satcat.csv")
        if body is None:
            try:
                with http_client(transport) as client:
                    res = client.get(f"{settings.celestrak_url}/pub/satcat.csv")
                    res.raise_for_status()
                body = res.content
                cache.put("satcat.csv", body)
            except httpx2.HTTPError as exc:
                stale = cache.get_stale("satcat.csv")
                if stale is None:
                    raise SourceError(f"SATCAT do Celestrak indisponível: {exc}") from None
                body = stale[0]
        table = _parse_satcat(body.decode("utf-8-sig"))
        _satcat_memo = (time.time(), table)
        return table


def _parse_satcat(text: str) -> dict[int, dict]:
    out: dict[int, dict] = {}
    for row in csv.DictReader(io.StringIO(text)):
        try:
            norad = int(row["NORAD_CAT_ID"])
        except (KeyError, ValueError):
            continue
        out[norad] = {k: row[k] for k in SATCAT_FIELDS if row.get(k)}
    return out


def clear_memo() -> None:
    """Para os testes."""
    global _satcat_memo
    with _satcat_lock:
        _satcat_memo = None
