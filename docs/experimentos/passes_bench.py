"""Busca de passagens: PropagInit.search2h0 (antigo) contra versão vetorizada com SatrecArray."""
import sys
import time

import numpy as np
import pandas as pd
from astropy import units as u
from astropy.time import Time, TimeDelta
from sgp4 import omm
from sgp4.api import Satrec, SatrecArray

sys.path.insert(0, "D:/rep_win/TrajectoryOrbitPropag/source")
from lib.orbit_functions import PropagInit  # noqa: E402

from frames_vs_astropy_lib import gmst82  # noqa: E402

WGS84_A, WGS84_F = 6378137.0, 1 / 298.257223563
E2 = WGS84_F * (2 - WGS84_F)
SITE = {"lat": -10.0, "lon": -40.0, "height": 0.0}  # local fictício
DMAX, DMIN = 1100e3, 1000e3


def geod2ecef(lat, lon, h):
    la, lo = np.radians(lat), np.radians(lon)
    n = WGS84_A / np.sqrt(1 - E2 * np.sin(la) ** 2)
    return np.array([(n + h) * np.cos(la) * np.cos(lo), (n + h) * np.cos(la) * np.sin(lo), (n * (1 - E2) + h) * np.sin(la)])


def new_search(rows, t0: Time, t1: Time, step=1.0, coarse=30.0):
    sats = []
    for r in rows:
        s = Satrec()
        omm.initialize(s, r)
        sats.append(s)
    arr = SatrecArray(sats)
    site = geod2ecef(SITE["lat"], SITE["lon"], SITE["height"])
    n = 1 + int((t1 - t0).sec // coarse)
    jd = t0.jd1 + np.zeros(n)
    fr = t0.jd2 + np.arange(n) * coarse / 86400
    passes = []
    chunk = 2000
    rng_all = np.empty((len(sats), n))
    for k in range(0, n, chunk):
        e, r, _ = arr.sgp4(jd[k : k + chunk], fr[k : k + chunk])  # (nsat, nt, 3) km
        th = gmst82(jd[k : k + chunk] + fr[k : k + chunk])
        c, s = np.cos(th), np.sin(th)
        x = c * r[..., 0] + s * r[..., 1]
        y = -s * r[..., 0] + c * r[..., 1]
        d = np.sqrt((1000 * x - site[0]) ** 2 + (1000 * y - site[1]) ** 2 + (1000 * r[..., 2] - site[2]) ** 2)
        d[e != 0] = np.inf
        rng_all[:, k : k + chunk] = d
    inside = rng_all < DMAX
    for i in np.nonzero(inside.any(axis=1))[0]:
        edges = np.diff(inside[i].astype(np.int8))
        starts = np.nonzero(edges == 1)[0] + 1
        ends = np.nonzero(edges == -1)[0] + 1
        # só passagens completas dentro da janela, como no app antigo
        for a in starts:
            b = ends[ends > a]
            if len(b) == 0:
                continue
            b = b[0]
            ta = fr[a] - coarse / 86400
            m = 1 + int(round((fr[b] - ta) * 86400 / step))
            frf = ta + np.arange(m) * step / 86400
            jdf = np.full(m, jd[0])
            e, r, _ = sats[i].sgp4_array(jdf, frf)
            th = gmst82(jdf + frf)
            c, s = np.cos(th), np.sin(th)
            x = 1000 * (c * r[:, 0] + s * r[:, 1])
            y = 1000 * (-s * r[:, 0] + c * r[:, 1])
            d = np.sqrt((x - site[0]) ** 2 + (y - site[1]) ** 2 + (1000 * r[:, 2] - site[2]) ** 2)
            ok = d < DMAX
            if d[ok].min() < DMIN:
                h0 = Time(jdf[ok][0], frf[ok][0], format="jd")
                passes.append((sats[i].satnum, h0.isot, d[ok].min() / 1000, ok.sum()))
    return passes


def old_search(rows, t0, t1):
    out = []
    for r in rows:
        p = PropagInit(r, SITE, 1.0).search2h0(t0, t1, DMAX, DMIN)
        for k in range(len(p.time_array)):
            out.append((p.satellite.satnum, p.time_array[k][0].isot, p.az_el_r[k][:, 2].min() / 1000, len(p.time_array[k])))
    return out


df = pd.read_csv(sys.argv[1])
leo = df[df["MEAN_MOTION"] > 11.25].drop_duplicates("NORAD_CAT_ID")
t0 = Time(pd.Timestamp.utcnow().floor("h").tz_localize(None).to_pydatetime(), scale="utc")
t1 = t0 + TimeDelta(1 * u.d)
nold = int(sys.argv[2])
rows = leo.head(nold).to_dict("records")

tic = time.perf_counter()
old = old_search(rows, t0, t1)
t_old = time.perf_counter() - tic
tic = time.perf_counter()
new = new_search(rows, t0, t1)
t_new = time.perf_counter() - tic
print(f"{nold} objetos, 1 dia: antigo {t_old:.1f} s ({len(old)} passagens); novo {t_new:.2f} s ({len(new)} passagens)")

o = pd.DataFrame(old, columns=["norad", "h0", "dmin", "n"]).sort_values(["norad", "h0"]).reset_index(drop=True)
nw = pd.DataFrame(new, columns=["norad", "h0", "dmin", "n"]).sort_values(["norad", "h0"]).reset_index(drop=True)
if len(o) == len(nw):
    dh0 = (pd.to_datetime(o.h0) - pd.to_datetime(nw.h0)).dt.total_seconds().abs()
    print(f"  mesmas passagens; |ΔH0| máx {dh0.max():.3f} s; |Δdmin| máx {(o.dmin - nw.dmin).abs().max()*1000:.1f} m; |Δn| máx {(o.n - nw.n).abs().max()}")
else:
    print("  número de passagens diferente")

for n in (len(leo) // 4, len(leo)):
    rows = leo.head(n).to_dict("records")
    tic = time.perf_counter()
    p = new_search(rows, t0, t1)
    print(f"novo: {n} objetos, 1 dia: {time.perf_counter() - tic:.1f} s ({len(p)} passagens)")
