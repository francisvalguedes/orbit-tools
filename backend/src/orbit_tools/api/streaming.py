"""
Respostas em fluxo (NDJSON) para cálculos longos: uma linha JSON por evento.

    {"type": "progress", "fraction": 0.42, "stage": "propagando"}
    {"type": "result", "data": {...}}
    {"type": "error", "detail": "mensagem", "status": 400}

O cálculo roda numa thread; se o cliente fecha a conexão, a próxima chamada de `report` interrompe
o cálculo. Não há fila nem armazenamento de tarefas: cancelar é fechar a requisição.
"""

from __future__ import annotations

import json
import logging
import math
import queue
import threading
from collections.abc import Callable, Iterator
from typing import Any

from fastapi.responses import StreamingResponse

from ..core.elements import ElementsError
from ..sources import SourceError

log = logging.getLogger(__name__)

Report = Callable[[float, str], None]


class Cancelled(Exception):
    pass


def jsonable(obj: Any) -> Any:
    """Troca NaN e infinito por None (JSON não os representa)."""
    if isinstance(obj, float):
        return obj if math.isfinite(obj) else None
    if isinstance(obj, dict):
        return {k: jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list | tuple):
        return [jsonable(v) for v in obj]
    return obj


def _line(event: dict) -> bytes:
    return (json.dumps(jsonable(event), ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def ndjson(work: Callable[[Report], Any]) -> StreamingResponse:
    """Executa `work(report)` e transmite o progresso e o resultado (já serializável em JSON)."""
    events: queue.Queue[dict | None] = queue.Queue()
    cancelled = threading.Event()

    def report(fraction: float, stage: str) -> None:
        if cancelled.is_set():
            raise Cancelled
        events.put({"type": "progress", "fraction": round(min(max(fraction, 0.0), 1.0), 4), "stage": stage})

    def run() -> None:
        try:
            events.put({"type": "result", "data": work(report)})
        except Cancelled:
            pass
        except (ValueError, ElementsError) as exc:
            events.put({"type": "error", "detail": str(exc), "status": 400})
        except SourceError as exc:
            events.put({"type": "error", "detail": str(exc), "status": exc.status})
        except Exception:
            log.exception("falha num cálculo em fluxo")
            events.put({"type": "error", "detail": "Erro interno no cálculo.", "status": 500})
        finally:
            events.put(None)

    def stream() -> Iterator[bytes]:
        thread = threading.Thread(target=run, daemon=True, name="calculo")
        thread.start()
        try:
            while (event := events.get()) is not None:
                yield _line(event)
        finally:
            cancelled.set()  # cliente desconectou ou terminou: interrompe na próxima chamada de report

    return StreamingResponse(stream(), media_type="application/x-ndjson", headers={"Cache-Control": "no-cache"})
