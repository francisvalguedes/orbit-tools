"""Fontes externas e rotas de elementos, com a rede simulada (httpx2.MockTransport)."""

import csv
import json
import logging

import httpx2
import pytest
from fastapi.testclient import TestClient

from orbit_tools import sources
from orbit_tools.api.main import app
from orbit_tools.sources import celestrak, eop, spacetrack

from .conftest import DATA

ISS = next(csv.DictReader((DATA / "iss_2025-03-17.csv").open(encoding="utf-8")))
SATCAT = (
    "OBJECT_NAME,OBJECT_ID,NORAD_CAT_ID,OBJECT_TYPE,OPS_STATUS_CODE,OWNER,LAUNCH_DATE,LAUNCH_SITE,DECAY_DATE,"
    "PERIOD,INCLINATION,APOGEE,PERIGEE,RCS,DATA_STATUS_CODE,ORBIT_CENTER,ORBIT_TYPE\n"
    "ISS (ZARYA),1998-067A,25544,PAY,+,ISS,1998-11-20,TYMSC,,92.95,51.63,424,414,399.0524,,EA,ORB\n"
    "VELHO,1990-001A,11,DEB,D,US,1990-01-01,AFETR,2020-01-01,90,50,300,200,0.05,,EA,IMP\n"
)


class FakeNet:
    """Responde como Celestrak, Space-Track e IERS; conta as requisições por caminho."""

    def __init__(self):
        self.calls: list[str] = []
        self.satcat_status = 200

    def __call__(self, req: httpx2.Request) -> httpx2.Response:
        path = req.url.path
        self.calls.append(path)
        if path == "/NORAD/elements/gp.php":
            q = dict(req.url.params)
            if q.get("CATNR") == "25544" or q.get("GROUP") == "stations":
                return httpx2.Response(200, json=[{**ISS}])
            if q.get("GROUP") == "naoexiste":
                return httpx2.Response(200, text='Invalid query: "GROUP=naoexiste" (GROUP=naoexiste not found)')
            return httpx2.Response(404, text="No GP data found")
        if path == "/pub/satcat.csv":
            return httpx2.Response(self.satcat_status, text=SATCAT)
        if path == "/ajaxauth/login":
            ok = "password=certa" in req.content.decode()
            return httpx2.Response(200, text="" if ok else '{"Login":"Failed"}')
        if path == "/ajaxauth/logout":
            return httpx2.Response(200, text='"Successfully logged out"')
        if path.startswith("/basicspacedata/query/class/gp"):
            return httpx2.Response(200, json=[{**ISS, "RCS_SIZE": "LARGE", "DECAY_DATE": None}])
        if path.endswith("finals2000A.all"):
            if "iers.org" in str(req.url):
                return httpx2.Response(500, text="fora do ar")
            return httpx2.Response(200, text=(DATA / "finals2000A_2025-2026.all").read_text())
        return httpx2.Response(404)


@pytest.fixture
def net(monkeypatch, tmp_path):
    from orbit_tools.settings import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    fake = FakeNet()
    monkeypatch.setattr(sources, "test_transport", httpx2.MockTransport(fake))
    celestrak.clear_memo()
    eop.reset()
    yield fake
    celestrak.clear_memo()
    eop.reset()


@pytest.fixture
def client():
    return TestClient(app)


def test_celestrak_list_with_cache_and_satcat(net, client):
    res = client.post("/api/elements/celestrak", json={"kind": "catnr", "values": ["25544", "11", "25544"]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["count"] == 1 and body["objects"] == 1 and body["not_found"] == ["11"]
    rec = body["records"][0]
    assert rec["OBJECT_TYPE"] == "PAY" and rec["RCS"] == pytest.approx(399.0524) and rec["RCS_SIZE"] == "LARGE"
    assert 400 < rec["PERIAPSIS"] < rec["APOAPSIS"] < 440
    assert len(body["set_id"]) == 32
    gp_calls = net.calls.count("/NORAD/elements/gp.php")
    client.post("/api/elements/celestrak", json={"kind": "catnr", "values": ["25544"]})
    assert net.calls.count("/NORAD/elements/gp.php") == gp_calls  # do cache


def test_celestrak_errors(net, client):
    res = client.post("/api/elements/celestrak", json={"kind": "group", "values": ["naoexiste"]})
    assert res.status_code == 400 and "naoexiste" in res.json()["detail"]
    res = client.post("/api/elements/celestrak", json={"kind": "catnr", "values": ["99999"]})
    assert res.status_code == 404
    res = client.post("/api/elements/celestrak", json={"kind": "catnr", "values": ["ISS"]})
    assert res.status_code == 422
    res = client.post("/api/elements/celestrak", json={"kind": "group", "values": ["a", "b"]})
    assert res.status_code == 422


def test_satcat_failure_is_a_warning(net, client):
    net.satcat_status = 503
    body = client.post("/api/elements/celestrak", json={"kind": "group", "values": ["stations"]}).json()
    assert body["count"] == 1 and "OBJECT_TYPE" not in body["records"][0]
    assert any("Tipo de objeto" in w for w in body["warnings"])


def test_spacetrack_login_and_secrecy(net, client, caplog):
    caplog.set_level(logging.DEBUG)
    req = {"username": "u", "password": "errada", "mode": "latest", "norad_ids": [25544]}
    res = client.post("/api/elements/spacetrack", json=req)
    assert res.status_code == 401 and "usuário e senha" in res.json()["detail"]
    res = client.post("/api/elements/spacetrack", json={**req, "password": "certa", "norad_ids": [25544, 11]})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["not_found"] == ["11"] and body["records"][0]["RCS_SIZE"] == "LARGE"
    assert "/ajaxauth/logout" in net.calls
    assert "certa" not in caplog.text and "errada" not in caplog.text


def test_spacetrack_validation(net, client):
    base = {"username": "u", "password": "certa"}
    assert client.post("/api/elements/spacetrack", json={**base, "mode": "latest"}).status_code == 422
    too_long = {**base, "mode": "history", "norad_ids": [1], "epoch_start": "2026-11-01", "epoch_end": "2026-11-20"}
    assert client.post("/api/elements/spacetrack", json=too_long).status_code == 422
    leo = client.post("/api/elements/spacetrack", json={**base, "mode": "leo"})
    assert leo.status_code == 200 and leo.json()["not_found"] == []
    app_list = client.post("/api/elements/spacetrack", json={**base, "mode": "latest", "use_app_list": True})
    assert app_list.status_code == 200
    assert len(app_list.json()["not_found"]) > 100  # a lista do app tem ~220 objetos; o mock só devolve a ISS


def test_spacetrack_rate_limit(net, client, monkeypatch):
    monkeypatch.setattr(spacetrack, "rate_limit", spacetrack._RateLimit(per_minute=1, per_hour=10))
    req = {"username": "u", "password": "certa", "mode": "leo"}
    res = client.post("/api/elements/spacetrack", json=req)  # login usa a única vaga do minuto
    assert res.status_code == 429


def test_upload_store_and_compare(net, client):
    tle = (
        "ISS (ZARYA)\n1 25544U 98067A   25076.37088712  .00023992  00000-0  42500-3 0  9993\n"
        "2 25544  51.6367  41.7858 0006468  30.7796 329.3571 15.50122778500922\n"
    )
    res = client.post("/api/elements/parse", files={"file": ("iss.tle", tle.encode(), "text/plain")})
    assert res.status_code == 200 and res.json()["count"] == 1
    bad = client.post("/api/elements/parse", files={"file": ("x.csv", b"a,b\n1,2\n", "text/csv")})
    assert bad.status_code == 422

    hist = client.post(
        "/api/elements/parse", files={"file": ("h.csv", (DATA / "iss_supgp_history.csv").read_bytes(), "text/csv")}
    ).json()
    stored = client.post("/api/elements/store", json={"records": hist["records"]}).json()
    assert stored["set_id"] == hist["set_id"] and stored["count"] == 6  # mesmo conteúdo, mesmo id

    with client.stream("POST", "/api/elements/compare", json={"set_id": hist["set_id"]}) as res:
        assert res.headers["content-type"].startswith("application/x-ndjson")
        events = [json.loads(line) for line in res.iter_lines() if line]
    assert events[0]["type"] == "progress" and events[-1]["type"] == "result"
    assert len(events[-1]["data"]["rows"]) == 5
    assert client.post("/api/elements/compare", json={"set_id": "0" * 32}).status_code == 404


def test_eop_refresh_falls_back_to_next_source(net, client):
    assert eop.current().is_zero
    assert eop.refresh()
    assert eop.current().source == "USNO"
    meta = client.get("/api/meta").json()["eop"]
    assert meta["source"] == "USNO" and meta["last_observed"] == "2026-11-05"
    eop.reset()
    assert eop.current().source.startswith("USNO")  # relido do disco
    assert not eop.needs_refresh()
