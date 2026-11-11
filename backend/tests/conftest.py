import os
import tempfile
from pathlib import Path

# Antes de qualquer import de orbit_tools.settings: caches numa pasta temporária e sem manutenção
# em segundo plano (que acessaria a rede para baixar o EOP)
os.environ["ORBIT_DATA_DIR"] = tempfile.mkdtemp(prefix="orbit-tools-testes-")
os.environ["ORBIT_MAINTENANCE"] = "false"
# Locais e radares da máquina de quem roda os testes (config/local/) não entram nos testes
os.environ["ORBIT_SITES_CSV"] = os.path.join(os.environ["ORBIT_DATA_DIR"], "sem-locais.csv")
os.environ["ORBIT_RADARS_CSV"] = os.path.join(os.environ["ORBIT_DATA_DIR"], "sem-radares.csv")

import pytest

from orbit_tools.core import elements
from orbit_tools.core.eop import EOP, parse_finals2000a
from orbit_tools.core.geodesy import GeodeticPoint

DATA = Path(__file__).parent / "data"
LEGACY = DATA / "legacy"
# Mesmo local fictício das referências do app antigo (tests/legacy/gen_orbit_refs.py)
SITE = GeodeticPoint(-10.0, -40.0, 0.0)


@pytest.fixture(scope="session")
def eop() -> EOP:
    return parse_finals2000a((DATA / "finals2000A_2025-2026.all").read_text())


@pytest.fixture(scope="session")
def leo100() -> list[dict]:
    return elements.parse((DATA / "elements_leo100.csv").read_bytes(), "leo100.csv")


@pytest.fixture(scope="session")
def iss2025() -> dict:
    return elements.parse((DATA / "iss_2025-03-17.csv").read_bytes(), "iss.csv")[0]
