"""
Tempo em UTC como `numpy.datetime64[ns]`.

O SGP4 recebe a data juliana UTC separada em parte inteira e fração (`jd`, `fr`), o que preserva a
precisão de nanossegundos que um único float64 perderia. `datetime64` não representa segundos
intercalares; como no astropy (escala UTC), o dia do segundo intercalar é tratado como um dia comum.
"""

from __future__ import annotations

from datetime import datetime

import numpy as np

NS_PER_S = 1_000_000_000
NS_PER_DAY = 86_400 * NS_PER_S
UNIX_EPOCH_JD = 2440587.5
UNIX_EPOCH_MJD = 40587.0

UTC = np.dtype("datetime64[ns]")


def parse_utc(values) -> np.ndarray:
    """
    Instantes UTC → `datetime64[ns]`. Aceita textos ISO 8601 (com ou sem fração, com `Z` ou `+00:00`),
    `datetime` ingênuo (tratado como UTC) ou com fuso, e `datetime64`.
    """
    if isinstance(values, np.datetime64):
        return values.astype(UTC)
    if isinstance(values, np.ndarray) and values.dtype.kind == "M":
        return values.astype(UTC)
    arr = np.atleast_1d(np.asarray(values, dtype=object))
    out = np.empty(arr.shape, dtype=UTC)
    for i, v in enumerate(arr.flat):
        out.flat[i] = _one(v)
    return out if np.ndim(values) else out[0]


def _one(v) -> np.datetime64:
    if isinstance(v, np.datetime64):
        return v.astype(UTC)
    if isinstance(v, datetime):
        if v.tzinfo is not None:
            v = v.replace(tzinfo=None) - v.utcoffset()
        return np.datetime64(v, "ns")
    if isinstance(v, str):
        s = v.strip()
        if s.endswith("Z"):
            s = s[:-1]
        elif s.endswith("+00:00"):
            s = s[:-6]
        return np.datetime64(s.replace(" ", "T"), "ns")
    raise TypeError(f"Instante não reconhecido: {v!r}")


def time_grid(start, step_s: float, n: int) -> np.ndarray:
    """`n` instantes a partir de `start`, espaçados de `step_s` segundos (resolução de 1 ns)."""
    step_ns = round(step_s * NS_PER_S)
    if step_ns <= 0:
        raise ValueError("O passo de tempo deve ser positivo.")
    return parse_utc(start) + np.arange(n, dtype=np.int64) * np.timedelta64(step_ns, "ns")


def jd_split(t) -> tuple[np.ndarray, np.ndarray]:
    """UTC → (jd, fr): data juliana com `jd` em meio-dia inteiro (…,5) e `fr` em [0, 1)."""
    t = np.asarray(t, dtype=UTC)
    days = t.astype("datetime64[D]")
    jd = days.astype(np.int64) + UNIX_EPOCH_JD
    fr = (t - days).astype(np.int64) / NS_PER_DAY
    return jd.astype(float), fr


def mjd(t) -> np.ndarray:
    """UTC → data juliana modificada (float, precisão de ~1 µs, suficiente para interpolar o EOP)."""
    t = np.asarray(t, dtype=UTC)
    return t.astype(np.int64) / NS_PER_DAY + UNIX_EPOCH_MJD


def seconds_between(a, b) -> np.ndarray:
    """b − a em segundos."""
    return (np.asarray(b, dtype=UTC) - np.asarray(a, dtype=UTC)).astype(np.int64) / NS_PER_S


def isot(t, unit: str = "ms") -> np.ndarray:
    """Texto ISO sem fuso, como o `Time.isot` do astropy (3 casas por padrão). Trunca na unidade."""
    return np.datetime_as_string(np.asarray(t, dtype=UTC), unit=unit)


def clock(t, unit: str = "ms") -> np.ndarray:
    """Hora do dia `HH:MM:SS.fff`, como o `strftime("%H:%M:%S.%f")` do astropy usado no app antigo."""
    return np.char.partition(isot(t, unit), "T")[..., 2]


def ceil_to_second(t) -> np.ndarray:
    """Arredonda para cima até o segundo inteiro."""
    t = np.asarray(t, dtype=UTC)
    s = t.astype("datetime64[s]").astype(UTC)
    return np.where(s < t, s + np.timedelta64(1, "s"), s)
