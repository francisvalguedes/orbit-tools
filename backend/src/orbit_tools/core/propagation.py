"""
Propagação SGP4 vetorizada e efemérides nos sistemas de saída.

Unidades: metros, metros por segundo e graus. Geodésicas e ENU no WGS84 (como o app antigo, que
usava o padrão do pymap3d), salvo outro elipsoide informado.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass

import numpy as np
from sgp4.api import Satrec, SatrecArray

from .elements import satrec
from .eop import EOP
from .frames import teme_to_itrs
from .geodesy import WGS84, Ellipsoid, GeodeticPoint, LocalFrame, ecef_to_geodetic, enu_to_aer
from .time import jd_split


def propagate_teme(sat: Satrec | SatrecArray, t) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    SGP4 em TEME.

    Args:
        sat: um objeto (`Satrec`) ou vários (`SatrecArray`).
        t: instantes UTC (`datetime64[ns]`).

    Returns:
        (código de erro, posição em m, velocidade em m/s). Forma (n, …) para um objeto e
        (objetos, n, …) para vários. Amostras com erro têm posição e velocidade NaN.
    """
    jd, fr = jd_split(t)
    if isinstance(sat, SatrecArray):
        e, r, v = sat.sgp4(jd, fr)
    else:
        e, r, v = sat.sgp4_array(jd, fr)
    r = r * 1000.0
    v = v * 1000.0
    bad = e != 0
    r[bad] = np.nan
    v[bad] = np.nan
    return e, r, v


@dataclass(frozen=True)
class Observation:
    """Posição de um objeto vista de um local: ENU, azimute, elevação e distância."""

    error: np.ndarray  # código de erro do SGP4 (0 = ok)
    itrs: np.ndarray  # (n, 3) m
    enu: np.ndarray  # (n, 3) m
    az: np.ndarray  # graus [0, 360)
    el: np.ndarray  # graus
    range: np.ndarray  # m


def observe(sat: Satrec, t, eop: EOP, frame: LocalFrame) -> Observation:
    """Propaga um objeto e calcula a posição relativa ao local (sem velocidade nem geodésicas)."""
    e, r, _ = propagate_teme(sat, t)
    itrs, _ = teme_to_itrs(r, t, eop)
    enu = frame.from_ecef(itrs)
    az, el, rng = enu_to_aer(enu)
    return Observation(e, itrs, enu, np.degrees(az), np.degrees(el), rng)


@dataclass(frozen=True)
class Ephemeris:
    """Efemérides de um objeto em todos os sistemas. Campos do local são None sem local."""

    time: np.ndarray  # datetime64[ns] UTC
    error: np.ndarray
    teme: np.ndarray  # (n, 3) m
    teme_velocity: np.ndarray  # (n, 3) m/s
    itrs: np.ndarray  # (n, 3) m
    itrs_velocity: np.ndarray  # (n, 3) m/s
    lat: np.ndarray  # graus
    lon: np.ndarray  # graus
    height: np.ndarray  # m, acima do elipsoide
    enu: np.ndarray | None = None
    az: np.ndarray | None = None
    el: np.ndarray | None = None
    range: np.ndarray | None = None


def ephemeris(
    element: Mapping[str, object] | Satrec,
    t,
    eop: EOP,
    site: GeodeticPoint | None = None,
    ell: Ellipsoid = WGS84,
) -> Ephemeris:
    sat = element if isinstance(element, Satrec) else satrec(element)
    t = np.asarray(t, dtype="datetime64[ns]")
    e, r, v = propagate_teme(sat, t)
    itrs, itrs_v = teme_to_itrs(r, t, eop, v)
    lat, lon, h = ecef_to_geodetic(itrs, ell)
    local = {}
    if site is not None:
        enu = LocalFrame(site, ell).from_ecef(itrs)
        az, el, rng = enu_to_aer(enu)
        local = {"enu": enu, "az": np.degrees(az), "el": np.degrees(el), "range": rng}
    return Ephemeris(t, e, r, v, itrs, itrs_v, lat, lon, h, **local)
