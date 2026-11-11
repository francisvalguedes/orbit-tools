"""Locais e radares oferecidos a todos: os exemplos do pacote ou o arquivo da instalação."""

import json
from functools import cache
from importlib.resources import files

from ..settings import settings
from .schemas import RadarModel, Site


@cache
def catalog() -> tuple[list[Site], list[RadarModel], str]:
    if settings.sites_file is not None:
        text = settings.sites_file.read_text(encoding="utf-8")
        source = settings.sites_file.name
    else:
        text = files("orbit_tools.data").joinpath("example_sites.json").read_text(encoding="utf-8")
        source = "exemplos"
    data = json.loads(text)
    sites = [Site(**s) for s in data.get("sites", [])]
    radars = [RadarModel(**r) for r in data.get("radars", [])]
    return sites, radars, source
