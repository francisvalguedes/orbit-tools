"""Velocidade e aceleração (página 06 do conversor antigo) e a diferença documentada na aceleração."""

import numpy as np

from orbit_tools.core.kinematics import derivatives

from .legacy import converter_reference as legacy


def _trajectory(h):
    t = np.arange(0, 60, h)
    return t, 1000 * t + 4.9 * t**2 + 30 * np.sin(0.5 * t)


def test_velocity_matches_legacy_inside():
    h = 0.1
    _, x = _trajectory(h)
    v, _ = derivatives(x, h)
    v_old, _ = legacy.velocity_acceleration(x, h)
    np.testing.assert_allclose(v[1:-1], v_old[1:-1], rtol=1e-12)
    # Nas bordas o app antigo usava diferença de 1ª ordem; aqui é de 2ª ordem (mais exata)
    t, _ = _trajectory(h)
    exact_v = 1000 + 9.8 * t + 15 * np.cos(0.5 * t)
    assert abs(v[0] - exact_v[0]) < abs(v_old[0] - exact_v[0])


def test_acceleration_uses_nearest_neighbors():
    """O app antigo aplicava np.gradient duas vezes (pontos i±2); aqui a segunda diferença (i±1)."""
    h = 0.1
    t, x = _trajectory(h)
    _, a = derivatives(x, h)
    _, a_old = legacy.velocity_acceleration(x, h)
    exact = 9.8 - 7.5 * np.sin(0.5 * t)
    inner = slice(2, -2)
    np.testing.assert_allclose(a_old[inner], (x[4:] - 2 * x[2:-2] + x[:-4]) / (4 * h**2), rtol=1e-9)
    assert np.max(np.abs(a[inner] - exact[inner])) < np.max(np.abs(a_old[inner] - exact[inner]))
    assert np.isnan(a[0]) and np.isnan(a[-1])
