# orbit-tools (backend)

API FastAPI e núcleo de cálculo. Ver o [README](../README.md) do repositório e o [CLAUDE.md](../CLAUDE.md).

```bash
uv sync                 # ambiente com as dependências de desenvolvimento
uv run orbit-tools      # http://127.0.0.1:8000 (documentação da API em /docs)
uv run pytest
uv run ruff check . && uv run ruff format --check .
```
