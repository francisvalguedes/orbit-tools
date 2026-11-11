"""Conversões de coordenadas, graus/minutos/segundos e cinemática de trajetórias."""

import numpy as np
from fastapi import APIRouter, HTTPException

from ...core.geodesy import (
    GeodeticPoint,
    LocalFrame,
    aer_to_enu,
    dd_to_dms,
    dd_to_dms_signed,
    dms_to_dd,
    ecef_to_geodetic,
    enu_to_aer,
    geodetic_to_ecef,
    get_ellipsoid,
)
from ...core.kinematics import derivatives
from ...settings import settings
from ..schemas import (
    ConvertPointsRequest,
    ConvertPointsResponse,
    DmsRequest,
    DmsResponse,
    DmsResult,
    KinematicsRequest,
    KinematicsResponse,
    LocalCoordinates,
    Site,
)
from ..series import series

router = APIRouter(prefix="/api/convert", tags=["conversões"])

LENGTH = {"m": 1.0, "km": 1000.0}


def _check_size(n: int) -> None:
    if n > settings.max_points:
        raise HTTPException(413, f"Muitos pontos ({n}); o limite por requisição é {settings.max_points}.")


def _point(site: Site) -> GeodeticPoint:
    return GeodeticPoint(site.lat, site.lon, site.height)


@router.post("/points", response_model=ConvertPointsResponse)
def convert_points(req: ConvertPointsRequest) -> ConvertPointsResponse:
    _check_size(len(req.a))
    ell = get_ellipsoid(req.ellipsoid)
    scale = LENGTH[req.length_unit]
    a, b, c = (np.asarray(v, dtype=float) for v in (req.a, req.b, req.c))

    if req.system == "geodetic":
        ecef = geodetic_to_ecef(a, b, c * scale, ell)
    elif req.system == "ecef":
        ecef = np.column_stack([a, b, c]) * scale
    else:
        frame = LocalFrame(_point(req.reference), ell)
        if req.system == "enu":
            enu = np.column_stack([a, b, c]) * scale
        else:
            to_rad = np.radians if req.angle_unit == "deg" else np.asarray
            enu = aer_to_enu(to_rad(a), to_rad(b), c * scale)
        ecef = frame.to_ecef(enu)

    with np.errstate(divide="ignore", invalid="ignore"):  # pontos no centro da Terra: altura indefinida (null)
        lat, lon, h = ecef_to_geodetic(ecef, ell)
    outputs = list(req.outputs)
    if req.reference is not None and all(o != req.reference for o in outputs):
        outputs.insert(0, req.reference)
    local = []
    for site in outputs:
        enu = LocalFrame(_point(site), ell).from_ecef(ecef)
        az, el, rng = enu_to_aer(enu)
        local.append(
            LocalCoordinates(
                site=site,
                e=series(enu[:, 0]),
                n=series(enu[:, 1]),
                u=series(enu[:, 2]),
                az=series(np.degrees(az)),
                el=series(np.degrees(el)),
                range=series(rng),
            )
        )
    return ConvertPointsResponse(
        lat=series(lat),
        lon=series(lon),
        height=series(h),
        x=series(ecef[:, 0]),
        y=series(ecef[:, 1]),
        z=series(ecef[:, 2]),
        local=local,
    )


@router.post("/dms", response_model=DmsResponse)
def convert_dms(req: DmsRequest) -> DmsResponse:
    _check_size(len(req.values))
    results = []
    for v in req.values:
        try:
            if req.direction == "to_decimal":
                results.append(DmsResult(value=dms_to_dd(str(v))))
            else:
                x = float(v)
                if not np.isfinite(x):
                    raise ValueError("valor não finito")
                text = dd_to_dms(x, req.kind) if req.style == "hemisphere" else dd_to_dms_signed(x, req.decimals)
                results.append(DmsResult(text=text))
        except (ValueError, TypeError) as exc:
            results.append(DmsResult(error=str(exc)))
    return DmsResponse(results=results)


@router.post("/kinematics", response_model=KinematicsResponse)
def kinematics(req: KinematicsRequest) -> KinematicsResponse:
    _check_size(len(req.x))
    ell = get_ellipsoid(req.ellipsoid)
    enu = np.column_stack([req.x, req.y, req.z]) * LENGTH[req.length_unit]
    if req.target is not None:
        enu = LocalFrame(_point(req.target), ell).from_ecef(LocalFrame(_point(req.source), ell).to_ecef(enu))
    az, el, rng = enu_to_aer(enu)
    az_deg = np.degrees(az)
    el_deg = np.degrees(el)
    h = req.step_s
    ve, ae = derivatives(enu[:, 0], h)
    vn, an = derivatives(enu[:, 1], h)
    vu, au = derivatives(enu[:, 2], h)
    v_az, a_az = derivatives(np.unwrap(az_deg, period=360.0), h)
    v_el, a_el = derivatives(el_deg, h)
    v_r, a_r = derivatives(rng, h)
    return KinematicsResponse(
        t=series(np.arange(len(enu)) * h),
        e=series(enu[:, 0]),
        n=series(enu[:, 1]),
        u=series(enu[:, 2]),
        ve=series(ve),
        vn=series(vn),
        vu=series(vu),
        ae=series(ae),
        an=series(an),
        au=series(au),
        az=series(az_deg),
        el=series(el_deg),
        range=series(rng),
        v_az=series(v_az),
        v_el=series(v_el),
        v_range=series(v_r),
        a_az=series(a_az),
        a_el=series(a_el),
        a_range=series(a_r),
    )
