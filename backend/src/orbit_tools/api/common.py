"""Funções comuns às rotas: datas da API, locais e busca de um conjunto de elementos."""

from datetime import UTC, datetime

import numpy as np
from fastapi import HTTPException

from ..core.elements import Record
from ..core.geodesy import GeodeticPoint
from ..core.time import parse_utc
from .schemas import Site


def utc(dt: datetime) -> np.datetime64:
    """datetime da API (sem fuso = UTC) → datetime64[ns] UTC."""
    return parse_utc(dt.astimezone(UTC).replace(tzinfo=None) if dt.tzinfo else dt)


def point(site: Site) -> GeodeticPoint:
    return GeodeticPoint(site.lat, site.lon, site.height)


def find_record(records: list[Record], norad: int, epoch: str) -> Record:
    for r in records:
        if int(r["NORAD_CAT_ID"]) == norad and r["EPOCH"] == epoch:
            return r
    raise HTTPException(404, f"Elementos de {norad} com época {epoch} não estão no conjunto.")
