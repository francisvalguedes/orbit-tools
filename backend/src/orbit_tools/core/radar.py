"""
Detecção por radar pela equação do radar.

O app antigo calculava só o RCS mínimo na distância mínima (`RCS_MIN`). Aqui a margem de detecção
`10·log10(RCS / RCS_MIN(R))` é calculada ao longo da passagem, o que dá também quanto tempo o
objeto fica detectável.
"""

from __future__ import annotations

import csv
import io
from collections.abc import Mapping
from dataclasses import dataclass
from functools import cache
from importlib.resources import files

import numpy as np

# RCS representativo (m²) por classe do Space-Track quando o objeto não está na tabela de RCS.
# Limite inferior de cada classe: LARGE > 1 m², MEDIUM 0,1 a 1 m², SMALL < 0,1 m².
RCS_BY_SIZE = {"LARGE": 1.0, "MEDIUM": 0.1, "SMALL": 0.01}

LIGHT_SPEED = 3e8  # m/s, o mesmo valor arredondado do app antigo (paridade do RCS_MIN)


@dataclass(frozen=True)
class Radar:
    """Parâmetros em dB (potência, ganhos, perdas, sensibilidade, SNR) e frequência em MHz."""

    name: str
    pt: float  # potência de transmissão (dB)
    gt: float  # ganho de transmissão (dB)
    gr: float  # ganho de recepção (dB)
    lt: float  # perda de transmissão (dB)
    lr: float  # perda de recepção (dB)
    fhz: float  # frequência (MHz)
    sr: float  # sensibilidade do receptor (dB)
    snr: float  # relação sinal-ruído exigida (dB)
    spt: float = 0.01  # tempo de amostragem da trajetória do radar (s)


def _lin(db):
    return 10.0 ** (np.asarray(db, dtype=float) / 10.0)


def rcs_min(r_m, radar: Radar) -> np.ndarray:
    """RCS mínimo detectável (m²) à distância `r_m` (m). Mesma fórmula do app antigo (`rcs_min`)."""
    lamb = LIGHT_SPEED / (radar.fhz * 1e6)
    num = (4 * np.pi) ** 3 * _lin(radar.sr) * _lin(radar.lt) * _lin(radar.lr) * np.power(r_m, 4) * _lin(radar.snr)
    return num / (_lin(radar.pt) * _lin(radar.gt) * _lin(radar.gr) * lamb**2)


def margin_db(rcs_m2: float, r_m, radar: Radar) -> np.ndarray:
    """Margem de detecção (dB): positiva quando o objeto é detectável."""
    return 10.0 * np.log10(rcs_m2 / rcs_min(r_m, radar))


@cache
def rcs_table() -> dict[int, float]:
    """
    Tabela de RCS (m²) por NORAD_CAT_ID que acompanha o pacote (`orbit_tools/data/rcs.csv`),
    a mesma do app antigo (valores publicados pelo Space-Track até 2017, atualizada em 03/2023).
    """
    text = files("orbit_tools.data").joinpath("rcs.csv").read_text(encoding="utf-8")
    return {int(r["NORAD_CAT_ID"]): float(r["RCS"]) for r in csv.DictReader(io.StringIO(text))}


def object_rcs(
    record: Mapping[str, object],
    table: Mapping[int, float],
    by_size: Mapping[str, float] = RCS_BY_SIZE,
) -> tuple[float | None, str]:
    """
    RCS do objeto (m²) e a origem: `"tabela"`, `"classe"` ou `"desconhecido"` (valor None).
    Como no app antigo, valores ≤ 0 na tabela contam como ausentes.
    """
    value = table.get(int(record["NORAD_CAT_ID"]))
    if value is not None and value > 0:
        return float(value), "tabela"
    size = str(record.get("RCS_SIZE") or "").upper()
    if size in by_size:
        return float(by_size[size]), "classe"
    return None, "desconhecido"


@dataclass(frozen=True)
class Detection:
    max_margin_db: float
    detectable_s: float  # tempo total com margem ≥ 0
    first_index: int | None  # primeira e última amostra detectável
    last_index: int | None


def detection(margin: np.ndarray, step_s: float) -> Detection:
    ok = margin >= 0.0
    idx = np.flatnonzero(ok)
    return Detection(
        max_margin_db=float(np.nanmax(margin)) if margin.size else float("nan"),
        detectable_s=float(ok.sum() * step_s),
        first_index=int(idx[0]) if idx.size else None,
        last_index=int(idx[-1]) if idx.size else None,
    )
