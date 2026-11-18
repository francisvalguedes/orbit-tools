# Imagem do orbit-tools: frontend compilado e backend num processo só (uvicorn), como no serviço systemd.
# Publicada pelo GitHub Actions (.github/workflows/docker.yml) em ghcr.io/francisvalguedes/orbit-tools.
# O estágio do frontend exige processador com AVX (binários nativos do Vite 8): em servidores sem AVX,
# use a imagem publicada em vez de construir. Guia: docs/implantacao_docker.md

FROM node:24-slim AS frontend
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend/ ./
# Commit mostrado no selo da versão (a pasta .git não entra na imagem): passado pelo workflow docker.yml
ARG GIT_COMMIT=""
RUN GIT_COMMIT=$GIT_COMMIT npm run build


FROM python:3.12-slim-trixie
# Ambiente em /app/.venv, com o pacote instalado (não editável) e sem as dependências de desenvolvimento.
# O uv e o cache dele só existem durante a construção (--mount): não ficam na imagem.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never \
    UV_PROJECT_ENVIRONMENT=/app/.venv
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock backend/README.md ./
RUN --mount=from=ghcr.io/astral-sh/uv:0.11.33,source=/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra server --no-install-project
COPY backend/src ./src
RUN --mount=from=ghcr.io/astral-sh/uv:0.11.33,source=/uv,target=/bin/uv \
    --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --extra server --no-editable

COPY --from=frontend /src/frontend/dist /app/frontend/dist

# Caminhos fixos da imagem: dados e locais/radares vêm de volumes (ver deploy/compose.yaml)
ENV PATH=/app/.venv/bin:$PATH \
    ORBIT_FRONTEND_DIST=/app/frontend/dist \
    ORBIT_DATA_DIR=/data \
    ORBIT_SITES_CSV=/config/locais.csv \
    ORBIT_RADARS_CSV=/config/radares.csv

# Usuário fixo (UID 10001): o volume de dados é criado com o dono de /data na imagem
RUN useradd --system --uid 10001 --user-group --no-create-home orbit \
    && mkdir /data /config && chown orbit:orbit /data
USER 10001:10001
WORKDIR /app

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/meta', timeout=4)"]
# Um processo só: a manutenção (EOP, SATCAT, caches) e o limite do Space-Track ficam na memória do processo
CMD ["uvicorn", "orbit_tools.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
