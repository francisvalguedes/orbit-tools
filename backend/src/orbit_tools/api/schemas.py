"""Contrato da API. Espelhado à mão em frontend/src/api/types.ts: ao mudar um, mudar o outro."""

from pydantic import BaseModel


class Meta(BaseModel):
    name: str
    version: str
