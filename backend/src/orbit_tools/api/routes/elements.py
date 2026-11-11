"""Elementos orbitais: Celestrak, Space-Track, arquivos, conjuntos guardados e comparação."""

import csv
import io
import json
import logging
from importlib.resources import files

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from ...core import compare, elements
from ...core.elements import ElementsError, Record
from ...settings import settings
from ...sources import SourceError
from ...sources import celestrak as celestrak_src
from ...sources.spacetrack import SpaceTrack
from .. import element_sets
from ..schemas import CelestrakRequest, ElementSet, SetRef, SpaceTrackRequest, StoreRequest, StoreResponse
from ..streaming import Report, jsonable, ndjson

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/elements", tags=["elementos"])

MAX_UPLOAD_BYTES = 30 * 1024 * 1024


def _source_error(exc: SourceError) -> HTTPException:
    return HTTPException(exc.status, str(exc))


def _normalize(raw: list[dict], where: str) -> list[Record]:
    try:
        return [elements.normalize(r, f"{where} {i}: ") for i, r in enumerate(raw, start=1)]
    except ElementsError as exc:
        raise HTTPException(422, str(exc)) from None


def _finish(
    records: list[Record], source: str, warnings: list[str], not_found: list[str] | None = None
) -> JSONResponse:
    """Completa os campos, guarda o conjunto e responde (JSONResponse: sem revalidar milhares de registros)."""
    if not records:
        raise HTTPException(404, "Nenhum conjunto de elementos encontrado.")
    if len(records) > settings.max_elements:
        raise HTTPException(413, f"{len(records)} conjuntos de elementos; o limite é {settings.max_elements}.")
    try:
        catalog = celestrak_src.satcat()
    except SourceError as exc:
        catalog = None
        warnings.append(f"Tipo de objeto e RCS indisponíveis ({exc}).")
    records = elements.enrich(records, catalog)
    records.sort(key=lambda r: (int(r["NORAD_CAT_ID"]), str(r["EPOCH"])), reverse=True)  # como o app antigo
    decayed = sorted({int(r["NORAD_CAT_ID"]) for r in records if r.get("DECAY_DATE")})
    body = ElementSet(
        set_id=element_sets.store(records),
        records=[],
        count=len(records),
        objects=len({int(r["NORAD_CAT_ID"]) for r in records}),
        source=source,
        warnings=warnings,
        not_found=not_found or [],
        decayed=decayed,
    ).model_dump(mode="json")
    body["records"] = jsonable(records)
    return JSONResponse(body)


@router.post("/celestrak", response_model=ElementSet)
def from_celestrak(req: CelestrakRequest):
    values = list(dict.fromkeys(req.values))
    if req.kind == "catnr":
        if not all(v.isdigit() for v in values):
            raise HTTPException(422, "NORAD_CAT_ID deve ser um número inteiro.")
        if len(values) > settings.max_celestrak_ids:
            raise HTTPException(
                413, f"No Celestrak, até {settings.max_celestrak_ids} objetos por vez; para mais, use o Space-Track."
            )
    elif len(values) > 1:
        raise HTTPException(422, "Grupo, nome e designador: um valor por consulta.")
    try:
        result = celestrak_src.fetch_gp(req.kind, values)
    except SourceError as exc:
        raise _source_error(exc) from None
    label = {"catnr": "NORAD", "group": "grupo", "name": "nome", "intdes": "designador"}[req.kind]
    source = f"Celestrak ({label} {', '.join(values[:5])}{'…' if len(values) > 5 else ''})"
    return _finish(_normalize(result.records, "Celestrak, item"), source, [], result.not_found)


def _app_norad_list() -> list[int]:
    text = files("orbit_tools.data").joinpath("norad_ids_leo.csv").read_text(encoding="utf-8-sig")
    return [int(r["NORAD_CAT_ID"]) for r in csv.DictReader(io.StringIO(text))]


@router.post("/spacetrack", response_model=ElementSet)
def from_spacetrack(req: SpaceTrackRequest):
    ids = list(dict.fromkeys(req.norad_ids + (_app_norad_list() if req.use_app_list else [])))
    if req.mode in ("latest", "history"):
        if not ids:
            raise HTTPException(422, "Informe os NORAD_CAT_ID (ou use a lista do app).")
        if len(ids) > settings.max_spacetrack_ids:
            raise HTTPException(413, f"Até {settings.max_spacetrack_ids} objetos por consulta ({len(ids)} pedidos).")
    if req.mode == "history":
        if not req.epoch_start or not req.epoch_end:
            raise HTTPException(422, "Informe o intervalo de época do histórico.")
        days = (req.epoch_end - req.epoch_start).days
        if days <= 0 or days > settings.max_history_days:
            raise HTTPException(422, f"O intervalo de época deve ter de 1 a {settings.max_history_days:g} dias.")
    try:
        with SpaceTrack(req.username, req.password.get_secret_value()) as st:
            if req.mode == "latest":
                raw = st.latest(ids)
            elif req.mode == "leo":
                raw = st.leo_filter()
            else:
                raw = st.history(ids, req.epoch_start, req.epoch_end)
    except SourceError as exc:
        raise _source_error(exc) from None
    records = _normalize(raw, "Space-Track, item")
    found = {int(r["NORAD_CAT_ID"]) for r in records}
    not_found = [str(i) for i in ids if i not in found] if req.mode != "leo" else []
    label = {"latest": "últimos elementos", "leo": "filtro LEO", "history": "histórico"}[req.mode]
    return _finish(records, f"Space-Track ({label})", [], not_found)


@router.post("/parse", response_model=ElementSet)
async def from_file(file: UploadFile):
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(413, f"Arquivo maior que {MAX_UPLOAD_BYTES // 1024 // 1024} MB.")
    try:
        records = elements.parse(content, file.filename or "")
    except (ElementsError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise HTTPException(422, f"Arquivo de elementos inválido: {exc}") from None
    return _finish(records, f"Arquivo {file.filename}", [])


@router.post("/store", response_model=StoreResponse)
def store(req: StoreRequest) -> StoreResponse:
    """Reenvio de um conjunto que o servidor descartou (o navegador guarda o original)."""
    if len(req.records) > settings.max_elements:
        raise HTTPException(413, f"{len(req.records)} conjuntos de elementos; o limite é {settings.max_elements}.")
    records = _normalize(req.records, "item")
    return StoreResponse(set_id=element_sets.store(records), count=len(records))


def load_set(set_id: str) -> list[Record]:
    records = element_sets.load(set_id)
    if records is None:
        raise HTTPException(404, "Conjunto de elementos não encontrado no servidor; reenvie.")
    return records


@router.post("/compare")
def compare_sets(req: SetRef):
    """Fluxo NDJSON: progresso e, no fim, as linhas da comparação entre conjuntos sucessivos."""
    records = load_set(req.set_id)

    def work(report: Report):
        report(0.0, "comparando conjuntos sucessivos")
        rows = compare.compare_successive(records, progress=lambda f: report(f, "comparando conjuntos sucessivos"))
        return {"rows": rows}

    return ndjson(work)
