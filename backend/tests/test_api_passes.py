import io
import json
import zipfile

import numpy as np
import pytest
from fastapi.testclient import TestClient

from orbit_tools.api.main import app
from orbit_tools.core import elements

from .conftest import DATA

SITE = {"name": "Exemplo-A", "lat": -10.0, "lon": -40.0, "height": 0.0}
RADAR = {"name": "Radar-exemplo", "pt": 60, "gt": 42, "gr": 42, "lt": 1.4, "lr": 1.6, "fhz": 5400, "sr": -140, "snr": 0}
WINDOW = {"start": "2026-11-11T00:00:00", "end": "2026-11-12T00:00:00"}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def set_id(client):
    records = elements.parse((DATA / "elements_leo100.csv").read_bytes(), "leo.csv")
    return client.post("/api/elements/store", json={"records": records}).json()["set_id"]


def _stream(client, path, body):
    with client.stream("POST", path, json=body) as res:
        assert res.status_code == 200, res.read()
        return [json.loads(line) for line in res.iter_lines() if line]


@pytest.fixture(scope="module")
def found(client, set_id):
    events = _stream(client, "/api/passes/search", {"set_id": set_id, "site": SITE, **WINDOW, "radar": RADAR})
    assert events[0]["type"] == "progress" and events[-1]["type"] == "result"
    return events[-1]["data"]


def test_search(found):
    rows = found["passes"]
    assert len(rows) == 93  # as mesmas 93 passagens da paridade com o app antigo
    # objetos com perigeu acima de d_max (1 100 km) nem são propagados
    assert found["objects"] + len(found["excluded_perigee"]) == 100 and len(found["excluded_perigee"]) == 12
    assert found["eop"].startswith("nenhum") and found["warnings"]  # testes sem arquivo EOP
    first = rows[0]
    for col in ("NORAD_CAT_ID", "H0", "H0_H", "MIN_RANGE", "END_PT", "MAX_EL", "RCS_MIN", "MAX_MARGIN_DB", "EPOCH"):
        assert col in first
    assert first["H0"] == "2026-11-11T00:00:54.000"
    assert [r["H0"] for r in rows] == sorted(r["H0"] for r in rows)


def _ref(row):
    return {"norad": row["NORAD_CAT_ID"], "epoch": row["EPOCH"], "h0": row["H0"], "end_pt": row["END_PT"]}


def test_trajectory(client, set_id, found):
    row = found["passes"][0]
    res = client.post("/api/passes/trajectory", json={"set_id": set_id, "site": SITE, "passage": _ref(row)})
    assert res.status_code == 200
    t = res.json()
    assert len(t["t"]) == row["END_PT"] + 1
    assert max(t["el"]) == pytest.approx(row["MAX_EL"])
    assert min(t["range"]) / 1000 == pytest.approx(row["MIN_RANGE"])
    big = {"set_id": set_id, "site": SITE, "passage": _ref(row), "step_s": 0.0001}
    assert client.post("/api/passes/trajectory", json=big).status_code == 413
    missing = {**_ref(row), "epoch": "2000-01-01T00:00:00.000000"}
    assert (
        client.post("/api/passes/trajectory", json={"set_id": set_id, "site": SITE, "passage": missing}).status_code
        == 404
    )


def test_export_zip(client, set_id, found):
    rows = found["passes"][:2]
    body = {"set_id": set_id, "site": SITE, "passes": [_ref(r) for r in rows], "rate_s": 0.1, "summary": rows}
    events = _stream(client, "/api/passes/export", body)
    result = events[-1]["data"]
    assert result["files"] == 2 and result["file_name"].startswith("trajetorias_Exemplo-A_")
    res = client.get(result["url"], params={"name": result["file_name"]})
    assert res.status_code == 200 and res.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    names = sorted(zf.namelist())
    first = rows[0]
    assert f"trn1Hz/obj-{first['NORAD_CAT_ID']}-2026_11_11-H0-00_00_54TU.trn" in names
    assert f"trj1Hz/pobj-{first['NORAD_CAT_ID']}-2026_11_11-H0-00_00_54TU.trj" in names
    assert f"csv1Hz/data-{first['NORAD_CAT_ID']}-2026_11_11-H0-00_00_54TU.csv" in names
    assert f"trn10Hz/10Hz_obj-{first['NORAD_CAT_ID']}-2026_11_11-H0-00_00_54TU.trn" in names
    assert any(n.endswith("_traj_summary.csv") for n in names) and any(n.endswith("_orbital_elem.csv") for n in names)
    trn = zf.read(f"trn1Hz/obj-{first['NORAD_CAT_ID']}-2026_11_11-H0-00_00_54TU.trn").decode().splitlines()
    assert trn[0] == f"{first['END_PT']},1000,1" and len(trn) == first["END_PT"] + 2
    rate = zf.read(f"trn10Hz/10Hz_obj-{first['NORAD_CAT_ID']}-2026_11_11-H0-00_00_54TU.trn").decode().splitlines()
    assert rate[0] == str(first["END_PT"]) and len(rate) == first["END_PT"] * 10 + 2
    np.testing.assert_allclose(  # o ponto inicial é o mesmo nas duas taxas
        [float(v) for v in rate[1].split(",")], [float(v) for v in trn[1].split(",")], atol=1e-3
    )
    assert client.get("/api/passes/export/" + "0" * 32).status_code == 404


def test_validation(client, set_id, monkeypatch):
    from orbit_tools.settings import settings

    base = {"set_id": set_id, "site": SITE}
    long = {**base, "start": "2026-11-01T00:00:00", "end": "2026-11-20T00:00:00"}
    assert client.post("/api/passes/search", json=long).status_code == 422
    close = {**base, **WINDOW, "d_max_km": 1000, "d_min_km": 990}
    assert client.post("/api/passes/search", json=close).status_code == 422
    assert client.post("/api/passes/search", json={**base, **WINDOW, "set_id": "f" * 32}).status_code == 404
    monkeypatch.setattr(settings, "max_object_days", 10)
    res = client.post("/api/passes/search", json={**base, **WINDOW})
    assert res.status_code == 413 and "objeto·dia" in res.json()["detail"]
    monkeypatch.setattr(settings, "max_export_points", 10)
    ref = {"norad": 22490, "epoch": "x", "h0": WINDOW["start"], "end_pt": 179}
    res = client.post("/api/passes/export", json={**base, "passes": [ref]})
    assert res.status_code in (404, 413)  # época inexistente é verificada antes do limite
