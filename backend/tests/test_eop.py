import numpy as np
import pytest

from orbit_tools.core.eop import ARCSEC_TO_RAD, EOP, parse_celestrak_csv, parse_finals2000a
from orbit_tools.core.time import parse_utc

from .conftest import DATA

# Trecho real do finals2000A.all em volta do segundo intercalar de 31/12/2016 (UT1−UTC salta +1 s)
LEAP = """\
161230 57752.00 I  0.082883 0.000052  0.263539 0.000038  I-0.4069180 0.0000102 -0.8372 0.0071  I
161231 57753.00 I  0.081400 0.000052  0.263094 0.000039  I-0.4077601 0.0000102 -0.8467 0.0073  I
17 1 1 57754.00 I  0.080136 0.000052  0.262787 0.000039  I 0.5913901 0.0000102 -0.8506 0.0069  I
17 1 2 57755.00 I  0.078925 0.000052  0.262546 0.000039  I 0.5905374 0.0000102 -0.8513 0.0069  I
"""


def test_parse_finals_fixture(eop):
    assert eop.mjd[0] == 60676.0 and eop.mjd[-1] == 61405.0
    assert np.all(np.diff(eop.mjd) == 1.0)
    assert eop.last_observed_mjd == 61349.0  # 05/11/2026: último dia medido, depois previsão
    dut1, xp, yp = eop.at(parse_utc("2026-11-10T00:00:00"))
    assert dut1 == pytest.approx(-0.0648999)
    assert xp == pytest.approx(0.127100 * ARCSEC_TO_RAD)
    assert yp == pytest.approx(0.320643 * ARCSEC_TO_RAD)


def test_linear_interpolation_between_days(eop):
    dut1, _, _ = eop.at(parse_utc(["2026-11-10T00:00:00", "2026-11-10T12:00:00", "2026-11-11T00:00:00"]))
    assert dut1[1] == pytest.approx((dut1[0] + dut1[2]) / 2)


def test_leap_second_is_not_interpolated():
    eop = parse_finals2000a(LEAP)
    t = parse_utc(["2016-12-31T12:00:00", "2016-12-31T23:59:59", "2017-01-01T00:00:00", "2017-01-01T12:00:00"])
    dut1, _, _ = eop.at(t)
    # Sem o tratamento, 31/12 12h daria ~0,09 s (média de −0,41 e +0,59)
    assert dut1[0] == pytest.approx((-0.4077601 + 0.5913901 - 1.0) / 2, abs=1e-9)
    slope = (0.5913901 - 1.0) - (-0.4077601)  # variação contínua em 31/12 (s/dia)
    assert dut1[1] == pytest.approx(-0.4077601 + slope * 86399 / 86400, abs=1e-9)
    assert dut1[2] == pytest.approx(0.5913901, abs=1e-9)
    assert dut1[3] == pytest.approx((0.5913901 + 0.5905374) / 2, abs=1e-9)


def test_outside_table_is_clamped_and_reported(eop):
    t = parse_utc(["2024-06-01T00:00:00", "2026-11-10T00:00:00", "2030-01-01T00:00:00"])
    assert eop.covers(t).tolist() == [False, True, False]
    dut1, _, _ = eop.at(t)
    assert dut1[0] == eop.dut1[0] and dut1[2] == eop.dut1[-1]


def test_zero_eop():
    z = EOP.zero()
    dut1, xp, yp = z.at(parse_utc(["2026-11-10T00:00:00"]))
    assert z.is_zero and dut1[0] == xp[0] == yp[0] == 0.0


def test_celestrak_csv_matches_finals_format():
    csv_text = (
        "DATE,MJD,X,Y,UT1-UTC,LOD,DPSI,DEPS,DX,DY,DAT,DATA_TYPE\n"
        "2026-11-10,61354,0.125881,0.321540,-0.0652348,0.0008471,-0.119494,-0.009652,0.000259,-0.000034,37,O\n"
        "2026-11-11,61355,0.124570,0.322100,-0.0660000,0.0008000,-0.119000,-0.009600,0.000250,-0.000030,37,P\n"
    )
    eop = parse_celestrak_csv(csv_text)
    assert eop.last_observed_mjd == 61354.0
    dut1, _, _ = eop.at(parse_utc("2026-11-10T00:00:00"))
    assert dut1 == pytest.approx(-0.0652348)


def test_invalid_files():
    with pytest.raises(ValueError):
        parse_finals2000a("lixo\n")
    with pytest.raises(ValueError):
        parse_celestrak_csv("DATE,MJD,X,Y,UT1-UTC\n")
    assert (DATA / "finals2000A_2025-2026.all").exists()
