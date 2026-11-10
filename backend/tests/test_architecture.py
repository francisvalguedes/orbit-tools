"""Regras de dependência entre as camadas (ver CLAUDE.md)."""

import subprocess
import sys

# Pacotes que o núcleo não pode carregar: camada web, rede e bibliotecas trocadas por código próprio
FORBIDDEN_IN_CORE = ["fastapi", "starlette", "pydantic", "httpx", "httpx2", "uvicorn", "astropy", "pymap3d", "pandas"]


def test_core_does_not_import_web_or_network():
    # Processo separado: neste processo o pytest e os outros testes já carregaram a camada web
    code = (
        "import pkgutil, importlib, sys, orbit_tools.core as c\n"
        "for m in pkgutil.walk_packages(c.__path__, 'orbit_tools.core.'): importlib.import_module(m.name)\n"
        f"print([p for p in {FORBIDDEN_IN_CORE!r} if p in sys.modules])"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True).stdout.strip()
    assert out == "[]", f"orbit_tools.core carregou: {out}"
