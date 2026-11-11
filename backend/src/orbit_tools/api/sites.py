"""
Locais e radares oferecidos a todos os usuários.

Lidos de `config/local/locais.csv` e `config/local/radares.csv` (fora do git), no formato dos apps
antigos (confLocalWGS84.csv e confRadar.csv). Sem o arquivo, valem os exemplos fictícios do pacote.
Com erro no arquivo, valem os exemplos e o erro é mostrado na interface (em vez de ignorado em
silêncio). Lidos uma vez: depois de editar, reinicie o servidor.
"""

from __future__ import annotations

import csv
import io
import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from functools import cache
from importlib.resources import files
from pathlib import Path

from pydantic import ValidationError

from ..settings import settings
from .schemas import RadarModel, Site

log = logging.getLogger(__name__)

SITE_COLUMNS = ("name", "lat", "lon", "height")
RADAR_COLUMNS = ("name", "pt", "gt", "gr", "lt", "lr", "fhz", "sr", "snr")  # spt opcional (padrão 0,01 s)


@dataclass
class Catalog:
    sites: list[Site]
    radars: list[RadarModel]
    sites_source: str  # "exemplos" ou o caminho do arquivo da instalação
    radars_source: str
    errors: list[str] = field(default_factory=list)


def _rows(text: str, required: tuple[str, ...]) -> list[dict[str, str]]:
    """Linhas do CSV com cabeçalho; separador vírgula, ponto e vírgula ou tabulação."""
    text = text.lstrip("﻿")
    try:
        dialect = csv.Sniffer().sniff(text.splitlines()[0] if text else "", delimiters=",;\t")
        delimiter = dialect.delimiter
    except csv.Error:
        delimiter = ","
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    header = [h.strip().lower() for h in reader.fieldnames or []]
    missing = [c for c in required if c not in header]
    if missing:
        raise ValueError(f"colunas ausentes: {', '.join(missing)} (esperado: {', '.join(required)})")
    reader.fieldnames = header
    decimal_comma = delimiter != ","
    out = []
    for row in reader:
        clean = {k: (v or "").strip() for k, v in row.items() if k}
        if not any(clean.values()):
            continue
        if decimal_comma:
            clean = {k: v if k == "name" else v.replace(",", ".") for k, v in clean.items()}
        out.append(clean)
    return out


def _parse(text: str, required: tuple[str, ...], build: Callable[[dict[str, str]], object]) -> list:
    items, names = [], set()
    for line, row in enumerate(_rows(text, required), start=2):
        try:
            item = build(row)
        except (ValidationError, ValueError) as exc:
            detail = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else str(exc)
            raise ValueError(f"linha {line}: {detail}") from None
        if not row["name"]:
            raise ValueError(f"linha {line}: nome vazio")
        if row["name"] in names:
            raise ValueError(f"linha {line}: nome repetido ({row['name']})")
        names.add(row["name"])
        items.append(item)
    return items


def parse_sites(text: str) -> list[Site]:
    """CSV de locais: name, lat, lon, height (outras colunas, como color, são ignoradas)."""
    return _parse(text, SITE_COLUMNS, lambda r: Site(**{k: r[k] for k in SITE_COLUMNS}))


def parse_radars(text: str) -> list[RadarModel]:
    """CSV de radares: name, pt, gt, gr, lt, lr, fhz, sr, snr e, opcional, spt."""
    return _parse(
        text,
        RADAR_COLUMNS,
        lambda r: RadarModel(**{k: r[k] for k in RADAR_COLUMNS}, **({"spt": r["spt"]} if r.get("spt") else {})),
    )


def _example(name: str) -> str:
    return files("orbit_tools.data").joinpath(name).read_text(encoding="utf-8")


def _load(path: Path, example: str, parser, kind: str, errors: list[str]) -> tuple[list, str]:
    if path.exists():
        try:
            return parser(path.read_text(encoding="utf-8-sig")), str(path)
        except (ValueError, UnicodeDecodeError) as exc:
            msg = f"{kind} em {path}: {exc}. Usando os exemplos fictícios."
            log.error(msg)
            errors.append(msg)
    return parser(_example(example)), "exemplos"


@cache
def catalog() -> Catalog:
    errors: list[str] = []
    sites, sites_source = _load(settings.sites_csv, "example_sites.csv", parse_sites, "Locais", errors)
    radars, radars_source = _load(settings.radars_csv, "example_radars.csv", parse_radars, "Radares", errors)
    return Catalog(sites, radars, sites_source, radars_source, errors)
