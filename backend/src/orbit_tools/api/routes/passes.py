"""Passagens: busca sobre um sensor, trajetória de uma passagem e exportação dos arquivos de rastreio."""

import secrets
import tempfile
import time
import zipfile
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from ...core import elements, formats, passes
from ...core.elements import Record
from ...core.kinematics import derivatives
from ...core.radar import RCS_BY_SIZE, Radar, object_rcs, rcs_table
from ...core.time import seconds_between
from ...settings import settings
from ...sources import eop as eop_source
from ..common import find_record, point, utc
from ..schemas import ExportRequest, SearchRequest, TrajectoryRequest, TrajectoryResponse
from ..series import series
from ..streaming import Report, ndjson
from .elements import load_set

router = APIRouter(prefix="/api/passes", tags=["passagens"])


@router.post("/search")
def search(req: SearchRequest):
    """Fluxo NDJSON: progresso e, no fim, o resumo das passagens (colunas do app antigo e novas)."""
    records = load_set(req.set_id)
    start, end = utc(req.start), utc(req.end)
    days = seconds_between(start, end) / 86400
    if days <= 0:
        raise HTTPException(422, "O fim da janela deve ser depois do início.")
    if days > settings.max_search_days:
        raise HTTPException(422, f"Janela de busca de até {settings.max_search_days:g} dias.")
    latest = elements.latest_per_object(records)
    keep, drop = passes.prefilter(latest, req.d_max_km * 1000)
    chosen = [latest[i] for i in keep]
    cost = len(chosen) * days
    if cost > settings.max_object_days:
        raise HTTPException(
            413,
            f"Busca grande demais: {len(chosen)} objetos × {days:.1f} dias. Neste servidor, o limite é "
            f"{settings.max_object_days:,.0f} objeto·dia; reduza a janela ou o número de objetos.".replace(",", " "),
        )
    radar = Radar(**req.radar.model_dump()) if req.radar else None
    table = rcs_table()
    by_size = req.rcs_by_size or RCS_BY_SIZE
    params = passes.SearchParams(
        start,
        end,
        req.d_max_km * 1000,
        req.d_min_km * 1000,
        min_el_deg=req.min_el_deg,
        include_partial=req.include_partial,
    )
    eop = eop_source.current()

    def work(report: Report):
        report(0.0, f"propagando {len(chosen)} objetos")
        found = passes.search(
            chosen,
            point(req.site),
            params,
            eop,
            radar=radar,
            rcs=lambda r: object_rcs(r, table, by_size),
            progress=lambda f: report(f, f"propagando {len(chosen)} objetos"),
        )
        warnings = []
        covered = eop.covers(np.array([params.start, params.end]))
        if not covered.all():
            warnings.append(
                "O arquivo de orientação da Terra (EOP) não cobre toda a janela: diferença de dezenas de metros, "
                "bem menor que o erro dos elementos."
            )
        return {
            "passes": formats.summary_rows(found, chosen, radar),
            "objects": len(chosen),
            "excluded_perigee": [int(latest[i]["NORAD_CAT_ID"]) for i in drop],
            "eop": eop.source,
            "warnings": warnings,
        }

    return ndjson(work)


@router.post("/trajectory", response_model=TrajectoryResponse)
def trajectory(req: TrajectoryRequest) -> TrajectoryResponse:
    n = req.passage.end_pt / req.step_s
    if n > settings.max_trajectory_points:
        raise HTTPException(413, f"Trajetória com {n:.0f} pontos; o limite é {settings.max_trajectory_points}.")
    record = find_record(load_set(req.set_id), req.passage.norad, req.passage.epoch)
    eph = passes.pass_ephemeris(
        record, point(req.site), utc(req.passage.h0), req.passage.end_pt, req.step_s, eop_source.current()
    )
    az_rate, _ = derivatives(np.unwrap(eph.az, period=360.0), req.step_s)
    el_rate, _ = derivatives(eph.el, req.step_s)
    return TrajectoryResponse(
        t=series(np.arange(len(eph.time)) * req.step_s),
        az=series(eph.az),
        el=series(eph.el),
        range=series(eph.range),
        lat=series(eph.lat),
        lon=series(eph.lon),
        height=series(eph.height),
        az_rate=series(az_rate),
        el_rate=series(el_rate),
    )


# --- Exportação ----------------------------------------------------------------------------------


def _rate_label(rate_s: float) -> str:
    hz = 1.0 / rate_s
    return f"{hz:g}Hz"


def _safe(name: str) -> str:
    return "".join(c if c.isalnum() or c in "-_" else "_" for c in name) or "local"


@router.post("/export")
def export(req: ExportRequest):
    """
    Fluxo NDJSON: progresso e, no fim, o endereço do ZIP (válido por `export_hours`), com os arquivos
    no formato e com os nomes do app antigo.
    """
    records = load_set(req.set_id)
    chosen = [(ref, find_record(records, ref.norad, ref.epoch)) for ref in req.passes]
    points = sum(ref.end_pt for ref in req.passes) * (
        (3 if req.formats.trn or req.formats.trj or req.formats.data_csv else 0)
        + (1 / req.rate_s if req.formats.trn_rate else 0)
    )
    if points > settings.max_export_points:
        raise HTTPException(
            413,
            f"Exportação com ~{points / 1e6:.1f} milhões de pontos; o limite é "
            f"{settings.max_export_points / 1e6:.0f} milhões. Escolha menos passagens ou uma taxa menor.",
        )
    site = point(req.site)
    site_name = _safe(req.site.name)
    eop = eop_source.current()
    rate = _rate_label(req.rate_s)
    stamp = datetime.now(UTC).strftime("%Y_%m_%d_%H_%M_%S")

    def work(report: Report):
        token = secrets.token_hex(16)
        root = settings.data_dir / "exports"
        root.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(dir=root, suffix=".tmp", delete=False) as tmp:
            tmp_path = Path(tmp.name)
        try:
            with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5) as zf:
                for k, (ref, record) in enumerate(chosen):
                    report(k / len(chosen), f"passagem {k + 1} de {len(chosen)} (NORAD {ref.norad})")
                    h0 = utc(ref.h0)
                    norad = int(record["NORAD_CAT_ID"])
                    if req.formats.trn or req.formats.trj or req.formats.data_csv:
                        eph = passes.pass_ephemeris(record, site, h0, ref.end_pt, 1.0, eop)
                        if req.formats.trn:
                            zf.writestr(f"trn1Hz/{formats.file_name('obj-', norad, h0, 'trn')}", formats.trn(eph.enu))
                        if req.formats.trj:
                            zf.writestr(f"trj1Hz/{formats.file_name('pobj-', norad, h0, 'trj')}", formats.trj(eph.enu))
                        if req.formats.data_csv:
                            zf.writestr(f"csv1Hz/{formats.file_name('data-', norad, h0, 'csv')}", formats.data_csv(eph))
                    if req.formats.trn_rate:
                        eph = passes.pass_ephemeris(record, site, h0, ref.end_pt, req.rate_s, eop)
                        name = formats.file_name(f"{rate}_obj-", norad, h0, "trn")
                        zf.writestr(f"trn{rate}/{name}", formats.trn_rate(eph.enu, round(ref.end_pt)))
                elements_rows = [r for _, r in chosen]
                zf.writestr(f"{stamp}_orbital_elem.csv", formats.to_csv(_unique(elements_rows)))
                if req.summary:
                    zf.writestr(f"{site_name}_{stamp}_traj_summary.csv", formats.to_csv(req.summary))
            tmp_path.replace(root / f"{token}.zip")  # a validade conta da data do arquivo
        except BaseException:
            tmp_path.unlink(missing_ok=True)
            raise
        report(1.0, "pronto")
        return {
            "url": f"/api/passes/export/{token}",
            "file_name": f"trajetorias_{site_name}_{stamp}.zip",
            "files": len(chosen),
        }

    return ndjson(work)


def _unique(rows: list[Record]) -> list[Record]:
    seen, out = set(), []
    for r in rows:
        key = (r["NORAD_CAT_ID"], r["EPOCH"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def _expired(path: Path) -> bool:
    return time.time() - path.stat().st_mtime > settings.export_hours * 3600


@router.get("/export/{token}")
def download(token: str, name: str = "trajetorias.zip"):
    if len(token) != 32 or any(c not in "0123456789abcdef" for c in token):
        raise HTTPException(404, "Arquivo não encontrado.")
    path = settings.data_dir / "exports" / f"{token}.zip"
    if not path.exists() or _expired(path):
        raise HTTPException(404, "Arquivo expirado ou não encontrado; gere de novo.")
    return FileResponse(path, media_type="application/zip", filename=_safe(name.removesuffix(".zip")) + ".zip")


def purge_exports() -> int:
    """Apaga os ZIPs vencidos e restos de gerações interrompidas (chamado pela manutenção)."""
    root = settings.data_dir / "exports"
    removed = 0
    for path in [*root.glob("*.zip"), *root.glob("*.tmp")] if root.exists() else []:
        try:
            if _expired(path):
                path.unlink()
                removed += 1
        except FileNotFoundError:
            pass
    return removed
