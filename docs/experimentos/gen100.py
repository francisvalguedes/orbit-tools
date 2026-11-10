import time, numpy as np, pandas as pd
from sgp4 import omm
from sgp4.api import Satrec, jday
from frames_vs_astropy_lib import gmst82
rows = pd.read_csv(r"%S%/data/active.csv".replace("%S%", __import__("sys").argv[1])).query("MEAN_MOTION>11.25").head(30).to_dict("records")
tic = time.perf_counter()
for r in rows:
    s = Satrec(); omm.initialize(s, r)
    jd, fr = jday(2026, 11, 11, 12, 0, 0)
    n = 900 * 100
    frs = fr + np.arange(n) * 0.01 / 86400
    e, rr, v = s.sgp4_array(np.full(n, jd), frs)
    th = gmst82(jd + frs); c, si = np.cos(th), np.sin(th)
    x = c*rr[:,0] + si*rr[:,1]; y = -si*rr[:,0] + c*rr[:,1]
print(f"30 passagens de 900 s a 100 Hz (2,7 milhões de pontos): {time.perf_counter()-tic:.2f} s")
