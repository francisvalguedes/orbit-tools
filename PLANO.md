# orbit-tools — plano inicial

Software open source (GitHub) de propagação de órbita, geração de trajetória e conversão de coordenadas. Unifica dois apps Streamlit existentes numa aplicação web com a mesma arquitetura e estilo do trajetory-analysis.

Público principal: equipes que rastreiam objetos espaciais com radar.

## Repositórios de referência

| Caminho | Papel |
|---|---|
| `D:\rep_win\TrajectoryOrbitPropag` | App Streamlit atual de propagação: elementos orbitais (Space-Track/Celestrak, TLE/OMM), SGP4, mapa, comparação de órbitas, trajetória com H0 para rastreio. Usa astropy (TEME→ITRS) e pymap3d. Bilíngue (localazy). **Referência de comportamento (paridade).** |
| `D:\rep_win\trajectory-coordinate-converter` | App Streamlit atual de conversões: GMS↔decimal, geodésicas↔ECEF↔ENU↔AZ/EL/distância, ENU¹→ENU², velocidade/aceleração. **Referência de comportamento (paridade).** |
| `D:\rep_win\trajetory-analysis` | Modelo de **arquitetura e estilo**: FastAPI + núcleo de cálculo puro, React + Mantine + Plotly + CesiumJS, testes de paridade com o app Streamlit antigo. Ver o `CLAUDE.md`, `docs/` e `backend/src/trajetoria/core/geodesy.py` (conversões próprias, testadas contra o pymap3d). |

Páginas dos apps antigos:

- `TrajectoryOrbitPropag/source/pages/`: `00_Simplified`, `01_orbital_elements`, `02_orbit_propagation`, `03_map`, `04_orbit_compare`, `05_trajectory`; funções em `source/lib/orbit_functions.py` e `pages_functions.py`.
- `trajectory-coordinate-converter/source/pages/`: `01` GMS–decimal, `02` geodésicas→ECEF/ENU/AZ.EL.D, `03` ENU/AZ.EL.D→ECEF/geodésicas, `04` ENU¹→ENU², `05` ECEF→geodésicas/ENU/AZ.EL.D, `06` velocidade/aceleração; funções em `source/lib/`.

## Decisões tomadas

- **Nome:** `orbit-tools`; pacote Python `orbit_tools`.
- **Stack:** FastAPI no backend; React + Mantine + Plotly + CesiumJS no frontend, mesma base de estilo do trajetory-analysis. Python com `uv`.
- **Sem Streamlit:** abre mão da hospedagem gratuita do Streamlit Community Cloud (ele só expõe a porta do Streamlit, então não serve para FastAPI).
- **Idioma:** interface e documentação **só em português**, sem i18n. Identificadores de código e da API em **inglês**. O README tem um parágrafo curto em inglês no topo.
- **Núcleo independente:** `core/` é Python puro (sem FastAPI e sem HTTP) e pode ser usado como biblioteca. `api/` usa `core/`, e `core/` nunca importa a camada web.

## Estrutura proposta

```
orbit-tools/
  backend/src/orbit_tools/
    core/      geodesy, time, tle/omm, sgp4 propagation, passes, trajectory_gen
    sources/   clientes celestrak e spacetrack
    api/       rotas e modelos Pydantic
  backend/tests/   pytest, incluindo paridade com os dois apps Streamlit
  frontend/        React + Mantine + Cesium + Plotly
  docs/            em português
```

Módulos da interface:

1. **Elementos orbitais:** busca e filtro de TLE/OMM (Celestrak por padrão, Space-Track opcional).
2. **Propagação:** SGP4, órbita 3D e traço no solo no Cesium, passagens sobre o sensor.
3. **Trajetória:** geração de trajetória com H0 para rastreio.
4. **Conversões:** GMS↔decimal, geodésicas/ECEF/ENU/AZ.EL.D, ENU¹→ENU², velocidade/aceleração.

## Cuidados por ser open source

- **Nada específico de uma instalação no repositório:** sem dados de rastreio reais, sem coordenadas reais de rampas e sensores, sem trajetórias restritas. Locais e sensores ficam configuráveis pelo usuário, com exemplos fictícios ou públicos.
- **Credenciais do Space-Track:** informadas pelo usuário e nunca armazenadas no servidor.
- **Conversões:** reaproveitar o `geodesy.py` do trajetory-analysis. O pymap3d fica só como referência nos testes.
- **Deploy:** `Dockerfile`/`docker compose` para rodar com um comando, além do deploy com systemd no servidor próprio. Espelho público gratuito possível no Hugging Face Spaces (Docker) ou no Render (os planos gratuitos mudam; conferir antes).

## Pontos em aberto

- ~~Trocar astropy por skyfield?~~ Resolvido: nem um nem outro. Rotação própria TEME→ITRS, igual ao astropy a 1 cm com EOP (ver [docs/planejamento.md](docs/planejamento.md), seção 1).
- Arquivar `TrajectoryOrbitPropag` e `trajectory-coordinate-converter` com um aviso apontando para o `orbit-tools`?
- Licença (conferir a dos repositórios atuais).

## Próximo passo

O plano de migração está em [docs/planejamento.md](docs/planejamento.md). Próximo passo: fase 0 (esqueleto do repositório: backend com `uv`, frontend com Vite, `CLAUDE.md`, CI).

