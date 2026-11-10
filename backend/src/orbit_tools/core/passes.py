"""
Busca de passagens de objetos sobre um local (sensor).

Mesmo critério do app antigo (`PropagInit.search2h0`), vetorizado para muitos objetos:

1. Propagação grossa (30 s) de todos os objetos, em blocos de objetos × instantes.
2. Trechos com distância < d_max (e, opcionalmente, elevação ≥ mínima).
3. Cada trecho é refeito na taxa de H0 (1 s), a partir de uma amostra grossa antes da entrada até
   a primeira amostra grossa fora; a passagem são as amostras finas dentro da região.
4. A passagem é aceita se a distância mínima < d_min.

H0 fica na grade de `step_s` a partir do início da busca, arredondado para o segundo inteiro: com
passo de 1 s, H0 é sempre um segundo exato (o nome dos arquivos de rastreio só tem segundos).

Diferenças em relação ao app antigo (docs/planejamento.md, seção 5): amostras com erro do SGP4 são
descartadas e a passagem é marcada; passagens cortadas pelo início ou pelo fim da janela podem ser
incluídas (marcadas como parciais); se a região for deixada e retomada no mesmo trecho fino, só o
primeiro trecho contínuo vira passagem.

A busca devolve só o resumo de cada passagem; a trajetória é recalculada sob demanda por
`pass_ephemeris` (servidor sem estado).
"""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field

import numpy as np
from sgp4.api import SatrecArray

from .elements import Record, age_days, periapsis_km, satrec
from .eop import EOP
from .frames import teme_to_itrs
from .geodesy import WGS84, Ellipsoid, GeodeticPoint, LocalFrame
from .kinematics import derivatives
from .propagation import Ephemeris, ephemeris, observe, propagate_teme
from .radar import Detection, Radar, detection, margin_db
from .time import NS_PER_S, ceil_to_second, parse_utc, seconds_between, time_grid


@dataclass(frozen=True)
class SearchParams:
    start: np.datetime64  # UTC
    end: np.datetime64  # UTC
    d_max_m: float  # distância máxima: limites da trajetória
    d_min_m: float  # distância que a passagem precisa atingir para ser aceita
    step_s: float = 1.0  # taxa de H0 e das amostras usadas no resumo
    coarse_s: float = 30.0
    min_el_deg: float | None = None  # elevação mínima (desligada: só distância, como o app antigo)
    include_partial: bool = False  # passagens cortadas pelo início ou fim da janela


@dataclass
class PassInfo:
    record_index: int  # posição do objeto na lista de elementos buscada
    norad: int
    h0: np.datetime64
    n_points: int
    step_s: float
    h0_range_m: float
    min_range_m: float
    min_range_index: int
    end_range_m: float
    max_el_deg: float
    max_el_index: int
    az_h0_deg: float
    az_end_deg: float
    max_az_rate_deg_s: float
    max_el_rate_deg_s: float
    epoch_age_days: float
    partial: bool = False
    sgp4_error: bool = False
    rcs_m2: float | None = None
    rcs_source: str = "desconhecido"
    detection: Detection | None = None
    warnings: list[str] = field(default_factory=list)

    @property
    def end_index(self) -> int:
        return self.n_points - 1

    @property
    def hf(self) -> np.datetime64:
        return self.h0 + np.timedelta64(round(self.end_index * self.step_s * NS_PER_S), "ns")

    @property
    def duration_s(self) -> float:
        return self.end_index * self.step_s


def prefilter(records: Sequence[Mapping[str, object]], d_max_m: float) -> tuple[list[int], list[int]]:
    """Índices dos objetos que podem passar (perigeu < d_max) e dos excluídos."""
    keep, drop = [], []
    for i, r in enumerate(records):
        (keep if periapsis_km(r) * 1000.0 < d_max_m else drop).append(i)
    return keep, drop


def search(
    records: Sequence[Record],
    site: GeodeticPoint,
    params: SearchParams,
    eop: EOP,
    *,
    ell: Ellipsoid = WGS84,
    radar: Radar | None = None,
    rcs: Callable[[Record], tuple[float | None, str]] | None = None,
    progress: Callable[[float], None] | None = None,
    group_size: int = 500,
    time_chunk: int = 4000,
) -> list[PassInfo]:
    """
    Passagens de todos os objetos de `records` sobre `site`, ordenadas por H0.

    Args:
        radar, rcs: com ambos, calcula a margem de detecção ao longo de cada passagem;
            `rcs(record)` devolve (RCS em m² ou None, origem).
        progress: chamada com a fração concluída (0 a 1) após cada bloco de objetos.
    """
    if params.d_max_m <= params.d_min_m:
        raise ValueError("A distância máxima deve ser maior que a mínima.")
    frame = LocalFrame(site, ell)
    origin = frame.origin_ecef
    up = frame.rotation[2]
    t0 = ceil_to_second(parse_utc(params.start))
    span = seconds_between(t0, parse_utc(params.end))
    if span <= params.coarse_s:
        raise ValueError("A janela de busca deve ser maior que o passo da busca grossa.")
    times = time_grid(t0, params.coarse_s, 1 + int(span // params.coarse_s))
    sin_min_el = np.sin(np.radians(params.min_el_deg)) if params.min_el_deg is not None else None

    found: list[PassInfo] = []
    for g in range(0, len(records), group_size):
        group = records[g : g + group_size]
        sats = [satrec(r) for r in group]
        inside = np.zeros((len(group), times.size), dtype=bool)
        for k in range(0, times.size, time_chunk):
            tt = times[k : k + time_chunk]
            e, r, _ = propagate_teme(SatrecArray(sats), tt)
            itrs, _ = teme_to_itrs(r, tt, eop)
            rel = itrs - origin
            d = np.linalg.norm(rel, axis=-1)
            ok = (e == 0) & (d < params.d_max_m)
            if sin_min_el is not None:
                ok &= rel @ up >= d * sin_min_el
            inside[:, k : k + tt.size] = ok

        for i in np.flatnonzero(inside.any(axis=1)):
            for a, b in _runs(inside[i], params.include_partial):
                info = _refine(g + i, group[i], sats[i], times, a, b, frame, params, eop, radar, rcs)
                if info is not None:
                    found.append(info)
        if progress:
            progress(min(1.0, (g + len(group)) / len(records)))

    found.sort(key=lambda p: (p.h0, p.norad))
    return found


def _runs(inside: np.ndarray, include_partial: bool) -> list[tuple[int, int]]:
    """Trechos [a, b): a = primeira amostra dentro, b = primeira fora (ou o tamanho, se não sai)."""
    edges = np.diff(inside.astype(np.int8))
    starts = list(np.flatnonzero(edges == 1) + 1)
    ends = list(np.flatnonzero(edges == -1) + 1)
    if inside[0]:
        starts.insert(0, 0)
    if inside[-1]:
        ends.append(inside.size)
    runs = list(zip(starts, ends, strict=True))
    if not include_partial:
        runs = [(a, b) for a, b in runs if a > 0 and b < inside.size]
    return runs


def _refine(index, record, sat, times, a, b, frame, params, eop, radar, rcs) -> PassInfo | None:
    coarse = np.timedelta64(round(params.coarse_s * NS_PER_S), "ns")
    starts_cut = a == 0
    ends_cut = b == times.size
    t_in = times[0] if starts_cut else times[a] - coarse
    t_out = times[-1] if ends_cut else times[b]
    n = 1 + int(np.floor(seconds_between(t_in, t_out) / params.step_s + 1e-9))
    t = time_grid(t_in, params.step_s, n)
    obs = observe(sat, t, eop, frame)

    ok = (obs.error == 0) & (obs.range < params.d_max_m)
    if params.min_el_deg is not None:
        ok &= obs.el >= params.min_el_deg
    idx = np.flatnonzero(ok)
    if idx.size == 0:
        return None
    first = idx[0]
    gaps = np.flatnonzero(np.diff(idx) > 1)
    last = idx[gaps[0]] if gaps.size else idx[-1]
    sl = slice(first, last + 1)
    rng, az, el = obs.range[sl], obs.az[sl], obs.el[sl]
    i_min = int(np.argmin(rng))
    if rng[i_min] >= params.d_min_m:
        return None

    h0 = t[first]
    az_rate, el_rate = _rates(az, el, params.step_s)
    i_el = int(np.argmax(el))
    info = PassInfo(
        record_index=index,
        norad=int(record["NORAD_CAT_ID"]),
        h0=h0,
        n_points=int(rng.size),
        step_s=params.step_s,
        h0_range_m=float(rng[0]),
        min_range_m=float(rng[i_min]),
        min_range_index=i_min,
        end_range_m=float(rng[-1]),
        max_el_deg=float(el[i_el]),
        max_el_index=i_el,
        az_h0_deg=float(az[0]),
        az_end_deg=float(az[-1]),
        max_az_rate_deg_s=az_rate,
        max_el_rate_deg_s=el_rate,
        epoch_age_days=age_days(record, h0.astype("datetime64[us]").item()),
        partial=bool((starts_cut and first == 0) or (ends_cut and last == n - 1)),
        sgp4_error=bool(np.any(obs.error != 0)),
    )
    if info.sgp4_error:
        info.warnings.append("amostras com erro do SGP4 descartadas (objeto pode ter reentrado)")
    if rcs is not None:
        info.rcs_m2, info.rcs_source = rcs(record)
        if radar is not None and info.rcs_m2 is not None:
            info.detection = detection(margin_db(info.rcs_m2, rng, radar), params.step_s)
    return info


def _rates(az_deg: np.ndarray, el_deg: np.ndarray, step_s: float) -> tuple[float, float]:
    """Maiores taxas absolutas de azimute e elevação (graus/s)."""
    if az_deg.size < 3:
        return float("nan"), float("nan")
    v_az, _ = derivatives(np.unwrap(az_deg, period=360.0), step_s)
    v_el, _ = derivatives(el_deg, step_s)
    return float(np.max(np.abs(v_az))), float(np.max(np.abs(v_el)))


def pass_ephemeris(
    record: Record,
    site: GeodeticPoint,
    h0,
    duration_s: float,
    step_s: float,
    eop: EOP,
    ell: Ellipsoid = WGS84,
) -> Ephemeris:
    """Trajetória de uma passagem de H0 a H0 + duração (inclusive), em qualquer taxa."""
    n = 1 + int(np.floor(duration_s / step_s + 1e-9))
    return ephemeris(record, time_grid(h0, step_s, n), eop, site, ell)
