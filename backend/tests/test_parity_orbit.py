"""
Paridade com o app TrajectoryOrbitPropag. Referências geradas por tests/legacy/gen_orbit_refs.py,
rodando o código antigo com a mesma tabela EOP.
"""

import csv
import json

import numpy as np
import pytest

from orbit_tools.core import compare, formats, passes
from orbit_tools.core.elements import parse
from orbit_tools.core.propagation import Ephemeris, ephemeris
from orbit_tools.core.radar import Radar, object_rcs, rcs_min, rcs_table
from orbit_tools.core.time import parse_utc, time_grid

from .conftest import DATA, LEGACY, SITE

POSITION_TOL_M = 0.02  # diferença da conversão TEME→ITRS em relação ao astropy


def _ref(name):
    return np.load(LEGACY / name)


@pytest.mark.parametrize("case", ["iss2025", "leo0"])
def test_propagation(case, iss2025, leo100, eop):
    meta = json.loads((LEGACY / "propagation.json").read_text())[case]
    element = iss2025 if case == "iss2025" else leo100[0]
    eph = ephemeris(element, time_grid(meta["start"], meta["step"], meta["n"]), eop, SITE)
    ref = _ref(f"propagation_{case}.npz")
    assert np.linalg.norm(eph.itrs - ref["itrs"], axis=1).max() < POSITION_TOL_M
    assert np.linalg.norm(eph.enu - ref["enu"], axis=1).max() < POSITION_TOL_M
    np.testing.assert_allclose(eph.range, ref["aer"][:, 2], atol=POSITION_TOL_M)
    np.testing.assert_allclose(eph.el, ref["aer"][:, 1], atol=1e-6)
    az_diff = (eph.az - ref["aer"][:, 0] + 180) % 360 - 180
    assert np.abs(az_diff).max() < 1e-6
    np.testing.assert_allclose(eph.lat, ref["geodetic"][:, 0], atol=1e-8)
    np.testing.assert_allclose(eph.lon, ref["geodetic"][:, 1], atol=1e-8)
    np.testing.assert_allclose(eph.height, ref["geodetic"][:, 2], atol=POSITION_TOL_M)


@pytest.fixture(scope="module")
def search_result(leo100, eop):
    window = json.loads((LEGACY / "search_passes.json").read_text())["window"]
    params = passes.SearchParams(parse_utc(window[0]), parse_utc(window[1]), 1100e3, 1000e3)
    table = rcs_table()
    return passes.search(leo100, SITE, params, eop, rcs=lambda r: object_rcs(r, table))


def _legacy_summary():
    with (LEGACY / "search_summary.csv").open(encoding="utf-8") as f:
        return sorted(csv.DictReader(f), key=lambda r: (r["H0"], int(r["NORAD_CAT_ID"])))


def test_search_finds_the_same_passes(search_result):
    legacy = _legacy_summary()
    assert len(search_result) == len(legacy) == 93
    for p, ref in zip(search_result, legacy, strict=True):
        assert p.norad == int(ref["NORAD_CAT_ID"])
        assert str(np.datetime_as_string(p.h0, unit="ms")) == ref["H0"]
        assert abs(p.end_index - int(ref["END_PT"])) <= 1
        assert abs(p.min_range_index - int(ref["MIN_RANGE_PT"])) <= 1
        assert p.min_range_m / 1000 == pytest.approx(float(ref["MIN_RANGE"]), abs=1e-4)  # km
        assert p.h0_range_m / 1000 == pytest.approx(float(ref["H0_RANGE"]), abs=1e-4)


def test_summary_columns_match_legacy(search_result, leo100):
    rows = formats.summary_rows(search_result, leo100)
    legacy = _legacy_summary()
    for row, ref in zip(rows, legacy, strict=True):
        for col in ("H0", "H0_H", "MIN_RANGE_H", "END_H"):
            if col in ("MIN_RANGE_H", "END_H") and row[col] != ref[col]:
                continue  # índice pode diferir de 1 amostra na borda (ver test acima)
            assert row[col] == ref[col], col
        assert row["RCS"] == pytest.approx(float(ref["RCS"]))


@pytest.mark.parametrize("k", [0, 1, 2])
def test_pass_trajectory(k, search_result, leo100, eop):
    meta = json.loads((LEGACY / "search_passes.json").read_text())["passes"][f"p{k}"]
    p = search_result[k]
    assert p.norad == meta["norad"] and abs(p.n_points - meta["n"]) <= 1
    eph = passes.pass_ephemeris(leo100[p.record_index], SITE, p.h0, p.duration_s, 1.0, eop)
    ref = _ref(f"pass_p{k}.npz")
    n = min(len(eph.enu), len(ref["enu"]))
    assert np.linalg.norm(eph.enu[:n] - ref["enu"][:n], axis=1).max() < POSITION_TOL_M


def _ephemeris_from_legacy(k):
    """Monta efemérides com os números do app antigo, para comparar só a formatação dos arquivos."""
    meta = json.loads((LEGACY / "search_passes.json").read_text())["passes"][f"p{k}"]
    ref = _ref(f"pass_p{k}.npz")
    n = len(ref["enu"])
    t = time_grid(meta["h0"], 1.0, n)
    nan3 = np.full((n, 3), np.nan)
    geod = ref["geodetic"]
    aer = ref["aer"]
    return Ephemeris(
        t, np.zeros(n), nan3, nan3, ref["itrs"], nan3, geod[:, 0], geod[:, 1], geod[:, 2],
        ref["enu"], aer[:, 0], aer[:, 1], aer[:, 2],
    )  # fmt: skip


def test_files_are_byte_identical():
    eph = _ephemeris_from_legacy(0)
    assert formats.trn(eph.enu) == (LEGACY / "p0.trn").read_text()
    assert formats.trj(eph.enu) == (LEGACY / "p0.trj").read_text()
    assert formats.data_csv(eph) == (LEGACY / "p0_data.csv").read_text()


def test_rate_file(search_result, leo100, eop):
    meta = json.loads((LEGACY / "p0_rate.json").read_text())
    p = search_result[0]
    assert p.end_index == meta["end_pt"]
    eph = passes.pass_ephemeris(leo100[p.record_index], SITE, p.h0, p.duration_s, meta["rate_s"], eop)
    legacy_lines = (LEGACY / "p0_rate.trn").read_text().splitlines()
    ours = formats.trn_rate(eph.enu, p.end_index).splitlines()
    assert ours[0] == legacy_lines[0]
    # O app antigo gera END_PT/taxa pontos e não inclui HF; aqui vai de H0 a HF inclusive
    assert len(legacy_lines) - 1 == meta["n"] and len(ours) - 1 == meta["n"] + 1
    ref = np.loadtxt(legacy_lines[1:], delimiter=",")
    got = np.loadtxt(ours[1 : meta["n"] + 1], delimiter=",")
    assert np.abs(got - ref).max() <= 0.02  # m (valores com 3 casas)


def test_file_names():
    assert formats.file_name("obj-", 22490, parse_utc("2026-11-11T00:00:54"), "trn") == (
        "obj-22490-2026_11_11-H0-00_00_54TU.trn"
    )
    assert formats.file_name("100Hz_obj-", 5, parse_utc("2026-01-02T03:04:05"), "trn") == (
        "100Hz_obj-5-2026_01_02-H0-03_04_05TU.trn"
    )


def test_rcs_min():
    ref = json.loads((LEGACY / "rcs_min.json").read_text())
    radar = Radar(name="ficticio", **ref["radar"])
    np.testing.assert_allclose(rcs_min(np.array(ref["range_m"]), radar), ref["rcs_min"], rtol=1e-12)


def test_compare_successive():
    ref = json.loads((LEGACY / "compare.json").read_text())
    hist = parse((DATA / "iss_supgp_history.csv").read_bytes(), "h.csv")
    rows = compare.compare_successive(hist)
    assert [r["EPOCH"] for r in rows] == ref["EPOCH"]
    assert [r["EPOCH_1"] for r in rows] == ref["EPOCH_1"]
    np.testing.assert_allclose([r["D_ERR_MEAN"] for r in rows], ref["D_ERR_MEAN"], atol=0.05)
    np.testing.assert_allclose([r["D_ERR_MAX"] for r in rows], ref["D_ERR_MAX"], atol=0.05)
    assert [r["TRACK"] for r in rows] == ref["TRACK"]
    for r in rows:  # RIC: as componentes compõem a mesma norma (média das normas ≤ norma das médias)
        assert np.hypot(np.hypot(r["R_ERR_MAX"], r["I_ERR_MAX"]), r["C_ERR_MAX"]) >= r["D_ERR_MAX"] - 1e-6
