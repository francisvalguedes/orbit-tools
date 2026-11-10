# ruff: noqa: F821  -- o laço transcrito da página 04 usa `orbital_elem_row` da iteração anterior, como no original
"""
Gera as referências dos testes de paridade rodando o código do app TrajectoryOrbitPropag.

Roda no ambiente do app antigo, a partir da raiz dele:

    cd ../TrajectoryOrbitPropag
    .venv/Scripts/python <orbit-tools>/backend/tests/legacy/gen_orbit_refs.py <orbit-tools>/backend/tests/data

`PropagInit` e `Summarize2DataFiles` são importados do app antigo. Trechos que no app antigo ficam
dentro das páginas Streamlit (que executam a interface ao serem importadas) foram transcritos sem
alteração, com a origem indicada: gravação dos arquivos (página 02 e 05), `rcs_min` (página 05) e o
laço da comparação de órbitas (página 04). A única mudança é `lineterminator="\\n"` nos `to_csv`,
que reproduz a saída do servidor Linux onde o app roda (no Windows o pandas usaria "\\r\\n").

O astropy usa a tabela EOP fixa dos testes, para que os dois lados usem os mesmos valores.
Só dados públicos (Celestrak) e um local fictício: as referências ficam no git.
"""

import io
import json
import sys
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
LEGACY = Path.cwd()
sys.path.insert(0, str(LEGACY / "source"))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from astropy import units as u  # noqa: E402
from astropy.time import Time, TimeDelta  # noqa: E402
from astropy.utils import iers  # noqa: E402
from lib.orbit_functions import PropagInit  # noqa: E402
from lib.pages_functions import Summarize2DataFiles  # noqa: E402

DATA = Path(sys.argv[1])
OUT = DATA / "legacy"
OUT.mkdir(exist_ok=True)

iers.conf.auto_download = False
iers.earth_orientation_table.set(iers.IERS_A.open(str(DATA / "finals2000A_2025-2026.all")))

SITE = {"name": "FICTICIO", "lat": -10.0, "lon": -40.0, "height": 0.0}
WINDOW = ("2026-11-11T00:00:00", "2026-11-12T00:00:00")
D_MAX_KM, D_MIN_KM = 1100, 1000
RADAR = {"pt": 60.0, "gt": 42.0, "gr": 42.0, "lt": 1.4, "lr": 1.6, "fhz": 5400.0, "sr": -140.0, "snr": 0.0}
RATE_S = 0.1  # taxa do .trn do radar na referência (0,01 s geraria um arquivo grande demais para o git)


def save_npz(name, **arrays):
    np.savez_compressed(OUT / name, **arrays)


# --- 1. Propagação: ISS (2025) e o primeiro objeto LEO, 1 h a cada 10 s -------------------------
props = {}
cases = {
    "iss2025": (pd.read_csv(DATA / "iss_2025-03-17.csv").to_dict("records")[0], "2025-03-17T09:00:00"),
    "leo0": (pd.read_csv(DATA / "elements_leo100.csv").to_dict("records")[0], "2026-11-11T00:00:00"),
}
for key, (elem, start) in cases.items():
    t, enu, aer, geod, itrs = PropagInit(elem, SITE, 10).orbit_propag(Time(start, scale="utc"), 360, 10)
    props[key] = {"start": start, "step": 10, "n": 360}
    save_npz(f"propagation_{key}.npz", enu=enu, aer=aer, geodetic=geod, itrs=itrs)
(OUT / "propagation.json").write_text(json.dumps(props, indent=2))

# --- 2. Busca de passagens: 100 objetos LEO, 1 dia (página 02) ---------------------------------
elem_df = pd.read_csv(DATA / "elements_leo100.csv").drop_duplicates(subset=["NORAD_CAT_ID"], keep="first")
records = elem_df.to_dict("records")
rcs = pd.read_csv(LEGACY / "data" / "RCS.csv").to_dict("list")
t0, t1 = Time(WINDOW[0], scale="utc"), Time(WINDOW[1], scale="utc")
summary = Summarize2DataFiles()
passes = []
for rec in records:
    pos = PropagInit(rec, SITE, 1.0).search2h0(t0, t1, D_MAX_KM * 1000, D_MIN_KM * 1000)
    summary.save_trajectories(pos, rec, rcs)
    for i in range(len(pos.time_array)):
        passes.append(
            (pos.satellite.satnum, pos.time_array[i], pos.enu[i], pos.az_el_r[i], pos.itrs[i], pos.geodetic[i])
        )
resume = pd.DataFrame(summary.sel_resume)
resume.insert(0, "NORAD_CAT_ID", [p[0] for p in passes])
resume.to_csv(OUT / "search_summary.csv", index=False, lineterminator="\n")

# Arrays completos das 3 primeiras passagens em ordem de H0
order = sorted(range(len(passes)), key=lambda i: passes[i][1][0].jd)
detail = {}
for k, i in enumerate(order[:3]):
    norad, tarr, enu, aer, itrs, geod = passes[i]
    detail[f"p{k}"] = {"norad": int(norad), "h0": tarr[0].isot, "n": len(tarr)}
    save_npz(f"pass_p{k}.npz", enu=enu, aer=aer, itrs=itrs, geodetic=geod)
(OUT / "search_passes.json").write_text(json.dumps({"site": SITE, "window": WINDOW, "passes": detail}, indent=2))

# --- 3. Arquivos (transcrito de pages/02_orbit_propagation.py, SummarizeDataFiles) --------------
norad, time_arr, enu_p, az_el_r, itrs_p, geod_p = passes[order[0]]
df_enu = pd.DataFrame(enu_p)
buf = io.StringIO()
df_enu.to_csv(
    buf, index=False, header=[str(len(df_enu.index) - 1), "1000", "1"], float_format="%.3f", lineterminator="\n"
)
(OUT / "p0.trn").write_text(buf.getvalue(), newline="")
buf = io.StringIO()
df_enu.to_csv(
    buf, sep=" ", index=False, header=["1", str(len(df_enu.index) - 1), "1"], float_format="%.3f", lineterminator="\n"
)
(OUT / "p0.trj").write_text(buf.getvalue(), newline="")
df_data = pd.DataFrame(time_arr.value.reshape(len(time_arr), 1), columns=["Time"])
df_data = pd.concat(
    [
        df_data,
        pd.DataFrame(
            np.concatenate((az_el_r, enu_p, itrs_p, geod_p), axis=1),
            columns=[
                "AZIMUTH",
                "ELEVATION",
                "RANGE",
                "ENU_E",
                "ENU_N",
                "ENU_U",
                "ITRS_X",
                "ITRS_Y",
                "ITRS_Z",
                "lat",
                "lon",
                "height",
            ],
        ),
    ],
    axis=1,
)
buf = io.StringIO()
df_data.to_csv(buf, index=False, lineterminator="\n")
(OUT / "p0_data.csv").write_text(buf.getvalue(), newline="")

# --- 4. .trn na taxa do radar (transcrito de pages/05_trajectory.py, save_trajectories) ---------
end_pt = len(time_arr) - 1
rec0 = next(r for r in records if r["NORAD_CAT_ID"] == norad)
pos = PropagInit(rec0, SITE, RATE_S).traj_calc(Time(time_arr[0].isot), round(end_pt / RATE_S))
buf = io.StringIO()
np.savetxt(buf, pos.enu[0], fmt="%.3f", delimiter=",", header=str(end_pt), comments="")
(OUT / "p0_rate.trn").write_text(buf.getvalue(), newline="")
(OUT / "p0_rate.json").write_text(json.dumps({"rate_s": RATE_S, "end_pt": end_pt, "n": len(pos.enu[0])}))


# --- 5. RCS mínimo (transcrito de pages/05_trajectory.py) ----------------------------------------
def rcs_min(r_min, pt=59.6, gt=42, gr=42, lt=1.5, lr=1.5, f=5700, sr=-143, snr=0):
    pt_lin = 10 ** (pt / 10)
    gt_lin = 10 ** (gt / 10)
    gr_lin = 10 ** (gr / 10)
    lt_lin = 10 ** (lt / 10)
    lr_lin = 10 ** (lr / 10)
    sr_lin = 10 ** (sr / 10)
    snr_lin = 10 ** (snr / 10)
    lamb = (3 * 10**8) / (f * 10**6)
    rcs = (((4 * np.pi) ** 3) * sr_lin * lt_lin * lr_lin * np.power(r_min, 4) * snr_lin) / (
        pt_lin * gt_lin * gr_lin * lamb**2
    )
    return rcs


r_test = np.array([200e3, 422.88e3, 500e3, 1000e3, 1500e3])
rcs_ref = rcs_min(
    r_test, RADAR["pt"], RADAR["gt"], RADAR["gr"], RADAR["lt"], RADAR["lr"], RADAR["fhz"], RADAR["sr"], RADAR["snr"]
)
(OUT / "rcs_min.json").write_text(json.dumps({"radar": RADAR, "range_m": r_test.tolist(), "rcs_min": rcs_ref.tolist()}))

# --- 6. Comparação de órbitas (transcrito de pages/04_orbit_compare.py) --------------------------
COMP_SAMPLE_TIME, COMP_NUMBER_SAMPLES, err_max = 60 * 5, 80, 3000
hist = pd.read_csv(DATA / "iss_supgp_history.csv").sort_values(["NORAD_CAT_ID", "EPOCH"], ascending=[False, False])
sel_resume = {"NORAD_CAT_ID": [], "EPOCH": [], "EPOCH_1": [], "D_ERR_MEAN": [], "D_ERR_MAX": [], "TRACK": []}
for norad_c in hist["NORAD_CAT_ID"].unique():
    orbital_elem = hist.loc[hist["NORAD_CAT_ID"] == norad_c].reset_index(drop=True)
    for idxj, prev_orbital_elem_row in orbital_elem.iterrows():
        if idxj > 0:
            start_time = Time(prev_orbital_elem_row["EPOCH"], format="isot") - TimeDelta(0.5 * u.d)
            start_time = Time(start_time, precision=0)
            prev_traj = (
                PropagInit(prev_orbital_elem_row, SITE, COMP_SAMPLE_TIME)
                .traj_calc(start_time, COMP_NUMBER_SAMPLES)
                .enu[0]
            )
            curr_traj = (
                PropagInit(orbital_elem_row, SITE, COMP_SAMPLE_TIME).traj_calc(start_time, COMP_NUMBER_SAMPLES).enu[0]
            )
            traj_error_norm = np.linalg.norm(prev_traj - curr_traj, axis=1)
            sel_resume["NORAD_CAT_ID"].append(int(orbital_elem_row["NORAD_CAT_ID"]))
            sel_resume["EPOCH"].append(orbital_elem_row["EPOCH"])
            sel_resume["EPOCH_1"].append(prev_orbital_elem_row["EPOCH"])
            sel_resume["D_ERR_MEAN"].append(float(np.mean(traj_error_norm)))
            sel_resume["D_ERR_MAX"].append(float(np.max(traj_error_norm)))
            sel_resume["TRACK"].append(1 if np.mean(traj_error_norm) < err_max else 0)
        orbital_elem_row = prev_orbital_elem_row
(OUT / "compare.json").write_text(json.dumps(sel_resume, indent=2))

print(f"referências gravadas em {OUT}: {len(passes)} passagens, {len(sel_resume['EPOCH'])} comparações")
