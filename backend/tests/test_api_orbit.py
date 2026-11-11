import json

import numpy as np
import pytest
from fastapi.testclient import TestClient

from orbit_tools.api.main import app
from orbit_tools.core import elements

from .conftest import DATA, LEGACY

SITE = {"name": "Exemplo-A", "lat": -10.0, "lon": -40.0, "height": 0.0}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def iss(client):
    records = elements.parse((DATA / "iss_2025-03-17.csv").read_bytes(), "iss.csv")
    set_id = client.post("/api/elements/store", json={"records": records}).json()["set_id"]
    return set_id, records[0]


def test_ephemeris(client, iss):
    set_id, rec = iss
    body = {"set_id": set_id, "norad": 25544, "epoch": rec["EPOCH"], "start": "2025-03-17T09:00:00", "duration_s": 5580}
    res = client.post("/api/orbit/ephemeris", json={**body, "step_s": 60, "site": SITE})
    assert res.status_code == 200, res.text
    e = res.json()
    assert len(e["t"]) == 94 and e["time"][0] == "2025-03-17T09:00:00.000" and e["time"][1] == "2025-03-17T09:01:00.000"
    assert e["period_s"] == pytest.approx(86400 / 15.50122778)
    assert 400 < e["perigee_km"] < e["apogee_km"] < 440 and e["inclination_deg"] == pytest.approx(51.6367)
    assert e["epoch_age_days"] == pytest.approx(0.0049, abs=1e-3)
    teme = np.column_stack([e["teme_x"], e["teme_y"], e["teme_z"]])
    ecef = np.column_stack([e["ecef_x"], e["ecef_y"], e["ecef_z"]])
    orbit = np.column_stack([e["orbit_x"], e["orbit_y"], e["orbit_z"]])
    # rotações preservam a distância ao centro; no instante inicial a órbita congelada coincide com o ECEF
    np.testing.assert_allclose(np.linalg.norm(orbit, axis=1), np.linalg.norm(teme, axis=1), rtol=1e-12)
    np.testing.assert_allclose(orbit[0], ecef[0], atol=1e-6)
    assert np.linalg.norm(orbit[-1] - ecef[-1]) > 100e3  # depois de uma órbita a Terra girou ~23°
    assert e["az"] is not None and len(e["el"]) == 94 and max(e["el"]) < 90


def test_ephemeris_matches_legacy_reference(client, iss):
    """Mesma referência do teste de paridade: 1 h a cada 10 s (sem EOP aqui, então dezenas de metros)."""
    set_id, rec = iss
    meta = json.loads((LEGACY / "propagation.json").read_text())["iss2025"]
    body = {
        "set_id": set_id,
        "norad": 25544,
        "epoch": rec["EPOCH"],
        "start": meta["start"],
        "duration_s": meta["step"] * (meta["n"] - 1),
        "step_s": meta["step"],
    }
    e = client.post("/api/orbit/ephemeris", json=body).json()
    ref = np.load(LEGACY / "propagation_iss2025.npz")["itrs"]
    ecef = np.column_stack([e["ecef_x"], e["ecef_y"], e["ecef_z"]])
    assert np.linalg.norm(ecef - ref, axis=1).max() < 60
    assert e["e"] is None  # sem local, sem ENU


def test_ephemeris_limits(client, iss, monkeypatch):
    from orbit_tools.settings import settings

    set_id, rec = iss
    body = {"set_id": set_id, "norad": 25544, "epoch": rec["EPOCH"], "start": "2025-03-17T09:00:00", "duration_s": 600}
    assert client.post("/api/orbit/ephemeris", json={**body, "epoch": "x"}).status_code == 404
    monkeypatch.setattr(settings, "max_trajectory_points", 10)
    res = client.post("/api/orbit/ephemeris", json={**body, "step_s": 1})
    assert res.status_code == 413 and "passo" in res.json()["detail"]
