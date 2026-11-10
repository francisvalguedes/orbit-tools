"""TEME->ITRS: implementação própria (GMST IAU-82, Vallado) contra astropy, com e sem EOP."""
import sys
import time

import numpy as np
import pandas as pd
from astropy import units as u
from astropy.coordinates import ITRS, TEME, CartesianRepresentation
from astropy.time import Time, TimeDelta
from astropy.utils import iers
from sgp4 import omm
from sgp4.api import Satrec

OMEGA_E = 7.292115146706979e-5


def gmst82(jd_ut1):
    """GMST IAU-82 em rad (Vallado, gstime)."""
    t = (jd_ut1 - 2451545.0) / 36525.0
    g = -6.2e-6 * t**3 + 0.093104 * t**2 + (876600.0 * 3600 + 8640184.812866) * t + 67310.54841
    return np.mod(np.deg2rad(g / 240.0), 2 * np.pi)


def teme_to_itrs(r, jd_ut1, xp=0.0, yp=0.0):
    th = gmst82(jd_ut1)
    c, s = np.cos(th), np.sin(th)
    x = c * r[:, 0] + s * r[:, 1]
    y = -s * r[:, 0] + c * r[:, 1]
    z = r[:, 2]
    # movimento do polo (aprox. de pequenos ângulos): r_itrs = W^T r_pef
    xi = x + xp * z
    yi = y - yp * z
    zi = -xp * x + yp * y + z
    return np.column_stack([xi, yi, zi])


row = pd.read_csv(sys.argv[1]).iloc[0].to_dict()
sat = Satrec()
omm.initialize(sat, row)
t0 = Time(row["EPOCH"], scale="utc")
n = 86400 // 10 * 3  # 3 dias a cada 10 s
times = t0 + TimeDelta(np.arange(n) * 10.0 * u.s)
e, r, v = sat.sgp4_array(times.jd1, times.jd2)
r = r * 1000

tic = time.perf_counter()
teme = TEME(CartesianRepresentation(r[:, 0] * u.m, r[:, 1] * u.m, r[:, 2] * u.m), obstime=times)
loc = teme.transform_to(ITRS(obstime=times)).earth_location
ref = np.column_stack([loc.x.value, loc.y.value, loc.z.value])
t_astropy = time.perf_counter() - tic

tic = time.perf_counter()
mine0 = teme_to_itrs(r, times.jd1 + times.jd2)  # UT1 = UTC, sem polo
t_mine = time.perf_counter() - tic

dut1 = times.delta_ut1_utc
ut1 = times.ut1
tab = iers.earth_orientation_table.get()
xp, yp = tab.pm_xy(times)
mine1 = teme_to_itrs(r, ut1.jd1 + ut1.jd2, xp.to_value(u.rad), yp.to_value(u.rad))

d0 = np.linalg.norm(mine0 - ref, axis=1)
d1 = np.linalg.norm(mine1 - ref, axis=1)
print(f"objeto {row['OBJECT_NAME']} época {row['EPOCH']}  amostras {n}")
print(f"DUT1 médio {np.mean(np.asarray(getattr(dut1, "value", dut1))):+.4f} s; xp {np.mean(xp.to_value(u.arcsec)):.3f}\" yp {np.mean(yp.to_value(u.arcsec)):.3f}\"")
print(f"sem EOP (UT1=UTC, sem polo): erro máx {d0.max():8.2f} m  médio {d0.mean():8.2f} m")
print(f"com EOP (DUT1 + polo):       erro máx {d1.max():8.4f} m  médio {d1.mean():8.4f} m")
print(f"tempo astropy {t_astropy*1000:.1f} ms; próprio {t_mine*1000:.2f} ms")
