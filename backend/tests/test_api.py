import numpy as np
import pymap3d as pm
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from orbit_tools import __version__
from orbit_tools.api.main import app, mount_frontend

A = {"name": "A", "lat": -10.0, "lon": -40.0, "height": 50.0}
B = {"name": "B", "lat": -10.4, "lon": -39.6, "height": 120.0}


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_meta(client):
    body = client.get("/api/meta").json()
    assert body["name"] == "orbit-tools" and body["version"] == __version__
    assert body["sites_source"] == body["radars_source"] == "exemplos" and body["config_errors"] == []
    assert [s["name"] for s in body["sites"]] == ["Exemplo-A", "Exemplo-B"]
    assert body["radars"][0]["name"] == "Radar-exemplo" and body["radars"][0]["spt"] == 0.01
    assert body["limits"]["max_points"] > 0


@pytest.fixture
def local_config(tmp_path, monkeypatch):
    """Aponta config/local para uma pasta temporária e relê o catálogo."""
    from orbit_tools.api.sites import catalog
    from orbit_tools.settings import settings

    monkeypatch.setattr(settings, "sites_csv", tmp_path / "locais.csv")
    monkeypatch.setattr(settings, "radars_csv", tmp_path / "radares.csv")
    catalog.cache_clear()
    yield tmp_path
    catalog.cache_clear()


def test_installation_csv_in_legacy_format(client, local_config):
    # confLocalWGS84.csv do app antigo (com a coluna color, ignorada) e confRadar.csv sem spt
    (local_config / "locais.csv").write_text(
        "﻿name,lat,lon,height,color\nSENSOR-1,-5.9,-35.2,102.5,blue\nRAMPA-1,-5.92,-35.16,32.1,red\n", encoding="utf-8"
    )
    (local_config / "radares.csv").write_text("name;pt;gt;gr;lt;lr;fhz;sr;snr\nR1;60,6;45;45;1,7;1,7;5300;-139;0\n")
    body = client.get("/api/meta").json()
    assert body["config_errors"] == []
    assert body["sites_source"].endswith("locais.csv") and body["radars_source"].endswith("radares.csv")
    assert [s["name"] for s in body["sites"]] == ["SENSOR-1", "RAMPA-1"] and body["sites"][0]["height"] == 102.5
    radar = body["radars"][0]
    assert radar["name"] == "R1" and radar["pt"] == 60.6 and radar["lt"] == 1.7 and radar["spt"] == 0.01


@pytest.mark.parametrize(
    ("content", "message"),
    [
        ("name,lat,lon\nA,1,2\n", "colunas ausentes: height"),
        ("name,lat,lon,height\nA,95,2,0\n", "linha 2"),
        ("name,lat,lon,height\nA,1,2,0\nA,3,4,0\n", "nome repetido"),
        ("name,lat,lon,height\nA,1,x,0\n", "linha 2"),
    ],
)
def test_installation_csv_errors_are_reported(client, local_config, content, message):
    (local_config / "locais.csv").write_text(content, encoding="utf-8")
    body = client.get("/api/meta").json()
    assert body["sites_source"] == "exemplos"  # cai nos exemplos, mas avisa
    assert len(body["config_errors"]) == 1 and message in body["config_errors"][0]


def test_convert_geodetic_to_all(client):
    lat, lon, h = [-9.0, -11.0], [-41.0, -38.5], [400_000.0, 1_000.0]
    res = client.post(
        "/api/convert/points",
        json={"system": "geodetic", "a": lat, "b": lon, "c": h, "outputs": [A, B]},
    )
    assert res.status_code == 200
    body = res.json()
    np.testing.assert_allclose(
        np.column_stack([body["x"], body["y"], body["z"]]), np.column_stack(pm.geodetic2ecef(lat, lon, h)), atol=1e-6
    )
    np.testing.assert_allclose(body["lat"], lat, atol=1e-10)
    assert [loc["site"]["name"] for loc in body["local"]] == ["A", "B"]
    az, el, rng = pm.geodetic2aer(lat, lon, h, B["lat"], B["lon"], B["height"])
    loc = body["local"][1]
    np.testing.assert_allclose(loc["az"], az, atol=1e-9)
    np.testing.assert_allclose(loc["el"], el, atol=1e-9)
    np.testing.assert_allclose(loc["range"], rng, atol=1e-6)


def test_convert_aer_in_km_and_rad_is_enu1_to_enu2(client):
    """Página 04 do conversor: AZ/EL/D no local A → ENU e AZ/EL/D no local B."""
    az, el, r = np.radians([340.67, 20.0]), np.radians([37.98, 5.0]), np.array([649.9, 1200.0])
    res = client.post(
        "/api/convert/points",
        json={
            "system": "aer",
            "reference": A,
            "outputs": [B],
            "length_unit": "km",
            "angle_unit": "rad",
            "a": az.tolist(),
            "b": el.tolist(),
            "c": r.tolist(),
        },
    )
    body = res.json()
    assert [loc["site"]["name"] for loc in body["local"]] == ["A", "B"]  # referência entra primeiro
    ecef = np.column_stack(pm.aer2ecef(np.degrees(az), np.degrees(el), r * 1000, A["lat"], A["lon"], A["height"]))
    enu_b = np.column_stack(pm.ecef2enu(*ecef.T, B["lat"], B["lon"], B["height"]))
    loc = body["local"][1]
    np.testing.assert_allclose(np.column_stack([loc["e"], loc["n"], loc["u"]]), enu_b, atol=1e-6)
    np.testing.assert_allclose(body["local"][0]["range"], r * 1000, atol=1e-6)


@pytest.mark.parametrize(
    ("body", "status", "message"),
    [
        ({"system": "enu", "a": [1.0], "b": [2.0], "c": [3.0]}, 422, "local de referência"),
        ({"system": "ecef", "a": [1.0], "b": [2.0], "c": []}, 422, "mesmo número"),
        ({"system": "ecef", "a": [], "b": [], "c": []}, 422, "Nenhum ponto"),
    ],
)
def test_convert_validation(client, body, status, message):
    res = client.post("/api/convert/points", json=body)
    assert res.status_code == status
    assert message in res.text


def test_convert_limit(client, monkeypatch):
    from orbit_tools.settings import settings

    monkeypatch.setattr(settings, "max_points", 2)
    res = client.post("/api/convert/points", json={"system": "ecef", "a": [7e6] * 3, "b": [0.0] * 3, "c": [0.0] * 3})
    assert res.status_code == 413 and "limite" in res.json()["detail"]


def test_ecef_origin_gives_null_not_nan(client):
    res = client.post("/api/convert/points", json={"system": "ecef", "a": [0.0], "b": [0.0], "c": [0.0]})
    assert res.status_code == 200
    assert res.json()["height"] == [None]  # centro da Terra: altura indefinida


def test_dms(client):
    res = client.post(
        "/api/convert/dms", json={"direction": "to_decimal", "values": ["-1°49'10.583775\"", "5°55'20.010\"S", "x"]}
    ).json()["results"]
    assert res[0]["value"] == pytest.approx(-1.8196066041666668)
    assert res[1]["value"] == pytest.approx(-5.922225)
    assert res[2]["error"]
    res = client.post(
        "/api/convert/dms", json={"direction": "to_dms", "values": [-5.922225, "10.9999999999"], "decimals": 3}
    ).json()["results"]
    assert [r["text"] for r in res] == ["-5°55'20.010\"", "11°0'0.000\""]
    res = client.post(
        "/api/convert/dms", json={"direction": "to_dms", "values": [-35.1615117], "style": "hemisphere", "kind": "lon"}
    ).json()["results"]
    assert res[0]["text"] == "35°09'41.442\"W"


def test_kinematics_matches_legacy_page(client):
    """Página 06: ENU da rampa → ENU e AZ/EL/D do sensor, com velocidades."""
    t = np.arange(0, 20, 0.5)
    x, y, z = 10 * t, 200 * t, 5 * t**2 + 1000 * t
    res = client.post(
        "/api/convert/kinematics",
        json={"x": x.tolist(), "y": y.tolist(), "z": z.tolist(), "step_s": 0.5, "source": A, "target": B},
    ).json()
    ecef = np.column_stack(pm.enu2ecef(x, y, z, A["lat"], A["lon"], A["height"]))
    enu_b = np.column_stack(pm.ecef2enu(*ecef.T, B["lat"], B["lon"], B["height"]))
    np.testing.assert_allclose(np.column_stack([res["e"], res["n"], res["u"]]), enu_b, atol=1e-6)
    np.testing.assert_allclose(res["t"], t)
    np.testing.assert_allclose(res["ve"][1:-1], np.gradient(enu_b[:, 0], 0.5)[1:-1], rtol=1e-9)
    assert res["ae"][0] is None and res["ae"][-1] is None  # bordas sem aceleração
    same = client.post(
        "/api/convert/kinematics", json={"x": x.tolist(), "y": y.tolist(), "z": z.tolist(), "step_s": 0.5, "source": A}
    ).json()
    np.testing.assert_allclose(same["u"], z, atol=1e-9)


def test_frontend_index_not_cached(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    web = FastAPI()
    mount_frontend(web, tmp_path)
    c = TestClient(web)

    # index.html, por qualquer caminho do SPA, sempre revalidado; demais arquivos sem o cabeçalho
    for path in ("/", "/qualquer", "/index.html"):
        r = c.get(path)
        assert r.status_code == 200 and r.text == "<html></html>"
        assert r.headers["cache-control"] == "no-cache"
    assert "cache-control" not in c.get("/assets/app-abc123.js").headers
    assert "cache-control" not in c.get("/favicon.svg").headers
