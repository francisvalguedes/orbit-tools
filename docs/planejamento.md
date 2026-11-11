# Planejamento do orbit-tools

Detalha o [PLANO.md](../PLANO.md). Esta versão não se prende ao desenho dos apps Streamlit: o comportamento deles é a referência de cálculo, mas a organização, as bibliotecas e o fluxo de uso foram repensados com base nos testes da seção 1.

## 0. Principais mudanças em relação aos apps antigos

| Antes | Agora | Motivo |
|---|---|---|
| astropy para TEME→ITRS | Rotação própria (GMST IAU-82 + movimento do polo), com EOP opcional | Mesmo resultado do astropy a 1 cm, 300× mais rápido, sem download obrigatório de tabelas IERS (1.1) |
| Um objeto por vez, com astropy em cada um | Todos os objetos de uma vez (`SatrecArray`), rotação calculada uma vez por instante | Mesmas passagens, 12× mais rápido; o catálogo LEO inteiro (16 mil objetos, 1 dia) em 16 s (1.2) |
| Busca por distância só com passagens completas | Distância e, opcionalmente, elevação mínima; passagens cortadas pela janela opcionais; erros do SGP4 tratados | Corrige perdas silenciosas e dados inválidos (seção 5) |
| Pasta temporária por sessão e resultados em disco | Servidor sem estado: o navegador guarda os elementos; trajetórias recalculadas sob demanda | O cálculo ficou rápido o bastante para não guardar resultados |
| Tarefas com barra de progresso fazendo polling | Uma resposta em fluxo (NDJSON) com progresso e resultado; cancelar = fechar a requisição | Sem fila, sem armazenamento de tarefas |
| Tabela colorida + RCS_MIN só na distância mínima | Tabela com filtros e regras de seleção, linha do tempo com conflitos, margem de detecção ao longo da passagem | Pedido do usuário: um método para selecionar objetos e gerar trajetórias com taxa maior |
| Erro da comparação em X/Y/Z do ENU do sensor | Erro radial, ao longo e através da órbita (RIC) | Independe do sensor e tem significado físico |
| pandas, pymap3d, astropy, folium, geopandas, openpyxl, spacetrack, httpx2 no app | Backend: `numpy`, `sgp4`, `httpx2`, `fastapi`, `uvicorn`, `pydantic-settings` | Imagem menor e menos dependências para manter |

## 1. Testes realizados

Scripts em [experimentos/](experimentos/), executados com o ambiente do TrajectoryOrbitPropag (sgp4 2.27, astropy 8.0, numpy 2.5) e elementos públicos do Celestrak de 10/11/2026. Local fictício (−10°, −40°, 0 m), d_max 1100 km, d_min 1000 km (padrões do app antigo).

### 1.1 TEME → ITRS sem astropy

ISS, 3 dias a cada 10 s (25 920 posições), comparando com `TEME.transform_to(ITRS)` do astropy:

| Implementação própria | Erro máximo | Erro médio | Tempo |
|---|---|---|---|
| Sem EOP (UT1 = UTC, sem polo) | 36 m | 29 m | 1,3 ms |
| Com EOP (UT1−UTC e polo da tabela IERS) | 1,0 cm | 0,4 cm | 1,3 ms |
| astropy | referência | | 380 ms |

O erro do SGP4 em relação à órbita real é de cerca de 1 km na época e cresce alguns km por dia, então mesmo sem EOP a diferença é desprezível. Com EOP, o resultado é igual ao do astropy. Conclusão: **astropy sai**, e o skyfield também não é necessário.

EOP: arquivo `finals2000A.all` do IERS ou da USNO, ou o `EOP-All.csv` do Celestrak, os três públicos e acessíveis. O servidor baixa um deles uma vez por semana, guarda em cache e usa UT1 = UTC se não houver arquivo. A imagem Docker já sai com uma cópia.

### 1.2 Busca de passagens vetorizada

| Caso | App antigo | Novo |
|---|---|---|
| 100 objetos LEO, 1 dia | 1,1 s, 96 passagens | 0,09 s, as mesmas 96 passagens |
| 4 022 objetos, 1 dia | ~45 s (estimado) | 4,0 s, 5 082 passagens |
| 16 088 objetos (todo o LEO ativo), 1 dia | ~3 min (estimado) | 16,5 s, 23 152 passagens |

Nas 96 passagens comparadas: H0 idêntico, número de pontos igual (±1 na borda), distância mínima com diferença de até 29 m, explicada pela falta de EOP na versão de teste. Boa parte dos 16 s está no refinamento de cada passagem em Python, que ainda pode ser vetorizado.

### 1.3 Geração em taxa alta

30 passagens de 900 s a 100 Hz (2,7 milhões de pontos, SGP4 + rotação): 0,8 s. O limite de 30 objetos do app antigo pode subir bastante; o que limita passa a ser o tamanho do arquivo gerado.

### 1.4 Celestrak

O Celestrak não envia cabeçalho CORS, e o Space-Track exige login com cookie. Os dois precisam de um servidor intermediário, então um app só no navegador não elimina o backend.

## 2. Escopo da primeira versão

Quatro módulos:

1. **Elementos:** obter, carregar, filtrar e comparar elementos orbitais.
2. **Passagens:** buscar passagens sobre um sensor, selecionar e gerar trajetórias com a taxa desejada. Reúne as antigas páginas 02, 03 e 05.
3. **Órbita:** um objeto num intervalo qualquer: órbita 3D, traço no solo e efemérides tabeladas em qualquer sistema, com exportação. Não existia como página.
4. **Conversões:** as seis páginas do conversor.

Fora da v1: login, banco de dados, i18n, propagadores além do SGP4, sensores ópticos, previsão de reentrada.

## 3. Arquitetura

### 3.1 Princípio: servidor sem estado

O cálculo ficou rápido o bastante para não guardar resultados:

- O **navegador** é a fonte dos dados do usuário: elementos carregados (IndexedDB, porque um catálogo grande passa do limite do `localStorage`), locais, radares, parâmetros e seleções.
- O **servidor** só calcula e mantém caches: consultas ao Celestrak (2 h), arquivo de EOP (7 dias) e conjuntos de elementos enviados (por hash do conteúdo, 7 dias). O cache de conjuntos evita reenviar megabytes a cada busca: o navegador envia o conjunto uma vez, recebe o `set_id` e, se o servidor responder que expirou, reenvia automaticamente.
- **Trajetórias** são determinísticas (elemento + local + H0 + HF + taxa) e são recalculadas para o globo, a tabela e a exportação.
- **Cálculos longos** (busca em catálogos grandes, comparação, exportação) respondem em fluxo: linhas NDJSON com progresso e, no fim, o resultado. Cancelar é fechar a requisição.

Some o que mais dava trabalho no app antigo: pastas temporárias, limpeza, sessão, fila de tarefas.

**Space-Track:** o acordo de uso proíbe redistribuir os dados. As credenciais vêm na requisição e são descartadas; os conjuntos obtidos do Space-Track ficam no cache só pelo hash (sem listagem, sem compartilhamento entre usuários) e nunca entram no cache público de consultas.

### 3.2 Backend

```
backend/src/orbit_tools/
  core/                    Python puro: numpy + sgp4, sem rede e sem FastAPI
    time.py                UTC ↔ (jd, fr), grade de tempo, formatos ISO do app antigo
    eop.py                 leitura do finals2000A/EOP-All e interpolação de UT1−UTC e polo
    frames.py              TEME → ITRS (posição e velocidade), GMST IAU-82
    geodesy.py             do trajetory-analysis + GMS→decimal, círculo no solo, ENU¹→ENU²
    kinematics.py          do trajetory-analysis (derivadas), taxas de azimute e elevação
    elements.py            OMM (CSV, JSON, XML) e TLE → registros validados; perigeu, período
    propagation.py         SGP4 vetorizado para N objetos × M instantes, em blocos de memória
    passes.py              busca, refinamento, estatísticas por passagem
    radar.py               equação do radar, margem de detecção ao longo da passagem
    selection.py           regras de seleção e detecção de conflitos no tempo
    compare.py             erro RIC entre conjuntos sucessivos
    formats.py             .trn, .trj, CSV de dados, CSV de resumo (formatos do app antigo)
  sources/
    celestrak.py           GP por CATNR, GROUP, NAME, INTDES; cache
    spacetrack.py          login, gp, gp_history com httpx2; respeita 30/min e 300/h
    eop.py                 download periódico do EOP
  api/
    main.py, routes/       elements, passes, orbit, convert, meta
    schemas.py             contrato da API (Pydantic)
    streaming.py           respostas NDJSON com progresso
  cache.py                 caches em disco com validade
  settings.py              limites e caminhos (prefixo ORBIT_)
```

`core/` pode ser instalado e usado sozinho em scripts (`pip install orbit-tools` só com `numpy` e `sgp4`; as dependências web ficam num extra `[server]`).

Desenvolvimento: `pytest`, `ruff`, `pymap3d` e `astropy` (só como referência nos testes).

### 3.3 API

| Rota | Função |
|---|---|
| `GET /api/meta` | versão, data do EOP em uso, limites, exemplos (locais, radares, listas NORAD) |
| `POST /api/elements/celestrak` | consulta por NORADs, grupo ou nome → registros + `set_id` |
| `POST /api/elements/spacetrack` | credenciais + consulta (últimos por NORAD, filtro LEO, histórico por época) → registros + `set_id` |
| `POST /api/elements/parse` | arquivo OMM ou TLE → registros + `set_id` |
| `POST /api/elements/store` | reenvio de um conjunto expirado |
| `POST /api/elements/compare` | fluxo: comparação RIC entre conjuntos sucessivos |
| `POST /api/passes/search` | fluxo: busca de passagens (`set_id`, local, critérios, janela, radar opcional) |
| `POST /api/passes/trajectory` | uma passagem em qualquer taxa (globo, gráfico polar, tabela) |
| `POST /api/passes/export` | fluxo: ZIP com as passagens selecionadas, na taxa e nos formatos escolhidos |
| `POST /api/orbit/ephemeris` | um objeto, intervalo e passo livres, sistemas escolhidos |
| `POST /api/convert/points` | conversão de pontos entre geodésicas, ECEF, ENU e AZ/EL/D |
| `POST /api/convert/dms` | GMS ↔ decimal |
| `POST /api/convert/kinematics` | ENU¹→ENU², velocidade e aceleração |

### 3.4 Frontend

Mantém a base do trajetory-analysis (mesmo autor, mesma manutenção): React 19, TypeScript, Vite, Mantine, TanStack Query, Plotly e CesiumJS, carregados sob demanda como lá. Entram:

| Biblioteca | Uso | Alternativas descartadas |
|---|---|---|
| TanStack Table + TanStack Virtual | tabela de passagens com milhares de linhas, ordenação, filtros, seleção | AG Grid (pesado; seleção avançada é paga), mantine-react-table (atrasa a cada versão nova do Mantine) |
| Papa Parse | leitura de CSV no navegador (conversões, listas NORAD, locais), inclusive com BOM, como nos exemplos antigos | ler no servidor (um envio a mais por arquivo) |
| idb-keyval | elementos e sessões no IndexedDB | `localStorage` (limite de ~5 MB) |

Organização: `features/{elements,passes,orbit,convert}`, `sites/` (locais e radares do usuário), `globe/`, `charts/`, `api/`. O estado de cada módulo fica na URL quando couber (local, janela, critérios), para dar para compartilhar um link de configuração.

## 4. Módulos

### 4.1 Elementos

- **Celestrak** (padrão, sem conta): por NORAD único ou lista, por grupo (`stations`, `active`, `visual`, `last-30-days`...), por nome.
- **Space-Track** (conta do usuário): últimos elementos por lista NORAD (a lista do app, até 650 objetos, ou um CSV do usuário), filtro LEO do app antigo (`MEAN_MOTION > 11.25`, sem decaimento, `RCS_SIZE = Large`, perigeu < 500 km, época de até 1 dia), histórico por intervalo de época (para a comparação).
- **Arquivo:** OMM em CSV, JSON ou XML, e TLE de 2 ou 3 linhas.
- Tabela com filtro por tipo (carga, corpo de foguete, detrito), tamanho de RCS, perigeu, idade da época. Avisos de NORAD não encontrados e de objetos já reentrados (como hoje).
- **Comparação** (aba): para objetos com dois ou mais conjuntos, propaga os sucessivos no mesmo intervalo e mostra o erro radial, ao longo e através da órbita, médio e máximo. Mantém `TRACK = 1` para erro médio < 3 km. Gráfico do erro por conjunto, como hoje.

### 4.2 Passagens: busca

Entradas: conjunto de elementos, local, janela (UTC), d_max, d_min, elevação mínima (opcional, padrão desligada para manter a paridade), taxa de H0 (padrão 1 s), incluir passagens cortadas pela janela (padrão não).

Algoritmo:

1. Descarta objetos com perigeu > d_max (calculado dos elementos quando a coluna `PERIAPSIS` não existe).
2. Propagação grossa (30 s) de todos os objetos de uma vez, em blocos de tempo para limitar a memória.
3. Intervalos com distância < d_max (e elevação ≥ mínima, se pedida).
4. Para cada intervalo, refinamento na taxa de H0 em volta das bordas; H0 alinhado à grade de segundos UTC, como no app antigo.
5. Aceita se a distância mínima < d_min.
6. Amostras com erro do SGP4 são descartadas e a passagem é marcada.

Resultado por passagem (colunas do resumo antigo mais as novas):

| Antigas | Novas |
|---|---|
| NORAD_CAT_ID, OBJECT_NAME, RCS_SIZE, RCS, H0, H0_H, H0_RANGE, MIN_RANGE_H, MIN_RANGE_PT, MIN_RANGE, END_H, END_PT, END_RANGE, elementos | `DURATION`, `MAX_EL`, `MAX_EL_H`, `AZ_H0`, `AZ_END`, `MAX_AZ_RATE`, `MAX_EL_RATE`, `EPOCH_AGE` (dias entre a época e H0), `SGP4_ERROR` |

`MAX_AZ_RATE` destaca passagens perto do zênite, que exigem do servo velocidades de azimute muito altas.

### 4.3 Passagens: seleção e geração de trajetórias

Substitui a tabela colorida da página 05. A seleção é feita por três caminhos, que se combinam:

1. **Tabela** com ordenação, filtro por coluna e caixa de seleção por linha (e "selecionar todos os filtrados").
2. **Regras** num painel: por exemplo, elevação máxima ≥ 20°, H0 entre 11:00 e 20:00, duração ≥ 90 s, margem de detecção ≥ 3 dB, época com menos de 2 dias, sem reentrada. "Aplicar regras" marca as passagens que atendem. As regras ficam salvas no navegador e podem ser exportadas.
3. **Linha do tempo** (Plotly): uma barra por passagem ao longo da janela; clique seleciona. Passagens selecionadas que se sobrepõem no tempo aparecem como **conflito**, porque um sensor rastreia um objeto por vez. Uma ação "resolver conflitos" mantém, em cada grupo sobreposto, a passagem de maior prioridade (critério escolhido: margem, elevação, RCS).

**Detecção pelo radar** (opcional, com um radar cadastrado): o app antigo calculava o RCS mínimo só na distância mínima. Agora a margem `10·log10(RCS / RCS_MIN(R(t)))` é calculada ao longo de toda a passagem, o que dá a margem máxima, a duração detectável e o primeiro e o último instante detectável. O RCS vem de `RCS.csv`; sem ele, usa um valor representativo da classe `RCS_SIZE` (LARGE 1 m², MEDIUM 0,1 m², SMALL 0,01 m², configuráveis). A coluna `RCS_MIN` antiga continua no resumo.

**Visualização** de uma passagem: globo Cesium (trajetória, sensor, círculos d_max e d_max·cos(El final) como no mapa antigo), gráfico polar azimute×elevação e gráficos de distância, elevação e taxas no tempo.

**Geração:** para as passagens selecionadas, na taxa escolhida (padrão: a do radar, 100 Hz), de H0 até HF (ou só o trecho detectável). Formatos, escolhidos por caixa de seleção: `.trn` e `.trj` (cabeçalhos idênticos aos antigos), CSV completo (tempo, AZ/EL/D, ENU, ECEF, geodésicas, taxas), resumo CSV, elementos usados. Sai um ZIP em fluxo.

Os sistemas de rastreio do CLBI e do CLA leem só o `.trn` (ENU sem tempo), e o H0 vai no **nome do arquivo**, no padrão antigo: `obj-<NORAD>-<AAAA_MM_DD>-H0-<HH_MM_SS>TU.trn` (e `100Hz_obj-...` na taxa do radar, `pobj-...trj`). O nome só tem segundos inteiros; por isso o H0 é sempre alinhado à grade de segundos UTC, inclusive no "só o trecho detectável", para que o nome represente o H0 exato. O padrão do nome fica configurável (modelo com `{norad}`, `{h0:%Y_%m_%d-H0-%H_%M_%S}`, `{rate}`), com o antigo como padrão. O CSV completo com tempo absoluto continua como opção para análise, não para os sistemas de rastreio.

O limite deixa de ser "30 objetos" e passa a ser o total de pontos (`ORBIT_MAX_EXPORT_POINTS`, padrão 50 milhões).

A seleção de colunas por arquivo de máscara do app antigo vira "modelo de colunas do resumo": o usuário escolhe e renomeia as colunas uma vez e salva como modelo (JSON), importável e exportável.

### 4.4 Órbita

Um objeto: intervalo e passo livres, saída em TEME, ITRS/ECEF, geodésicas e, se houver local escolhido, ENU e AZ/EL/D, com velocidades. Globo com a órbita (referencial inercial ou fixo), traço no solo e posição animada. Exporta CSV.

### 4.5 Conversões

- **Converter pontos** (uma aba no lugar das antigas 02, 03, 04 e 05): sistema de entrada (geodésicas, ECEF, ENU, AZ/EL/D), local de referência, unidades (m/km, graus/rad), entrada manual ou CSV; saída em todos os sistemas e em ENU e AZ/EL/D de quantos locais forem escolhidos. O ENU¹→ENU² da antiga página 04 é entrada em ENU de um local com saída em outro, então não precisou de aba própria.
- **GMS ↔ decimal**, aceitando também os formatos com hemisfério (`5°55'S`).
- **Velocidade e aceleração**, com gráficos, tabela e globo. Ângulos em graus (o app antigo exportava em radianos).
- Elipsoide WGS84 ou WGS72, já suportado pelo `geodesy.py`.
- Todas mostram os pontos no globo.

### 4.6 Locais e radares

Ficam no navegador, com importação e exportação em CSV (mesmo formato do `confLocalWGS84.csv` e do `confRadar.csv`) e JSON. O servidor só oferece exemplos fictícios ou públicos; quem instala no próprio servidor pode apontar `ORBIT_SITES_FILE` para um arquivo seu, fora do git, que aparece como lista de locais da instalação. Usar a localização do navegador como local continua disponível (substitui o `streamlit_geolocation`).

## 5. Correções do código antigo

| # | Problema | Correção |
|---|---|---|
| 1 | `orbit_propag` ignora o `error_code` do SGP4: objetos que decaem geram posições inválidas | Descartar amostras com erro e marcar a passagem |
| 2 | Passagens já em andamento no início da janela, ou que terminam depois do fim, são perdidas sem aviso | Opção "incluir passagens cortadas pela janela", com marcação |
| 3 | Filtro por perigeu só quando a coluna `PERIAPSIS` existe (Space-Track) | Calcular o perigeu dos elementos |
| 4 | A distância mínima é a menor amostra, com resolução da taxa de H0 | Avaliado na fase 1: o refinamento mudaria o valor em até ~12 m a 500 km; mantido como no app antigo |
| 5 | Aceleração do conversor com `np.gradient` duas vezes (usa os pontos i±2) | `kinematics.derivatives` do trajetory-analysis (pontos i±1) |
| 6 | `dd_to_dms_string` pode gerar `60.000000"` (ex.: 10,9999999999°) | Arredondar antes de separar graus, minutos e segundos |
| 7 | Número de pontos a 100 Hz `round(END_PT / taxa)` não inclui o ponto final | De H0 até HF inclusive, documentado |
| 8 | Limite de objetos que cai com a janela (`5000 · fração`) e tempo máximo de 2 min | Limite por custo (objetos × dias), configurável |
| 9 | O cadastro "definitivo" de locais grava no CSV do servidor, visível a todos | Locais no navegador (4.6) |
| 10 | Cache do Celestrak gravado dentro da pasta do código | Cache em `ORBIT_DATA_DIR` |
| 11 | Senha do proxy em `conf.json` | Variáveis de ambiente padrão (`HTTPS_PROXY`) |
| 12 | ECEF → geodésicas do pymap3d perde precisão com a altitude (5 cm a 1 600 km, ~80 m em GEO); encontrado na fase 1 | Solução fechada de Vermeille, exata em qualquer altitude (já no `geodesy.py`) |

As diferenças de resultado que essas correções causam ficam listadas em `docs/` e nos testes de paridade (cada teste diz se espera igualdade ou a diferença documentada).

## 6. Testes

| Teste | Referência | Tolerância |
|---|---|---|
| Conversões | pymap3d, pontos sintéticos (quadrantes, polos, antimeridiano) | 1 mm; 1e-9° |
| TEME→ITRS | astropy, mesma tabela EOP versionada nos testes | 1 cm |
| Propagação | `PropagInit.orbit_propag` antigo (referências geradas por script) | 1 cm com EOP |
| Busca de passagens | `search2h0` antigo, ISS e 100 objetos LEO, 1 dia | mesmo H0, mesmo número de pontos ±1, distância mínima 1 m |
| Formatos | arquivos gerados pelo app antigo | byte a byte |
| Comparação | página 04 antiga (norma do erro) | 1 m |
| Radar | `rcs_min` antigo | 1e-12 relativo |
| Velocidade/aceleração | velocidade: página 06 antiga; aceleração: diferença esperada (correção 5) | exata / documentada |
| Fontes | respostas gravadas do Celestrak e do Space-Track | sem rede no CI |
| API | `TestClient` (sobre `httpx2`), inclusive o fluxo NDJSON e o reenvio de conjunto expirado | |

Só com dados públicos (elementos do Celestrak) e locais fictícios, então as referências ficam no git e tudo roda no GitHub Actions.

## 7. Conteúdo que não entra no repositório

- Locais e radares dos apps antigos (`confLocalWGS84.csv`, `confRadar.csv`), as constantes `GAMA_*` do conversor e o `sites.json` do trajetory-analysis.
- Os CSVs `p*_exemplo.csv` do conversor, que usam um local de referência real: refazer com um local fictício.

Podem entrar: `RCS.csv` e `norad_id.csv` (catálogo público) e elementos públicos do Celestrak para teste. Licença MIT, como os três repositórios de origem.

## 8. Fases

Cada fase termina com testes, ruff, oxlint e build sem erros, e com o app rodando.

**Fase 0. Esqueleto.** `git init`, `main`/`develop`, `.gitignore`, licença MIT, `backend/` com uv (ruff, pytest, `/api/meta`), `frontend/` com Vite e a base visual do trajetory-analysis com os quatro módulos vazios, `CLAUDE.md`, `README.md`, GitHub Actions.

**Fase 1. Núcleo de cálculo** (concluída). `time`, `eop`, `frames`, `geodesy`, `kinematics`, `elements`, `propagation`, `passes`, `radar`, `compare`, `formats`; script de referências do app antigo; testes de paridade. Resultados e diferenças documentadas em [calculo.md](calculo.md).

**Fase 2. Conversões** (concluída). Rotas `/api/convert/*`, locais de exemplo no `/api/meta` (substituíveis por `ORBIT_SITES_FILE`), cadastro de locais no navegador, abas Converter pontos, GMS e Velocidade e aceleração, globo e gráficos sob demanda, layout para celular.

**Fase 3. Elementos.** Fontes, cache, `set_id`, IndexedDB, tabela, comparação.

**Fase 4. Passagens.** Busca em fluxo, tabela, regras, linha do tempo e conflitos, radar, visualização (globo, polar, gráficos), exportação ZIP.

**Fase 5. Órbita.** Efemérides, globo com órbita e traço no solo.

**Fase 6. Distribuição.** `Dockerfile` em dois estágios e `docker compose`; unidade systemd; documentação de uso, cálculo e formatos em `docs/`; espelho público (Hugging Face Spaces ou Render).

**Fase 7. Transição.** Uso em paralelo com os apps antigos no CLBI e no CLA; depois, arquivar os dois repositórios com aviso apontando para o orbit-tools.

## 9. Decisões e pontos em aberto

Decididos:

- **RCS por classe** quando o objeto não está em `RCS.csv`: LARGE 1 m², MEDIUM 0,1 m², SMALL 0,01 m², configuráveis.
- **Prioridade na resolução de conflitos:** margem de detecção; sem radar, elevação máxima. O critério pode ser trocado na interface.
- **Arquivos para rastreio:** `.trn`/`.trj` idênticos aos antigos, com H0 no nome do arquivo; sem CSV com tempo absoluto para os sistemas de rastreio por enquanto (4.3).
- **Código comum com o trajetory-analysis:**
  - Nas fases 0 e 1, copiar `geodesy.py`, `kinematics.py` e a base do frontend (tema, tokens de cor, `Plot.tsx`, `globe/common.ts`, `format.ts`, `export.ts`). Cada arquivo copiado registra no cabeçalho a origem e a data da cópia.
  - No fim da fase 1, com o núcleo estável e coberto pelos testes de paridade, avaliar se o trajetory-analysis passa a importar as conversões de `orbit_tools.core` e apagar a própria cópia. Vale a pena se, até lá, a mesma correção já tiver sido feita nos dois projetos. A distância geodésica (`geographiclib`) fica no trajetory-analysis, para o núcleo do orbit-tools continuar só com `numpy` e `sgp4`.
  - A base do frontend continua copiada: é pequena e muda pouco.
