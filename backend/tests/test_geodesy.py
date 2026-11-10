"""
Conversões geodésicas comparadas ao pymap3d, que é o que as páginas do conversor antigo chamam.
Testes de ida e volta e de paridade adaptados do trajetory-analysis (tests/test_geodesy.py).
"""

import numpy as np
import pymap3d as pm
import pytest

from orbit_tools.core.geodesy import (
    GeodeticPoint,
    LocalFrame,
    aer_to_enu,
    dd_to_dms,
    dd_to_dms_signed,
    dms_to_dd,
    ecef_to_geodetic,
    enu_to_aer,
    enu_to_enu,
    geodetic_to_ecef,
    get_ellipsoid,
    ground_circle,
)

from .legacy import converter_reference as legacy

# Locais fictícios
A = GeodeticPoint(-10.0, -40.0, 50.0)
B = GeodeticPoint(-10.4, -39.6, 120.0)
WGS84 = pm.Ellipsoid.from_name("wgs84")
rng = np.random.default_rng(42)


@pytest.mark.parametrize("datum", ["wgs84", "wgs72"])
def test_geodetic_ecef_roundtrip_and_parity(datum):
    ell = get_ellipsoid(datum)
    lat = rng.uniform(-89.9, 89.9, 500)
    lon = rng.uniform(-180, 180, 500)
    h = rng.uniform(-5_000, 40_000_000, 500)

    ecef = geodetic_to_ecef(lat, lon, h, ell)
    ref = np.column_stack(pm.geodetic2ecef(lat, lon, h, ell=pm.Ellipsoid.from_name(datum)))
    np.testing.assert_allclose(ecef, ref, atol=1e-6)

    lat2, lon2, h2 = ecef_to_geodetic(ecef, ell)
    np.testing.assert_allclose(lat2, lat, atol=1e-10)
    np.testing.assert_allclose(lon2, lon, atol=1e-10)
    np.testing.assert_allclose(h2, h, atol=1e-6)


def _shell(r_min, r_max, n=1000):
    d = rng.normal(size=(n, 3))
    return d / np.linalg.norm(d, axis=1, keepdims=True) * rng.uniform(r_min, r_max, (n, 1))


def test_ecef_to_geodetic_parity_with_pymap3d_up_to_leo():
    """Página 05 do conversor (ECEF → geodésicas), da superfície até ~600 km de altitude."""
    ecef = _shell(6.35e6, 7.0e6)
    lat, lon, h = ecef_to_geodetic(ecef, get_ellipsoid("wgs84"))
    lat_r, lon_r, h_r = pm.ecef2geodetic(*ecef.T)
    np.testing.assert_allclose(lat, lat_r, atol=1e-9)
    np.testing.assert_allclose(lon, lon_r, atol=1e-9)
    np.testing.assert_allclose(h, h_r, atol=1e-3)


def test_ecef_to_geodetic_exact_at_high_altitude():
    """
    Acima do LEO a solução fechada do pymap3d perde precisão (5 cm a 1 600 km, ~80 m em GEO);
    a de Vermeille continua exata. Diferença documentada em docs/calculo.md.
    """
    ell = get_ellipsoid("wgs84")
    ecef = _shell(2.0e7, 4.3e7)
    ours = geodetic_to_ecef(*ecef_to_geodetic(ecef, ell), ell)
    ref = geodetic_to_ecef(*pm.ecef2geodetic(*ecef.T), ell)
    assert np.abs(ours - ecef).max() < 1e-6
    assert np.linalg.norm(ref - ecef, axis=1).max() > 1.0


def test_ecef_to_geodetic_poles_and_equator():
    ell = get_ellipsoid("wgs84")
    lat, _, h = ecef_to_geodetic(np.array([[0.0, 0.0, ell.b + 100.0], [ell.a + 10.0, 0.0, 0.0]]), ell)
    np.testing.assert_allclose(lat, [90.0, 0.0], atol=1e-12)
    np.testing.assert_allclose(h, [100.0, 10.0], atol=1e-6)


def test_enu_roundtrip_and_parity():
    """Páginas 02 e 03 do conversor (geodésicas/ENU ↔ ECEF)."""
    frame = LocalFrame(A, get_ellipsoid("wgs84"))
    enu = rng.uniform(-800_000, 800_000, (300, 3))
    ecef = frame.to_ecef(enu)
    ref = np.column_stack(pm.enu2ecef(*enu.T, A.lat, A.lon, A.height, ell=WGS84))
    np.testing.assert_allclose(ecef, ref, atol=1e-6)
    np.testing.assert_allclose(frame.from_ecef(ecef), enu, atol=1e-6)


def test_enu_to_aer_parity():
    enu = rng.uniform(-500_000, 500_000, (300, 3))
    az, el, r = enu_to_aer(enu)
    az_ref, el_ref, r_ref = pm.enu2aer(*enu.copy().T, deg=False)
    np.testing.assert_allclose(az, az_ref, atol=1e-12)
    np.testing.assert_allclose(el, el_ref, atol=1e-12)
    np.testing.assert_allclose(r, r_ref, atol=1e-6)
    assert ((az >= 0) & (az < 2 * np.pi)).all()


def test_aer_to_enu_parity_and_inverse():
    az = rng.uniform(0, 2 * np.pi, 500)
    el = rng.uniform(-0.2, np.pi / 2, 500)
    r = rng.uniform(1, 4e6, 500)
    enu = aer_to_enu(az, el, r)
    np.testing.assert_allclose(enu, np.column_stack(pm.aer2enu(az, el, r, deg=False)), atol=1e-6)
    az2, el2, r2 = enu_to_aer(enu)
    np.testing.assert_allclose(az2, az, atol=1e-12)
    np.testing.assert_allclose(el2, el, atol=1e-12)
    np.testing.assert_allclose(r2, r, rtol=1e-12)


def test_enu_to_enu_parity():
    """Páginas 04 e 06 do conversor (ENU¹ → ENU², via ECEF com o pymap3d)."""
    ell = get_ellipsoid("wgs84")
    enu1 = rng.uniform(-300_000, 300_000, (300, 3))
    ours = enu_to_enu(enu1, LocalFrame(A, ell), LocalFrame(B, ell))
    ecef = np.column_stack(pm.enu2ecef(*enu1.T, A.lat, A.lon, A.height, ell=WGS84))
    ref = np.column_stack(pm.ecef2enu(*ecef.T, B.lat, B.lon, B.height, ell=WGS84))
    np.testing.assert_allclose(ours, ref, atol=1e-6)


def test_ground_circle_matches_legacy():
    """`geodetic_circ` do app de propagação (círculos do mapa)."""
    lat, lon = ground_circle(A, 1_100_000.0)
    theta = np.linspace(0, 2 * np.pi, 30)
    lat_r, lon_r, _ = pm.enu2geodetic(
        1.1e6 * np.cos(theta), 1.1e6 * np.sin(theta), np.zeros(30), A.lat, A.lon, A.height
    )
    np.testing.assert_allclose(lat, lat_r, atol=1e-9)
    np.testing.assert_allclose(lon, lon_r, atol=1e-9)


@pytest.mark.parametrize(
    ("value", "kind", "expected"),
    [
        (-5.922225, "lat", "5°55'20.010\"S"),
        (-35.1615117, "lon", "35°09'41.442\"W"),
        (10.5, "lat", "10°30'00.000\"N"),
        (0.99999999999, "lon", "1°00'00.000\"E"),
    ],
)
def test_dd_to_dms(value, kind, expected):
    assert dd_to_dms(value, kind) == expected


def test_dms_parity_with_legacy_converter():
    values = rng.uniform(-180, 180, 2000)
    for v in values:
        text = legacy.dd_to_dms_string(v)
        assert dd_to_dms_signed(v) == text
        assert dms_to_dd(text) == pytest.approx(legacy.dms_to_dd(text), abs=1e-12)


def test_dms_fixes_sixty_seconds():
    assert legacy.dd_to_dms_string(10.9999999999) == "10°59'60.000000\""  # defeito do app antigo
    assert dd_to_dms_signed(10.9999999999) == "11°0'0.000000\""
    assert dms_to_dd(dd_to_dms_signed(10.9999999999)) == pytest.approx(11.0)


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("-1°49'10.583775\"", -(1 + 49 / 60 + 10.583775 / 3600)),
        ("5°55'20.010\"S", -(5 + 55 / 60 + 20.010 / 3600)),
        ("35°09'41.442\"W", -(35 + 9 / 60 + 41.442 / 3600)),
        ("35 09 41,442 O", -(35 + 9 / 60 + 41.442 / 3600)),
        ("44 18 50 L", 44 + 18 / 60 + 50 / 3600),
        ("-0°30'0\"", -0.5),
        ("12.5", 12.5),
    ],
)
def test_dms_to_dd_formats(text, expected):
    assert dms_to_dd(text) == pytest.approx(expected, abs=1e-12)


@pytest.mark.parametrize("text", ["", "abc", "10°75'00\"", "-5°55'20\"S", "1 2 3 4"])
def test_dms_to_dd_rejects_invalid(text):
    with pytest.raises(ValueError):
        dms_to_dd(text)
