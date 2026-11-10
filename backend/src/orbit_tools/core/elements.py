"""
Elementos orbitais médios do SGP4 no formato OMM (CCSDS Orbit Mean-Elements Message).

Internamente cada conjunto é um dicionário com as chaves OMM (como o Celestrak e o Space-Track
entregam), com números já convertidos. Lê OMM em CSV, JSON e XML e TLE de 2 ou 3 linhas.
Campos extras (RCS_SIZE, DECAY_DATE, PERIAPSIS…) são preservados.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
from collections.abc import Iterable, Mapping
from datetime import datetime, timedelta

from sgp4 import omm
from sgp4.api import WGS72, Satrec
from sgp4.conveniences import sat_epoch_datetime

Record = dict[str, object]

REQUIRED = (
    "NORAD_CAT_ID",
    "EPOCH",
    "MEAN_MOTION",
    "ECCENTRICITY",
    "INCLINATION",
    "RA_OF_ASC_NODE",
    "ARG_OF_PERICENTER",
    "MEAN_ANOMALY",
    "BSTAR",
    "MEAN_MOTION_DOT",
    "MEAN_MOTION_DDOT",
)
# Campos que o sgp4.omm.initialize exige mas arquivos de usuários às vezes não trazem
DEFAULTS: dict[str, object] = {
    "OBJECT_NAME": "",
    "OBJECT_ID": "",
    "CLASSIFICATION_TYPE": "U",
    "EPHEMERIS_TYPE": 0,
    "ELEMENT_SET_NO": 999,
    "REV_AT_EPOCH": 0,
}
INT_FIELDS = {"NORAD_CAT_ID", "EPHEMERIS_TYPE", "ELEMENT_SET_NO", "REV_AT_EPOCH"}
# Nunca convertidos para número, mesmo que pareçam
TEXT_FIELDS = {
    "OBJECT_NAME",
    "OBJECT_ID",
    "CLASSIFICATION_TYPE",
    "EPOCH",
    "CREATION_DATE",
    "DECAY_DATE",
    "LAUNCH_DATE",
    "RCS_SIZE",
    "OBJECT_TYPE",
    "COUNTRY_CODE",
    "SITE",
    "ORIGINATOR",
    "CENTER_NAME",
    "REF_FRAME",
    "TIME_SYSTEM",
    "MEAN_ELEMENT_THEORY",
    "COMMENT",
    "TLE_LINE0",
    "TLE_LINE1",
    "TLE_LINE2",
    "DATA_SOURCE",
}

# Constantes WGS72 do SGP4 (as mesmas que o Space-Track usa para PERIAPSIS/APOAPSIS)
MU_KM3_S2 = 398600.8
EARTH_RADIUS_KM = 6378.135
_EPOCH_FORMAT = "%Y-%m-%dT%H:%M:%S.%f"
_NUMBER = re.compile(r"^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$")


class ElementsError(ValueError):
    """Elementos ausentes ou inválidos; a mensagem é mostrada ao usuário."""


def normalize(raw: Mapping[str, object], where: str = "") -> Record:
    """Chaves em maiúsculas, números convertidos, campos padrão e EPOCH no formato do sgp4."""
    rec: Record = {}
    for key, value in raw.items():
        if key is None:
            continue
        k = str(key).strip().upper()
        rec[k] = _convert(k, value)
    missing = [k for k in REQUIRED if rec.get(k) in (None, "")]
    if missing:
        raise ElementsError(f"{where}campos obrigatórios ausentes: {', '.join(missing)}")
    for k, v in DEFAULTS.items():
        if rec.get(k) in (None, ""):
            rec[k] = v
    for k in REQUIRED:
        if k != "EPOCH" and not isinstance(rec[k], int | float):
            raise ElementsError(f"{where}{k} não é número: {rec[k]!r}")
    rec["EPOCH"] = _normalize_epoch(str(rec["EPOCH"]), where)
    if not 0 <= float(rec["ECCENTRICITY"]) < 1:
        raise ElementsError(f"{where}ECCENTRICITY fora de [0, 1): {rec['ECCENTRICITY']}")
    if float(rec["MEAN_MOTION"]) <= 0:
        raise ElementsError(f"{where}MEAN_MOTION deve ser positivo: {rec['MEAN_MOTION']}")
    return rec


def _convert(key: str, value: object) -> object:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value == "":
            return None
        if key in TEXT_FIELDS or not _NUMBER.match(value):
            return value
        number = float(value)
    elif isinstance(value, bool) or not isinstance(value, int | float):
        return value
    else:
        if key in TEXT_FIELDS:
            return str(value)
        number = float(value)
    if key in INT_FIELDS and number.is_integer():
        return int(number)
    return number


def _normalize_epoch(text: str, where: str) -> str:
    s = text.strip().replace(" ", "T").removesuffix("Z")
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        raise ElementsError(f"{where}EPOCH inválida: {text!r}") from None
    if dt.tzinfo is not None:
        dt = dt.replace(tzinfo=None) - dt.utcoffset()
    return dt.strftime(_EPOCH_FORMAT)


# ---------------------------------------------------------------------------------------------
# Leitura


def parse_csv(text: str) -> list[Record]:
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    return [normalize(row, f"linha {i}: ") for i, row in enumerate(reader, start=2)]


def parse_json(text: str) -> list[Record]:
    data = json.loads(text)
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list) or not all(isinstance(d, dict) for d in data):
        raise ElementsError("JSON de elementos deve ser um objeto OMM ou uma lista deles.")
    return [normalize(d, f"item {i}: ") for i, d in enumerate(data, start=1)]


def parse_xml(text: str) -> list[Record]:
    try:
        rows = list(omm.parse_xml(io.StringIO(text)))
    except Exception as exc:  # ParseError e estrutura inesperada
        raise ElementsError(f"XML OMM inválido: {exc}") from None
    return [normalize(r, f"segmento {i}: ") for i, r in enumerate(rows, start=1)]


def parse_tle(text: str) -> list[Record]:
    """TLE de 2 linhas ou 3 linhas (nome antes; o prefixo `0 ` do formato 3LE é removido)."""
    lines = [ln.rstrip() for ln in text.lstrip("﻿").splitlines() if ln.strip()]
    out: list[Record] = []
    i = 0
    while i < len(lines):
        name = ""
        if not lines[i].startswith("1 "):
            name = lines[i].removeprefix("0 ").strip()
            i += 1
        if i + 1 >= len(lines) or not (lines[i].startswith("1 ") and lines[i + 1].startswith("2 ")):
            raise ElementsError(f"TLE incompleto perto da linha {i + 1}.")
        try:
            sat = Satrec.twoline2rv(lines[i], lines[i + 1], WGS72)
        except ValueError as exc:
            raise ElementsError(f"TLE inválido perto da linha {i + 1}: {exc}") from None
        out.append(normalize(_record_from_satrec(sat, name), f"TLE {len(out) + 1}: "))
        i += 2
    return out


def parse(content: bytes | str, filename: str = "") -> list[Record]:
    """Detecta o formato pela extensão e, sem ela, pelo conteúdo."""
    text = content.decode("utf-8-sig") if isinstance(content, bytes) else content
    name = filename.lower()
    stripped = text.lstrip("﻿ \t\r\n")
    if name.endswith(".json") or stripped.startswith(("[", "{")):
        records = parse_json(text)
    elif name.endswith(".xml") or stripped.startswith("<"):
        records = parse_xml(text)
    elif name.endswith((".tle", ".3le", ".txt")) or re.search(r"^[12] [ \d]{4}\d", stripped, re.M):
        records = parse_tle(text)
    else:
        records = parse_csv(text)
    if not records:
        raise ElementsError("Nenhum conjunto de elementos encontrado no arquivo.")
    return records


def _record_from_satrec(sat: Satrec, name: str) -> Record:
    """Satrec (de TLE) → OMM, como o sgp4.exporter.export_omm, tolerando designador vazio."""
    rev_per_day = 1440.0 / (2.0 * math.pi)
    intl = sat.intldesg.strip()
    object_id = ""
    if len(intl) >= 5 and intl[:2].isdigit():
        year = int(intl[:2])
        object_id = f"{year + (1900 if year >= 57 else 2000)}-{intl[2:]}"
    return {
        "OBJECT_NAME": name,
        "OBJECT_ID": object_id,
        "EPOCH": sat_epoch_datetime(sat).replace(tzinfo=None).strftime(_EPOCH_FORMAT),
        "MEAN_MOTION": sat.no_kozai * rev_per_day,
        "ECCENTRICITY": sat.ecco,
        "INCLINATION": math.degrees(sat.inclo),
        "RA_OF_ASC_NODE": math.degrees(sat.nodeo),
        "ARG_OF_PERICENTER": math.degrees(sat.argpo),
        "MEAN_ANOMALY": math.degrees(sat.mo),
        "EPHEMERIS_TYPE": sat.ephtype,
        "CLASSIFICATION_TYPE": sat.classification,
        "NORAD_CAT_ID": sat.satnum,
        "ELEMENT_SET_NO": sat.elnum,
        "REV_AT_EPOCH": sat.revnum,
        "BSTAR": sat.bstar,
        "MEAN_MOTION_DOT": sat.ndot * rev_per_day * 1440.0,
        "MEAN_MOTION_DDOT": sat.nddot * rev_per_day * 1440.0 * 1440.0,
    }


# ---------------------------------------------------------------------------------------------
# Uso


def satrec(record: Mapping[str, object]) -> Satrec:
    sat = Satrec()
    omm.initialize(sat, {k: (str(v) if v is not None else "") for k, v in record.items()})
    return sat


def epoch(record: Mapping[str, object]) -> datetime:
    return datetime.strptime(str(record["EPOCH"]), _EPOCH_FORMAT)


def perigee_apogee_km(record: Mapping[str, object]) -> tuple[float, float]:
    """Altitudes do perigeu e do apogeu (km), pelo movimento médio e excentricidade (WGS72)."""
    n = float(record["MEAN_MOTION"]) * 2.0 * math.pi / 86400.0  # rad/s
    a = (MU_KM3_S2 / n**2) ** (1.0 / 3.0)
    e = float(record["ECCENTRICITY"])
    return a * (1.0 - e) - EARTH_RADIUS_KM, a * (1.0 + e) - EARTH_RADIUS_KM


def periapsis_km(record: Mapping[str, object]) -> float:
    """PERIAPSIS do registro (Space-Track) ou calculado dos elementos."""
    value = record.get("PERIAPSIS")
    return float(value) if isinstance(value, int | float) else perigee_apogee_km(record)[0]


def latest_per_object(records: Iterable[Mapping[str, object]]) -> list[Record]:
    """Um conjunto por objeto, o de época mais recente (como o app antigo antes de propagar)."""
    best: dict[int, Mapping[str, object]] = {}
    for r in records:
        norad = int(r["NORAD_CAT_ID"])
        if norad not in best or str(r["EPOCH"]) > str(best[norad]["EPOCH"]):
            best[norad] = r
    return [dict(best[k]) for k in sorted(best, reverse=True)]


def age_days(record: Mapping[str, object], at: datetime) -> float:
    return (at - epoch(record)) / timedelta(days=1)
