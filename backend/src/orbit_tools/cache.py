"""
Cache em disco com validade, um arquivo por chave (nome = hash da chave).

Usado para consultas ao Celestrak, o SATCAT, o EOP e os conjuntos de elementos enviados pelo
navegador. Nada aqui é essencial: apagar a pasta só faz o servidor buscar ou pedir os dados de novo.
"""

from __future__ import annotations

import hashlib
import os
import time
from pathlib import Path


class DiskCache:
    def __init__(self, root: Path, ttl_s: float):
        self.root = root
        self.ttl_s = ttl_s

    def _path(self, key: str) -> Path:
        return self.root / hashlib.sha256(key.encode()).hexdigest()

    def get(self, key: str, *, touch: bool = False) -> bytes | None:
        """Conteúdo se existir e estiver dentro da validade; `touch` renova a validade."""
        hit = self.get_stale(key)
        if hit is None or hit[1] > self.ttl_s:
            return None
        if touch:
            os.utime(self._path(key))
        return hit[0]

    def get_stale(self, key: str) -> tuple[bytes, float] | None:
        """Conteúdo e idade em segundos, mesmo vencido (para usar quando a fonte falha)."""
        path = self._path(key)
        try:
            return path.read_bytes(), time.time() - path.stat().st_mtime
        except FileNotFoundError:
            return None

    def put(self, key: str, data: bytes) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        path = self._path(key)
        tmp = path.with_suffix(f".{os.getpid()}.tmp")
        tmp.write_bytes(data)
        tmp.replace(path)  # atômico: leitores nunca veem um arquivo pela metade

    def purge(self) -> int:
        """Apaga as entradas vencidas; devolve quantas."""
        if not self.root.exists():
            return 0
        now = time.time()
        removed = 0
        for path in self.root.iterdir():
            try:
                if now - path.stat().st_mtime > self.ttl_s:
                    path.unlink()
                    removed += 1
            except FileNotFoundError:
                pass
        return removed
