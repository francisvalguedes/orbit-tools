from fastapi import APIRouter

from .. import __version__
from .schemas import Meta

router = APIRouter(prefix="/api")


@router.get("/meta", response_model=Meta)
def meta() -> Meta:
    return Meta(name="orbit-tools", version=__version__)
