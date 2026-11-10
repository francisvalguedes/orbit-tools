from fastapi import FastAPI
from fastapi.testclient import TestClient

from orbit_tools import __version__
from orbit_tools.api.main import app, mount_frontend


def test_meta():
    res = TestClient(app).get("/api/meta")
    assert res.status_code == 200
    assert res.json() == {"name": "orbit-tools", "version": __version__}


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
