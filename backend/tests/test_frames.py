"""TEME → ITRS contra o astropy (dependência só de teste), com a mesma tabela EOP."""

import warnings

import numpy as np
import pytest

from orbit_tools.core.elements import satrec
from orbit_tools.core.eop import EOP
from orbit_tools.core.frames import gmst82, teme_to_itrs
from orbit_tools.core.propagation import propagate_teme
from orbit_tools.core.time import isot, jd_split, time_grid

from .conftest import DATA

astropy = pytest.importorskip("astropy")
from astropy import units as u  # noqa: E402
from astropy.coordinates import ITRS, TEME, CartesianDifferential, CartesianRepresentation  # noqa: E402
from astropy.time import Time  # noqa: E402
from astropy.utils import iers  # noqa: E402


@pytest.fixture(scope="module", autouse=True)
def astropy_eop():
    iers.conf.auto_download = False
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        iers.earth_orientation_table.set(iers.IERS_A.open(str(DATA / "finals2000A_2025-2026.all")))
    yield


def _astropy_itrs(r, v, t):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        times = Time(isot(t, "ns").tolist(), scale="utc")
        rep = CartesianRepresentation(r.T * u.m, differentials=CartesianDifferential(v.T * u.m / u.s))
        itrs = TEME(rep, obstime=times).transform_to(ITRS(obstime=times))
    return itrs.cartesian.xyz.to_value(u.m).T, itrs.velocity.d_xyz.to_value(u.m / u.s).T


def test_gmst82_matches_erfa():
    import erfa

    jd, fr = jd_split(time_grid("2026-11-11T00:00:00", 3601.7, 50))
    np.testing.assert_allclose(gmst82(jd, fr), erfa.gmst82(jd, fr), atol=1e-15)


@pytest.mark.parametrize("start", ["2025-03-17T09:00:00", "2026-11-11T00:00:00"])
def test_teme_to_itrs_matches_astropy(iss2025, leo100, eop, start):
    element = iss2025 if start.startswith("2025") else leo100[0]
    t = time_grid(start, 10.0, 8640)  # 1 dia
    _, r, v = propagate_teme(satrec(element), t)
    ours_r, ours_v = teme_to_itrs(r, t, eop, v)
    ref_r, ref_v = _astropy_itrs(r, v, t)
    assert np.max(np.linalg.norm(ours_r - ref_r, axis=1)) < 0.02  # m
    assert np.max(np.linalg.norm(ours_v - ref_v, axis=1)) < 1e-4  # m/s


def test_without_eop_error_is_tens_of_meters(iss2025, eop):
    t = time_grid("2025-03-17T09:00:00", 60.0, 1440)
    _, r, _ = propagate_teme(satrec(iss2025), t)
    with_eop, _ = teme_to_itrs(r, t, eop)
    without, _ = teme_to_itrs(r, t, EOP.zero())
    err = np.linalg.norm(with_eop - without, axis=1)
    assert 5 < err.max() < 60


def test_shapes_for_many_objects(leo100, eop):
    from sgp4.api import SatrecArray

    t = time_grid("2026-11-11T00:00:00", 60.0, 7)
    _, r, v = propagate_teme(SatrecArray([satrec(x) for x in leo100[:5]]), t)
    r_itrs, v_itrs = teme_to_itrs(r, t, eop, v)
    assert r_itrs.shape == v_itrs.shape == (5, 7, 3)
    single, _ = teme_to_itrs(r[2], t, eop)
    np.testing.assert_allclose(r_itrs[2], single)
