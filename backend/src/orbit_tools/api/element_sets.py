"""
Conjuntos de elementos enviados pelo navegador, guardados pelo hash do conteúdo.

O navegador é a fonte dos dados; isto só evita reenviar megabytes a cada busca. O id é o hash do
conteúdo e não há listagem: só quem tem o conjunto (ou o id) consegue usá-lo. Conjuntos sem uso por
`element_set_days` são apagados; o navegador reenvia quando recebe 404.
"""

from __future__ import annotations

import hashlib
import json

from ..cache import DiskCache
from ..core.elements import Record
from ..settings import settings


def _cache() -> DiskCache:
    return DiskCache(settings.data_dir / "sets", settings.element_set_days * 86400)


def _canonical(records: list[Record]) -> bytes:
    return json.dumps(records, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def store(records: list[Record]) -> str:
    body = _canonical(records)
    set_id = hashlib.sha256(body).hexdigest()[:32]
    _cache().put(set_id, body)
    return set_id


def load(set_id: str) -> list[Record] | None:
    if len(set_id) != 32 or any(c not in "0123456789abcdef" for c in set_id):
        return None
    body = _cache().get(set_id, touch=True)
    return None if body is None else json.loads(body)


def purge() -> int:
    return _cache().purge()
