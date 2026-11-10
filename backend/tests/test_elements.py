import json

import numpy as np
import pytest

from orbit_tools.core import elements as E
from orbit_tools.core.propagation import propagate_teme
from orbit_tools.core.time import time_grid

from .conftest import DATA

TLE = """ISS (ZARYA)
1 25544U 98067A   25076.37088712  .00023992  00000-0  42500-3 0  9993
2 25544  51.6367  41.7858 0006468  30.7796 329.3571 15.50122778500922
"""


def test_csv_types_and_defaults(leo100):
    r = leo100[0]
    assert len(leo100) == 100
    assert isinstance(r["NORAD_CAT_ID"], int) and isinstance(r["MEAN_MOTION"], float)
    assert r["OBJECT_ID"] == "1964-063C" and r["EPOCH"] == "2026-11-10T04:30:17.500320"


def test_formats_give_the_same_orbit(iss2025):
    as_json = json.dumps([{k: str(v) for k, v in iss2025.items()}])
    t = time_grid("2025-03-17T10:00:00", 60.0, 120)
    ref = propagate_teme(E.satrec(iss2025), t)[1]
    for content, name in [(TLE, "iss.tle"), (as_json, "iss.json"), ("0 " + TLE, "iss.txt"), (TLE, "")]:
        rec = E.parse(content, name)[0]
        assert rec["NORAD_CAT_ID"] == 25544
        r = propagate_teme(E.satrec(rec), t)[1]
        assert np.abs(r - ref).max() < 1.0  # m (TLE tem menos dígitos que o OMM)


def test_xml():
    xml = (DATA / "iss_2025-03-17.csv").read_text(encoding="utf-8").splitlines()
    head, values = xml[0].split(","), xml[1].split(",")
    meta = {"OBJECT_NAME", "OBJECT_ID"}
    tle_keys = {"EPHEMERIS_TYPE", "CLASSIFICATION_TYPE", "NORAD_CAT_ID", "ELEMENT_SET_NO", "REV_AT_EPOCH", "BSTAR"}
    tle_keys |= {"MEAN_MOTION_DOT", "MEAN_MOTION_DDOT"}

    def tags(keys):
        return "".join(f"<{k}>{v}</{k}>" for k, v in zip(head, values, strict=True) if k in keys)

    doc = (
        "<ndm><omm><body><segment>"
        f"<metadata>{tags(meta)}</metadata>"
        f"<data><meanElements>{tags(set(head) - meta - tle_keys)}</meanElements>"
        f"<tleParameters>{tags(tle_keys)}</tleParameters></data>"
        "</segment></body></omm></ndm>"
    )
    rec = E.parse(doc, "iss.xml")[0]
    assert rec["NORAD_CAT_ID"] == 25544 and rec["MEAN_MOTION"] == 15.50122778


def test_minimal_user_file_gets_defaults():
    csv_text = (
        "norad_cat_id,epoch,mean_motion,eccentricity,inclination,ra_of_asc_node,arg_of_pericenter,"
        "mean_anomaly,bstar,mean_motion_dot,mean_motion_ddot\n"
        "25544,2025-03-17T08:54:04Z,15.5,0.0006,51.6,41.7,30.7,329.3,0.0004,0.0002,0\n"
    )
    rec = E.parse(csv_text, "x.csv")[0]
    assert rec["EPOCH"] == "2025-03-17T08:54:04.000000"
    assert rec["CLASSIFICATION_TYPE"] == "U" and rec["ELEMENT_SET_NO"] == 999
    E.satrec(rec)


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("NORAD_CAT_ID,EPOCH\n1,2025-01-01T00:00:00\n", "obrigatórios ausentes"),
        ('[{"NORAD_CAT_ID": 1}]', "obrigatórios ausentes"),
        ("1 25544U 98067A   25076.37088712\n", "TLE incompleto"),
        ("<xml", "XML OMM inválido"),
    ],
)
def test_invalid_files(content, message):
    with pytest.raises(E.ElementsError, match=message):
        E.parse(content)


def test_invalid_values(iss2025):
    bad = dict(iss2025, ECCENTRICITY=1.2)
    with pytest.raises(E.ElementsError, match="ECCENTRICITY"):
        E.normalize(bad)
    with pytest.raises(E.ElementsError, match="EPOCH"):
        E.normalize(dict(iss2025, EPOCH="ontem"))


def test_perigee_and_latest(iss2025):
    perigee, apogee = E.perigee_apogee_km(iss2025)
    assert 400 < perigee < apogee < 440
    assert E.periapsis_km(dict(iss2025, PERIAPSIS=999.0)) == 999.0
    newer = dict(iss2025, EPOCH="2025-03-18T00:00:00.000000")
    other = dict(iss2025, NORAD_CAT_ID=1)
    latest = E.latest_per_object([iss2025, newer, other])
    assert [r["NORAD_CAT_ID"] for r in latest] == [25544, 1]
    assert latest[0]["EPOCH"] == newer["EPOCH"]
