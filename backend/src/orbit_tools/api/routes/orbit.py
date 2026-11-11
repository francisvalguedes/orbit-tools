"""Órbita: efemérides de um objeto em qualquer intervalo e passo."""

import numpy as np
from fastapi import APIRouter, HTTPException

from ...core import elements
from ...core.frames import teme_to_itrs
from ...core.propagation import ephemeris
from ...core.time import isot, time_grid
from ...settings import settings
from ...sources import eop as eop_source
from ..common import find_record, point, utc
from ..schemas import EphemerisRequest, EphemerisResponse
from ..series import series
from .elements import load_set

router = APIRouter(prefix="/api/orbit", tags=["órbita"])


@router.post("/ephemeris", response_model=EphemerisResponse)
def orbit_ephemeris(req: EphemerisRequest) -> EphemerisResponse:
    n = 1 + int(np.floor(req.duration_s / req.step_s + 1e-9))
    if n > settings.max_trajectory_points:
        raise HTTPException(
            413, f"{n} pontos; o limite é {settings.max_trajectory_points}. Aumente o passo ou reduza o intervalo."
        )
    record = find_record(load_set(req.set_id), req.norad, req.epoch)
    eop = eop_source.current()
    t = time_grid(utc(req.start), req.step_s, n)
    site = point(req.site) if req.site else None
    eph = ephemeris(record, t, eop, site)

    # Órbita "congelada": todas as posições TEME com a rotação do instante inicial. Mostra a elipse da
    # órbita (fixa no espaço inercial) como vista da Terra naquele momento; o traço no solo usa o ITRS.
    frozen, _ = teme_to_itrs(eph.teme, np.repeat(t[:1], n), eop)

    perigee, apogee = elements.perigee_apogee_km(record)
    local = {}
    if site is not None:
        local = {
            "e": series(eph.enu[:, 0]),
            "n": series(eph.enu[:, 1]),
            "u": series(eph.enu[:, 2]),
            "az": series(eph.az),
            "el": series(eph.el),
            "range": series(eph.range),
        }
    return EphemerisResponse(
        time=[str(s) for s in isot(t)],
        t=series(np.arange(n) * req.step_s),
        error=eph.error.astype(int).tolist(),
        teme_x=series(eph.teme[:, 0]),
        teme_y=series(eph.teme[:, 1]),
        teme_z=series(eph.teme[:, 2]),
        teme_vx=series(eph.teme_velocity[:, 0]),
        teme_vy=series(eph.teme_velocity[:, 1]),
        teme_vz=series(eph.teme_velocity[:, 2]),
        ecef_x=series(eph.itrs[:, 0]),
        ecef_y=series(eph.itrs[:, 1]),
        ecef_z=series(eph.itrs[:, 2]),
        ecef_vx=series(eph.itrs_velocity[:, 0]),
        ecef_vy=series(eph.itrs_velocity[:, 1]),
        ecef_vz=series(eph.itrs_velocity[:, 2]),
        lat=series(eph.lat),
        lon=series(eph.lon),
        height=series(eph.height),
        orbit_x=series(frozen[:, 0]),
        orbit_y=series(frozen[:, 1]),
        orbit_z=series(frozen[:, 2]),
        period_s=86400.0 / float(record["MEAN_MOTION"]),
        perigee_km=perigee,
        apogee_km=apogee,
        inclination_deg=float(record["INCLINATION"]),
        epoch_age_days=elements.age_days(record, t[0].astype("datetime64[us]").item()),
        **local,
    )
