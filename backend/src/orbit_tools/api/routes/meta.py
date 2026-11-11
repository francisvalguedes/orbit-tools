from datetime import date, timedelta

from fastapi import APIRouter

from ... import __version__
from ...settings import settings
from ...sources import eop as eop_source
from ..schemas import EopInfo, Limits, Meta
from ..sites import catalog

router = APIRouter(prefix="/api", tags=["geral"])

_MJD0 = date(1858, 11, 17)


def _date(mjd: float | None) -> date | None:
    return None if mjd is None else _MJD0 + timedelta(days=int(mjd))


@router.get("/meta", response_model=Meta)
def meta() -> Meta:
    sites, radars, source = catalog()
    eop = eop_source.current()
    return Meta(
        name="orbit-tools",
        version=__version__,
        sites=sites,
        radars=radars,
        sites_source=source,
        limits=Limits(
            max_points=settings.max_points,
            max_elements=settings.max_elements,
            max_celestrak_ids=settings.max_celestrak_ids,
            max_spacetrack_ids=settings.max_spacetrack_ids,
            max_history_days=settings.max_history_days,
            max_search_days=settings.max_search_days,
            max_object_days=settings.max_object_days,
            max_trajectory_points=settings.max_trajectory_points,
            max_export_points=settings.max_export_points,
        ),
        eop=EopInfo(
            source=eop.source,
            first_date=None if eop.is_zero else _date(eop.mjd[0]),
            last_date=None if eop.is_zero else _date(eop.mjd[-1]),
            last_observed=_date(eop.last_observed_mjd),
        ),
    )
