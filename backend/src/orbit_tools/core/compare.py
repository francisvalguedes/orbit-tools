"""
Comparação entre conjuntos de elementos sucessivos do mesmo objeto (página 04 do app antigo).

Para cada par (mais novo, anterior), propaga os dois a partir de 0,5 dia antes da época do anterior,
80 amostras a cada 5 min, e mede a diferença de posição. O app antigo media em X/Y/Z do ENU do
sensor; aqui as componentes são radial, ao longo e através da órbita (RIC, no referencial do
conjunto mais novo), que não dependem do sensor. A norma é a mesma nos dois casos, e a comparação
dispensa local e EOP (feita em TEME).
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Callable, Sequence
from datetime import timedelta
from itertools import pairwise

import numpy as np

from .elements import Record, epoch, periapsis_km, satrec
from .propagation import propagate_teme
from .time import time_grid

STEP_S = 300.0
SAMPLES = 80
LEAD = timedelta(days=0.5)
TRACK_THRESHOLD_M = 3000.0  # erro médio abaixo do qual o objeto é considerado rastreável (TRACK = 1)


def compare_successive(
    records: Sequence[Record],
    *,
    step_s: float = STEP_S,
    samples: int = SAMPLES,
    track_threshold_m: float = TRACK_THRESHOLD_M,
    progress: Callable[[float], None] | None = None,
) -> list[dict[str, object]]:
    """Uma linha por par de conjuntos sucessivos, para objetos com dois ou mais conjuntos."""
    by_object: dict[int, list[Record]] = defaultdict(list)
    for r in records:
        by_object[int(r["NORAD_CAT_ID"])].append(r)
    groups = [sorted(g, key=lambda r: str(r["EPOCH"]), reverse=True) for g in by_object.values() if len(g) > 1]

    rows: list[dict[str, object]] = []
    for k, group in enumerate(groups):
        for newer, older in pairwise(group):
            row = _compare_pair(newer, older, step_s, samples, track_threshold_m)
            if row is not None:
                rows.append(row)
        if progress:
            progress((k + 1) / len(groups))
    return rows


def _compare_pair(newer: Record, older: Record, step_s, samples, threshold) -> dict[str, object] | None:
    t = time_grid(np.datetime64(epoch(older) - LEAD, "ns"), step_s, samples)
    _, r_new, v_new = propagate_teme(satrec(newer), t)
    _, r_old, _ = propagate_teme(satrec(older), t)
    diff = r_old - r_new
    dist = np.linalg.norm(diff, axis=1)
    d_mean = float(np.nanmean(dist)) if np.isfinite(dist).any() else float("nan")
    if d_mean == 0.0:  # conjuntos idênticos (o app antigo também descartava)
        return None

    radial = r_new / np.linalg.norm(r_new, axis=1, keepdims=True)
    h = np.cross(r_new, v_new)
    cross = h / np.linalg.norm(h, axis=1, keepdims=True)
    along = np.cross(cross, radial)
    ric = np.abs(np.stack([np.sum(diff * u, axis=1) for u in (radial, along, cross)], axis=1))
    mean = np.nanmean(ric, axis=0)
    peak = np.nanmax(ric, axis=0)
    return {
        "NORAD_CAT_ID": newer["NORAD_CAT_ID"],
        "OBJECT_NAME": newer.get("OBJECT_NAME"),
        "EPOCH": newer["EPOCH"],
        "EPOCH_1": older["EPOCH"],
        "D_ERR_MEAN": d_mean,
        "D_ERR_MAX": float(np.nanmax(dist)),
        "TRACK": int(d_mean < threshold),
        "RCS_SIZE": newer.get("RCS_SIZE"),
        "R_ERR_MEAN": float(mean[0]),
        "I_ERR_MEAN": float(mean[1]),
        "C_ERR_MEAN": float(mean[2]),
        "R_ERR_MAX": float(peak[0]),
        "I_ERR_MAX": float(peak[1]),
        "C_ERR_MAX": float(peak[2]),
        "PERIAPSIS": periapsis_km(newer),
        "ECCENTRICITY": newer["ECCENTRICITY"],
        "MEAN_MOTION": newer["MEAN_MOTION"],
        "DECAY_DATE": newer.get("DECAY_DATE"),
        "SGP4_ERROR": bool(not np.isfinite(dist).all()),
    }
