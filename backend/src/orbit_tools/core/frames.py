"""
TEME → ITRS (ECEF), como em Vallado et al. (2006), "Revisiting Spacetrack Report #3", e no astropy.

    r_PEF  = R3(GMST) · r_TEME                     GMST pelo modelo IAU-82, em UT1
    v_PEF  = R3(GMST) · v_TEME − ω × r_PEF
    r_ITRS = Wᵀ · r_PEF                             W: movimento do polo (xp, yp)

O TEME é definido pelo GMST IAU-82, então não há precessão nem nutação a aplicar. Com EOP
(UT1−UTC e polo) o resultado coincide com o do astropy a 1 cm; sem EOP, o erro num LEO é de
20 a 40 m (ver docs/planejamento.md, seção 1.1).
"""

from __future__ import annotations

import numpy as np

from .eop import EOP
from .time import jd_split

# Constantes do ERFA (eraGmst82)
_DJ00 = 2451545.0
_DJC = 36525.0
_DAYSEC = 86400.0
_DS2R = 7.272205216643039903848712e-5  # segundos de tempo → rad
# Velocidade angular da Terra (rad/s), Vallado
OMEGA_EARTH = 7.292115146706979e-5


def gmst82(jd1, jd2) -> np.ndarray:
    """GMST IAU-82 (rad), com a data juliana UT1 em duas partes (mesma formulação do eraGmst82)."""
    jd1 = np.asarray(jd1, dtype=float)
    jd2 = np.asarray(jd2, dtype=float)
    d1 = np.minimum(jd1, jd2)
    d2 = np.maximum(jd1, jd2)
    t = (d1 + (d2 - _DJ00)) / _DJC
    f = _DAYSEC * (np.fmod(d1, 1.0) + np.fmod(d2, 1.0))
    a = 24110.54841 - _DAYSEC / 2.0
    b, c, d = 8640184.812866, 0.093104, -6.2e-6
    return np.mod(_DS2R * ((a + (b + (c + d * t) * t) * t) + f), 2.0 * np.pi)


def teme_to_itrs(r, t, eop: EOP, v=None) -> tuple[np.ndarray, np.ndarray | None]:
    """
    Posição (e, opcionalmente, velocidade) TEME → ITRS.

    Args:
        r: array (..., n, 3) em qualquer unidade (a saída mantém a unidade); o penúltimo eixo
            corresponde aos instantes.
        t: n instantes UTC (`datetime64[ns]`).
        eop: parâmetros de orientação da Terra (`EOP.zero()` para UT1 = UTC e polo nulo).
        v: velocidade (..., n, 3), na unidade de r por segundo; omitida, a saída de v é None.

    Returns:
        (r_itrs, v_itrs) com as formas de r e v.
    """
    r = np.asarray(r, dtype=float)
    jd, fr = jd_split(t)
    dut1, xp, yp = eop.at(t)
    theta = gmst82(jd, fr + dut1 / _DAYSEC)
    c, s = np.cos(theta), np.sin(theta)  # (n,): broadcast com as componentes (..., n)

    x = c * r[..., 0] + s * r[..., 1]
    y = -s * r[..., 0] + c * r[..., 1]
    z = r[..., 2]
    r_itrs = _polar_motion(x, y, z, xp, yp)
    if v is None:
        return r_itrs, None
    v = np.asarray(v, dtype=float)
    vx = c * v[..., 0] + s * v[..., 1] + OMEGA_EARTH * y
    vy = -s * v[..., 0] + c * v[..., 1] - OMEGA_EARTH * x
    return r_itrs, _polar_motion(vx, vy, v[..., 2], xp, yp)


def _polar_motion(x, y, z, xp, yp) -> np.ndarray:
    """r_ITRS = Wᵀ r_PEF, com W = polarm(xp, yp) de Vallado (teoria '80')."""
    cx, sx, cy, sy = np.cos(xp), np.sin(xp), np.cos(yp), np.sin(yp)
    return np.stack(
        [
            cx * x + sx * sy * y + sx * cy * z,
            cy * y - sy * z,
            -sx * x + cx * sy * y + cx * cy * z,
        ],
        axis=-1,
    )
