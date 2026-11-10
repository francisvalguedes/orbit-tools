from datetime import UTC, datetime, timedelta, timezone

import numpy as np
import pytest

from orbit_tools.core.time import ceil_to_second, clock, isot, jd_split, mjd, parse_utc, seconds_between, time_grid


@pytest.mark.parametrize(
    "value",
    [
        "2026-11-11T12:30:00.25",
        "2026-11-11 12:30:00.250",
        "2026-11-11T12:30:00.250Z",
        "2026-11-11T12:30:00.25+00:00",
        datetime(2026, 11, 11, 12, 30, 0, 250000),
        datetime(2026, 11, 11, 9, 30, 0, 250000, tzinfo=timezone(timedelta(hours=-3))),
        np.datetime64("2026-11-11T12:30:00.250"),
    ],
)
def test_parse_utc(value):
    assert parse_utc(value) == np.datetime64("2026-11-11T12:30:00.250000000")


def test_parse_utc_array_keeps_shape():
    t = np.array(["2026-01-01T00:00:00", "2026-01-02T00:00:00"], dtype="datetime64[s]")
    out = parse_utc(t)
    assert out.dtype == np.dtype("datetime64[ns]") and out.shape == (2,)


def test_jd_split_matches_known_dates():
    jd, fr = jd_split(parse_utc(["2000-01-01T12:00:00", "2026-11-11T06:00:00"]))
    np.testing.assert_allclose(jd + fr, [2451545.0, 2461355.75])
    assert ((fr >= 0) & (fr < 1)).all()
    np.testing.assert_allclose(mjd(parse_utc("2026-11-10T00:00:00")), 61354.0)


def test_time_grid_exact_at_100_hz():
    t = time_grid("2026-11-11T00:00:00", 0.01, 90_001)
    assert t[-1] == np.datetime64("2026-11-11T00:15:00")
    assert seconds_between(t[0], t[-1]) == 900.0


def test_formats_and_rounding():
    t = parse_utc("2026-11-11T00:00:54.5")
    assert isot(t) == "2026-11-11T00:00:54.500"
    assert clock(t) == "00:00:54.500"
    assert clock(t, "us") == "00:00:54.500000"
    assert ceil_to_second(t) == np.datetime64("2026-11-11T00:00:55")
    assert ceil_to_second(parse_utc("2026-11-11T00:00:54")) == np.datetime64("2026-11-11T00:00:54")
    assert datetime.now(UTC)  # sanity: UTC importável (usado pela API)
