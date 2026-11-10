# CLAUDE.md

Orientações para sessões do Claude Code neste repositório.

## Projeto

Aplicação web open source de elementos orbitais, passagens sobre sensores, trajetórias para rastreio e conversões de coordenadas. Público principal: CLBI e CLA. Substitui os apps Streamlit `TrajectoryOrbitPropag` e `trajectory-coordinate-converter`, que são a referência de cálculo (paridade), mas não de organização.

Antes de decisões de arquitetura, ler [docs/planejamento.md](docs/planejamento.md) (decisões, módulos, fases e os testes que as justificam).

## Estrutura

```
backend/   Python 3.12 (uv) · FastAPI · numpy · sgp4
  src/orbit_tools/core/     núcleo de cálculo puro: só numpy e sgp4, sem rede, sem FastAPI
  src/orbit_tools/sources/  clientes Celestrak, Space-Track e EOP
  src/orbit_tools/api/      rotas e modelos Pydantic (contrato da API)
  tests/                    pytest, incluindo paridade com os apps antigos
frontend/  React 19 · TypeScript 7 · Vite · Mantine · TanStack Query
docs/      documentação (português)
```

Regras de dependência: `api/` usa `core/` e `sources/`; `core/` nunca importa a camada web, a rede, astropy, pymap3d nem pandas (verificado por `tests/test_architecture.py`).

## Comandos

```bash
# backend (na pasta backend/)
uv sync
uv run orbit-tools                        # http://127.0.0.1:8000 (docs em /docs)
uv run pytest
uv run ruff check . && uv run ruff format --check .

# frontend (na pasta frontend/)
npm ci
npm run dev                               # http://localhost:5173, encaminha /api para a porta 8000
npm run lint                              # oxlint
npm run build                             # tsc -b + vite build → frontend/dist
```

Antes de considerar uma tarefa concluída: testes, ruff, lint e build sem erros. Para mudanças de interface, rodar o app e conferir visualmente.

## Convenções

- **Idioma:** interface, documentação, mensagens ao usuário e comentários em **português**. Identificadores de código e da API em **inglês**. Sem i18n.
- **Comentários:** poucos, explicando o porquê.
- **Python:** ruff com linha de 120; funções do núcleo vetorizadas com numpy e sem alterar os arrays de entrada.
- **Servidor sem estado:** o navegador guarda os dados do usuário (elementos, locais, radares, seleções); o servidor só calcula e mantém caches com validade em `ORBIT_DATA_DIR`. Cálculos longos respondem em fluxo (NDJSON).
- **Paridade:** mudanças de cálculo mantêm os testes de paridade com os apps antigos ou documentam a diferença.
- **Formatos de rastreio:** `.trn` e `.trj` idênticos aos do app antigo, com H0 no nome do arquivo; os sistemas de rastreio do CLBI e do CLA dependem disso.
- **Números na interface:** espaço fino nos milhares e ponto decimal (`fmtNum` em `frontend/src/lib/format.ts`).
- **Cesium e Plotly:** carregados sob demanda (`React.lazy`), nunca no carregamento inicial.
- **Tipos da API:** `frontend/src/api/types.ts` espelha à mão `backend/src/orbit_tools/api/schemas.py`; ao mudar um, mudar o outro.
- **Código copiado do trajetory-analysis:** o cabeçalho do arquivo registra a origem e o commit. Até o fim da fase 1, correções feitas aqui devem ser avaliadas também lá.

## Open source e dados

- **Nada específico do CLBI ou do CLA no repositório:** sem coordenadas reais de rampas, sensores ou radares, sem trajetórias restritas. Exemplos só com locais fictícios ou públicos. Configurações reais de uma instalação ficam fora do git (`config/local/`, variáveis de ambiente).
- **Space-Track:** credenciais só na requisição, nunca gravadas nem registradas em log. O acordo de uso proíbe redistribuir os dados: conjuntos vindos do Space-Track não entram em caches compartilhados.
- **Dados de teste:** só elementos públicos (Celestrak) e locais fictícios.

## Git

- `main` é estável; trabalho novo na branch `develop` ou em branches de funcionalidade, com pull request para o `main`.
- Commits e pushes só quando o usuário pedir.
- Mensagens de commit em português (`feat: ...`, `fix: ...`, `doc: ...`).
