from fastapi import APIRouter

from ... import __version__
from ...settings import settings
from ..schemas import Limits, Meta
from ..sites import catalog

router = APIRouter(prefix="/api", tags=["geral"])


@router.get("/meta", response_model=Meta)
def meta() -> Meta:
    sites, radars, source = catalog()
    return Meta(
        name="orbit-tools",
        version=__version__,
        sites=sites,
        radars=radars,
        sites_source=source,
        limits=Limits(max_points=settings.max_points),
    )
