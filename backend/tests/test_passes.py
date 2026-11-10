"""Comportamentos da busca de passagens que não existiam no app antigo."""

import numpy as np
import pytest

from orbit_tools.core import passes
from orbit_tools.core.elements import satrec
from orbit_tools.core.propagation import propagate_teme
from orbit_tools.core.radar import RCS_BY_SIZE, Radar, detection, margin_db, object_rcs, rcs_min, rcs_table
from orbit_tools.core.time import parse_utc, time_grid

from .conftest import SITE

DAY = (parse_utc("2026-11-11T00:00:00"), parse_utc("2026-11-12T00:00:00"))
RADAR = Radar("ficticio", pt=60.0, gt=42.0, gr=42.0, lt=1.4, lr=1.6, fhz=5400.0, sr=-140.0, snr=0.0)


def _search(records, eop, **kw):
    params = passes.SearchParams(kw.pop("start", DAY[0]), kw.pop("end", DAY[1]), 1100e3, 1000e3, **kw)
    return passes.search(records, SITE, params, eop)


@pytest.fixture(scope="module")
def first_pass(leo100, eop):
    return _search(leo100, eop)[0]


def test_partial_passes_only_when_asked(leo100, eop, first_pass):
    start = first_pass.h0 + np.timedelta64(60, "s")
    record = [leo100[first_pass.record_index]]
    assert all(p.h0 != start for p in _search(record, eop, start=start))
    cut = [p for p in _search(record, eop, start=start, include_partial=True) if p.h0 == start]
    assert len(cut) == 1 and cut[0].partial
    assert cut[0].hf == first_pass.hf


def test_minimum_elevation(leo100, eop):
    every = _search(leo100, eop)
    high = _search(leo100, eop, min_el_deg=30.0)
    assert 0 < len(high) < len(every)
    for p in high:
        eph = passes.pass_ephemeris(leo100[p.record_index], SITE, p.h0, p.duration_s, 1.0, eop)
        assert eph.el.min() >= 30.0 - 1e-9
        assert p.max_el_deg >= 30.0


def test_search_start_is_rounded_to_whole_second(leo100, eop):
    found = _search(leo100[:20], eop, start=parse_utc("2026-11-11T00:00:00.4"))
    assert found and all(p.h0.astype("datetime64[s]") == p.h0 for p in found)


def test_pass_statistics_are_consistent(leo100, eop, first_pass):
    p = first_pass
    eph = passes.pass_ephemeris(leo100[p.record_index], SITE, p.h0, p.duration_s, 1.0, eop)
    assert len(eph.time) == p.n_points and eph.time[-1] == p.hf
    assert eph.range.min() == pytest.approx(p.min_range_m) and int(np.argmin(eph.range)) == p.min_range_index
    assert eph.el.max() == pytest.approx(p.max_el_deg)
    assert p.max_az_rate_deg_s > 0 and p.max_el_rate_deg_s > 0
    assert 0.5 < p.epoch_age_days < 1.0  # elementos de 10/11, passagem logo após 0h de 11/11


def test_sgp4_errors_become_nan_and_do_not_break_search(leo100, eop):
    decaying = dict(leo100[0], NORAD_CAT_ID=99999, MEAN_MOTION=16.45, ECCENTRICITY=0.0001, BSTAR=0.9)
    e, r, _ = propagate_teme(satrec(decaying), time_grid("2026-11-10T04:30:00", 600.0, 144))
    assert (e != 0).any() and np.isnan(r[e != 0]).all()
    _search([decaying, *leo100[:5]], eop)


def test_radar_detection_along_the_pass(leo100, eop, first_pass):
    table = rcs_table()
    record = leo100[first_pass.record_index]
    rcs, source = object_rcs(record, table)
    found = passes.search(
        [record],
        SITE,
        passes.SearchParams(*DAY, 1100e3, 1000e3),
        eop,
        radar=RADAR,
        rcs=lambda r: object_rcs(r, table),
    )
    p = next(x for x in found if x.h0 == first_pass.h0)
    assert p.rcs_m2 == rcs and p.rcs_source == source
    assert p.detection.max_margin_db == pytest.approx(10 * np.log10(rcs / rcs_min(p.min_range_m, RADAR)))


def test_rcs_lookup():
    table = {1: 2.5, 2: 0.0}
    assert object_rcs({"NORAD_CAT_ID": 1}, table) == (2.5, "tabela")
    assert object_rcs({"NORAD_CAT_ID": 2, "RCS_SIZE": "medium"}, table) == (RCS_BY_SIZE["MEDIUM"], "classe")
    assert object_rcs({"NORAD_CAT_ID": 3}, table) == (None, "desconhecido")
    assert rcs_table()[25544] > 0


def test_detection_summary():
    r = np.array([1500e3, 1000e3, 500e3, 1000e3, 1500e3])
    rcs = float(rcs_min(1000e3, RADAR)) * 1.001  # detectável até pouco além de 1 000 km
    margin = margin_db(rcs, r, RADAR)
    det = detection(margin, 1.0)
    assert det.max_margin_db == pytest.approx(10 * np.log10(rcs / rcs_min(500e3, RADAR)))
    assert det.detectable_s == 3.0
    assert (det.first_index, det.last_index) == (1, 3)
    assert detection(margin_db(rcs / 1e6, r, RADAR), 1.0).first_index is None


def test_progress_and_validation(leo100, eop):
    seen = []
    params = passes.SearchParams(*DAY, 1100e3, 1000e3)
    passes.search(leo100, SITE, params, eop, progress=seen.append, group_size=30)
    assert seen == sorted(seen) and seen[-1] == 1.0 and len(seen) == 4
    with pytest.raises(ValueError, match="maior que a mínima"):
        passes.search(leo100, SITE, passes.SearchParams(*DAY, 900e3, 1000e3), eop)


def test_prefilter_by_perigee(leo100):
    keep, drop = passes.prefilter(leo100, 700e3)
    assert keep and drop and len(keep) + len(drop) == len(leo100)
