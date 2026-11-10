"""
Parâmetros de orientação da Terra (EOP): UT1−UTC e movimento do polo (xp, yp).

Fontes aceitas (mesmos dados que o astropy baixa):
    - `finals2000A.all` do IERS ou da USNO (Boletim A: medições e previsão de ~1 ano);
    - `EOP-All.csv` do Celestrak.

Interpolação linear entre os valores diários, como no astropy. No dia de um segundo intercalar,
UT1−UTC salta 1 s; a interpolação é feita na série sem os saltos (equivalente a UT1−TAI, contínua)
e o salto é somado de volta conforme o dia UTC do instante pedido.

Fora do intervalo da tabela os valores ficam constantes nas extremidades; `covers` diz se um
instante está coberto.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

import numpy as np

from .time import mjd as to_mjd

ARCSEC_TO_RAD = np.pi / (180.0 * 3600.0)


@dataclass(frozen=True)
class EOP:
    mjd: np.ndarray  # dias UTC (0h), crescentes
    dut1: np.ndarray  # UT1−UTC (s)
    xp: np.ndarray  # arcsec
    yp: np.ndarray  # arcsec
    source: str
    last_observed_mjd: float | None = None  # último dia medido; depois disso, previsão

    @classmethod
    def zero(cls) -> EOP:
        """Sem EOP: UT1 = UTC e polo nulo (erro de 20 a 40 m num LEO; ver docs/melhorias.md)."""
        empty = np.empty(0)
        return cls(empty, empty, empty, empty, source="nenhum (UT1 = UTC, polo nulo)")

    @property
    def is_zero(self) -> bool:
        return self.mjd.size == 0

    def covers(self, t) -> np.ndarray:
        m = to_mjd(t)
        if self.is_zero:
            return np.zeros(np.shape(m), dtype=bool)
        return (m >= self.mjd[0]) & (m <= self.mjd[-1])

    def at(self, t) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Instantes UTC → (UT1−UTC em s, xp em rad, yp em rad)."""
        m = to_mjd(t)
        if self.is_zero:
            z = np.zeros(np.shape(m))
            return z, z, z
        leaps = _leap_steps(self.dut1)
        cum = np.concatenate([[0.0], np.cumsum(leaps)])
        smooth = self.dut1 - cum
        day = np.clip(np.searchsorted(self.mjd, m, side="right") - 1, 0, self.mjd.size - 1)
        dut1 = np.interp(m, self.mjd, smooth) + cum[day]
        xp = np.interp(m, self.mjd, self.xp) * ARCSEC_TO_RAD
        yp = np.interp(m, self.mjd, self.yp) * ARCSEC_TO_RAD
        return dut1, xp, yp


def _leap_steps(dut1: np.ndarray) -> np.ndarray:
    """Saltos de segundo intercalar entre dias consecutivos (±1 s), 0 nos demais."""
    d = np.diff(dut1)
    return np.where(np.abs(d) > 0.5, np.round(d), 0.0)


def parse_finals2000a(text: str, source: str = "IERS finals2000A") -> EOP:
    """
    Lê o `finals2000A.all` (formato fixo do IERS). Usa os valores do Boletim A (colunas 19–27 xp,
    38–46 yp, 59–68 UT1−UTC); linhas sem UT1−UTC (fim da previsão) são ignoradas.
    """
    mjd, dut1, xp, yp = [], [], [], []
    last_obs = None
    for line in text.splitlines():
        if len(line) < 68 or not line[58:68].strip():
            continue
        m = float(line[7:15])
        mjd.append(m)
        xp.append(float(line[18:27]))
        yp.append(float(line[37:46]))
        dut1.append(float(line[58:68]))
        if line[57] == "I":
            last_obs = m
    if not mjd:
        raise ValueError("Arquivo EOP sem dados (formato finals2000A esperado).")
    return _build(mjd, dut1, xp, yp, source, last_obs)


def parse_celestrak_csv(text: str, source: str = "Celestrak EOP-All") -> EOP:
    """Lê o `EOP-All.csv` do Celestrak (DATA_TYPE O = observado, P = previsto)."""
    mjd, dut1, xp, yp = [], [], [], []
    last_obs = None
    for row in csv.DictReader(io.StringIO(text)):
        m = float(row["MJD"])
        mjd.append(m)
        xp.append(float(row["X"]))
        yp.append(float(row["Y"]))
        dut1.append(float(row["UT1-UTC"]))
        if row.get("DATA_TYPE", "").strip() == "O":
            last_obs = m
    if not mjd:
        raise ValueError("Arquivo EOP sem dados (formato EOP-All.csv do Celestrak esperado).")
    return _build(mjd, dut1, xp, yp, source, last_obs)


def _build(mjd, dut1, xp, yp, source, last_obs) -> EOP:
    m = np.asarray(mjd, dtype=float)
    order = np.argsort(m)
    if np.any(np.diff(m[order]) <= 0):
        raise ValueError("Arquivo EOP com datas repetidas.")
    return EOP(
        mjd=m[order],
        dut1=np.asarray(dut1, dtype=float)[order],
        xp=np.asarray(xp, dtype=float)[order],
        yp=np.asarray(yp, dtype=float)[order],
        source=source,
        last_observed_mjd=last_obs,
    )
