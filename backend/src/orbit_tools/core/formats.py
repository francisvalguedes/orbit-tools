"""
Arquivos de saída no formato do app antigo.

Os sistemas de rastreio que consomem estes arquivos leem o `.trn` (ENU em m, sem tempo) e tiram o H0 do nome
do arquivo, então cabeçalhos, casas decimais e nomes são mantidos exatamente:

    obj-<NORAD>-<AAAA_MM_DD>-H0-<HH_MM_SS>TU.trn       ENU a 1 Hz, cabeçalho "<n-1>,1000,1"
    pobj-<NORAD>-<AAAA_MM_DD>-H0-<HH_MM_SS>TU.trj      ENU a 1 Hz, separado por espaço, "1 <n-1> 1"
    data-<NORAD>-<AAAA_MM_DD>-H0-<HH_MM_SS>TU.csv      tempo, AZ/EL/D, ENU, ITRS e geodésicas a 1 Hz
    100Hz_obj-<NORAD>-<AAAA_MM_DD>-H0-<HH_MM_SS>TU.trn ENU na taxa do radar, cabeçalho "<END_PT>"

Linhas terminadas em "\\n" (o app antigo rodava em Linux).
"""

from __future__ import annotations

import csv
import io
from collections.abc import Iterable, Mapping, Sequence

import numpy as np

from .elements import Record
from .passes import PassInfo
from .propagation import Ephemeris
from .radar import Radar, rcs_min
from .time import UTC, clock, isot

DATA_COLUMNS = [
    "Time",
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
]


def file_name(prefix: str, norad: int, h0, ext: str) -> str:
    """Nome no padrão antigo, ex.: `obj-25544-2026_11_11-H0-00_00_54TU.trn` (H0 em segundos inteiros)."""
    s = str(np.datetime64(h0, "s").astype(UTC).astype("datetime64[s]"))  # AAAA-MM-DDTHH:MM:SS
    date, hms = s.split("T")
    return f"{prefix}{norad}-{date.replace('-', '_')}-H0-{hms.replace(':', '_')}TU.{ext}"


def _enu_rows(enu: np.ndarray, sep: str) -> str:
    return "".join(f"{e:.3f}{sep}{n:.3f}{sep}{u:.3f}\n" for e, n, u in np.asarray(enu, dtype=float))


def trn(enu: np.ndarray) -> str:
    """`.trn` a 1 Hz: cabeçalho `<n-1>,1000,1`."""
    return f"{len(enu) - 1},1000,1\n" + _enu_rows(enu, ",")


def trj(enu: np.ndarray) -> str:
    """`.trj` a 1 Hz: separado por espaço, cabeçalho `1 <n-1> 1`."""
    return f"1 {len(enu) - 1} 1\n" + _enu_rows(enu, " ")


def trn_rate(enu: np.ndarray, end_pt: int) -> str:
    """`.trn` na taxa do radar: cabeçalho com o END_PT da passagem a 1 Hz (duração em s)."""
    return f"{end_pt}\n" + _enu_rows(enu, ",")


def _num(x) -> str:
    x = float(x)
    return "" if np.isnan(x) else repr(x)  # como o pandas.to_csv: menor texto que reproduz o float


def data_csv(eph: Ephemeris) -> str:
    """CSV completo da passagem (colunas do app antigo)."""
    if eph.enu is None:
        raise ValueError("Efemérides sem local: o CSV de dados precisa de ENU e AZ/EL/D.")
    cols = np.column_stack([eph.az, eph.el, eph.range, eph.enu, eph.itrs, eph.lat, eph.lon, eph.height])
    out = [",".join(DATA_COLUMNS) + "\n"]
    for t, row in zip(isot(eph.time), cols, strict=True):
        out.append(t + "," + ",".join(_num(x) for x in row) + "\n")
    return "".join(out)


# ---------------------------------------------------------------------------------------------
# Resumo das passagens


def summary_rows(
    passes: Sequence[PassInfo], records: Sequence[Record], radar: Radar | None = None
) -> list[dict[str, object]]:
    """
    Uma linha por passagem: colunas do resumo antigo (`traj_summary.csv`), colunas novas e os
    elementos do objeto. Distâncias em km, como no app antigo.
    """
    rows = []
    for p in passes:
        rec = records[p.record_index]
        t_min = p.h0 + np.timedelta64(round(p.min_range_index * p.step_s * 1e9), "ns")
        t_el = p.h0 + np.timedelta64(round(p.max_el_index * p.step_s * 1e9), "ns")
        row: dict[str, object] = {
            "NORAD_CAT_ID": rec["NORAD_CAT_ID"],
            "OBJECT_NAME": rec.get("OBJECT_NAME"),
            "RCS_SIZE": rec.get("RCS_SIZE"),
            "RCS": p.rcs_m2 if p.rcs_source in ("tabela", "catalogo") else 0.0,  # 0 = sem RCS, como antes
        }
        if radar is not None:
            row["RCS_MIN"] = float(rcs_min(p.min_range_m, radar))
        row |= {
            "H0": str(isot(p.h0)),
            "H0_H": str(clock(p.h0)),
            "H0_RANGE": p.h0_range_m / 1000.0,
            "MIN_RANGE_H": str(clock(t_min)),
            "MIN_RANGE_PT": p.min_range_index,
            "MIN_RANGE": p.min_range_m / 1000.0,
            "END_H": str(clock(p.hf)),
            "END_PT": p.end_index,
            "END_RANGE": p.end_range_m / 1000.0,
            "DURATION": p.duration_s,
            "MAX_EL": p.max_el_deg,
            "MAX_EL_H": str(clock(t_el)),
            "AZ_H0": p.az_h0_deg,
            "AZ_END": p.az_end_deg,
            "MAX_AZ_RATE": p.max_az_rate_deg_s,
            "MAX_EL_RATE": p.max_el_rate_deg_s,
            "EPOCH_AGE": p.epoch_age_days,
            "PARTIAL": int(p.partial),
            "SGP4_ERROR": int(p.sgp4_error),
            "RCS_USED": p.rcs_m2,
            "RCS_SOURCE": p.rcs_source,
        }
        if p.detection is not None:
            d = p.detection
            row |= {
                "MAX_MARGIN_DB": d.max_margin_db,
                "DETECTABLE_S": d.detectable_s,
                "DET_START_PT": d.first_index,
                "DET_END_PT": d.last_index,
            }
        for key in ("EPOCH", "CREATION_DATE", "DECAY_DATE"):
            if key in rec:
                row[key] = rec[key]
        for key, value in rec.items():
            row.setdefault(key, value)
        rows.append(row)
    return rows


def to_csv(rows: Iterable[Mapping[str, object]], columns: Sequence[str] | None = None) -> str:
    """CSV de dicionários; colunas na ordem de aparição (ou as informadas)."""
    rows = list(rows)
    if columns is None:
        columns = list(dict.fromkeys(k for r in rows for k in r))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    w.writeheader()
    for r in rows:
        w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in columns})
    return buf.getvalue()
