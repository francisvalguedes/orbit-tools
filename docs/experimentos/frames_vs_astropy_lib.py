import numpy as np
OMEGA_E = 7.292115146706979e-5


def gmst82(jd_ut1):
    """GMST IAU-82 em rad (Vallado, gstime)."""
    t = (jd_ut1 - 2451545.0) / 36525.0
    g = -6.2e-6 * t**3 + 0.093104 * t**2 + (876600.0 * 3600 + 8640184.812866) * t + 67310.54841
    return np.mod(np.deg2rad(g / 240.0), 2 * np.pi)
