# Cálculo

Como o núcleo (`backend/src/orbit_tools/core/`) calcula cada grandeza, contra o que foi validado e onde difere dos apps antigos (TrajectoryOrbitPropag e trajectory-coordinate-converter).

## 1. Convenções

| Grandeza | Convenção |
|---|---|
| Tempo | UTC, `numpy.datetime64[ns]`; para o SGP4, data juliana em duas partes (`jd`, `fr`) |
| Distâncias | metros no núcleo; o resumo das passagens usa km, como o app antigo |
| Ângulos | graus (azimute a partir do norte, sentido horário, em [0, 360)) |
| Geodésicas e ENU | WGS84 em todo o app (o app antigo usava o padrão do pymap3d, também WGS84); o `geodesy.py` também aceita WGS72, só pelo uso como biblioteca |
| ENU | x = leste, y = norte, z = cima, origem no local (sensor) |

As funções são vetorizadas e não alteram os arrays de entrada.

## 2. Tempo (`time.py`)

`datetime64[ns]` não representa segundos intercalares: como na escala UTC do astropy, o dia do segundo intercalar é tratado como um dia comum. A grade de tempo é exata em nanossegundos (a 100 Hz, 15 min dão exatamente 90 001 instantes).

## 3. Parâmetros de orientação da Terra (`eop.py`)

UT1−UTC e movimento do polo (xp, yp), lidos do `finals2000A.all` do IERS/USNO ou do `EOP-All.csv` do Celestrak, e interpolados linearmente entre os valores diários, como no astropy. No dia de um segundo intercalar, UT1−UTC salta 1 s: a interpolação é feita na série sem os saltos (equivalente a UT1−TAI) e o salto é somado conforme o dia UTC do instante.

Fora do intervalo do arquivo, os valores ficam constantes nas extremidades e `EOP.covers` informa. Sem arquivo, `EOP.zero()` usa UT1 = UTC e polo nulo. O efeito de não ter EOP está em [melhorias.md](melhorias.md).

## 4. TEME → ITRS (`frames.py`)

```
r_PEF  = R3(GMST) · r_TEME           GMST IAU-82 em UT1 (mesma formulação do eraGmst82)
v_PEF  = R3(GMST) · v_TEME − ω × r_PEF
r_ITRS = Wᵀ · r_PEF                  W = polarm(xp, yp) de Vallado (2006)
```

**Validação** (`tests/test_frames.py`): contra `TEME.transform_to(ITRS)` do astropy, com a mesma tabela EOP, por 1 dia a cada 10 s: posição a menos de 2 cm e velocidade a menos de 0,1 mm/s. O GMST coincide com o `erfa.gmst82` a 10⁻¹⁵ rad.

## 5. Conversões (`geodesy.py`)

Copiado do trajetory-analysis (ver o cabeçalho do arquivo), sem a distância geodésica. Fórmula direta para geodésico → ECEF e solução fechada de Vermeille (2002) para ECEF → geodésico.

**Validação** (`tests/test_geodesy.py`), contra o pymap3d, que é o que as páginas do conversor antigo chamam:

| Conversão | Tolerância |
|---|---|
| Geodésico → ECEF, ENU ↔ ECEF, ENU ↔ AZ/EL/D, ENU¹ → ENU² | 1 µm; 10⁻¹² rad |
| ECEF → geodésico, da superfície a ~600 km | 10⁻⁹ grau; 1 mm |
| Círculo no solo (`geodetic_circ` do mapa antigo) | 10⁻⁹ grau |
| GMS ↔ decimal (página 01) | texto idêntico em 2 000 valores aleatórios |

**Diferenças documentadas:**

- **ECEF → geodésico acima do LEO:** a solução do pymap3d perde precisão com a altitude (ao voltar para ECEF: ~1 mm a 400 km, 5 cm a 1 600 km, ~80 m em órbita geoestacionária). A de Vermeille é exata em qualquer altitude (erro < 10⁻⁷ m). Para os objetos LEO dos apps antigos a diferença é desprezível.
- **GMS:** o conversor antigo podia gerar `10°59'60.000000"`; aqui os segundos são arredondados antes de separar graus e minutos (`11°0'0.000000"`). A leitura aceita também hemisfério (N/S/E/W/L/O), espaços e vírgula decimal.

## 6. Velocidade e aceleração (`kinematics.py`)

Copiado do trajetory-analysis: `v[i] = (x[i+1] − x[i−1]) / 2h` e `a[i] = (x[i+1] − 2x[i] + x[i−1]) / h²`.

**Diferenças em relação à página 06 do conversor** (`tests/test_kinematics.py`):

- Velocidade: idêntica nos pontos internos; nas bordas, diferença de 2ª ordem em vez de 1ª (mais exata).
- Aceleração: a página antiga aplicava `np.gradient` duas vezes, o que equivale a `(x[i+2] − 2x[i] + x[i−2]) / 4h²`, com o dobro do erro de truncamento e mais suavização. Aqui é a segunda diferença com os vizinhos imediatos, NaN nas bordas.
- Unidades: azimute e elevação e suas derivadas em graus (°, °/s, °/s²); a página antiga exportava em radianos. O azimute é derivado depois de desenrolado (sem o salto em 0/360°), como antes.

## 7. Elementos (`elements.py`)

OMM em CSV, JSON e XML e TLE de 2 ou 3 linhas, normalizados para o dicionário OMM do Celestrak e do Space-Track.

O Space-Track às vezes republica a mesma época de um objeto com outro `GP_ID` e pequenas diferenças (BSTAR, excentricidade); no histórico de 1 693 conjuntos usado nos testes manuais, 66 eram republicações. Ao receber elementos, fica só a publicação mais recente de cada época (`CREATION_DATE`, depois `GP_ID`), com um aviso; as épocas diferentes, que a comparação usa, ficam todas. Onde se usa "o elemento mais recente de cada objeto" (busca de passagens, módulo Órbita), vale a época mais nova e, no empate, a publicação mais nova. Campos que o sgp4 exige e arquivos de usuários às vezes não trazem recebem valores padrão (`CLASSIFICATION_TYPE` U, `ELEMENT_SET_NO` 999…). O perigeu é calculado dos elementos (constantes WGS72, as mesmas do Space-Track) quando não há `PERIAPSIS`.

## 8. Propagação e passagens (`propagation.py`, `passes.py`)

SGP4 da biblioteca `sgp4` (implementação de Vallado), vetorizado para muitos objetos com `SatrecArray`. Amostras com erro do SGP4 (objeto reentrado, órbita inválida) viram NaN.

Busca de passagens, com o mesmo critério do `search2h0` antigo:

1. Propagação grossa (30 s) de todos os objetos, em blocos de objetos × instantes.
2. Trechos com distância < d_max (e elevação ≥ mínima, opcional).
3. Cada trecho é refeito na taxa de H0 (1 s), de uma amostra grossa antes da entrada até a primeira amostra grossa fora; a passagem são as amostras finas dentro da região.
4. Aceita se a distância mínima < d_min.

O início da busca é arredondado para o segundo inteiro, então H0 é sempre um segundo exato (o nome dos arquivos de rastreio só tem segundos).

**Validação** (`tests/test_parity_orbit.py`), contra o código do app antigo com a mesma tabela EOP (referências geradas por `backend/tests/legacy/gen_orbit_refs.py`):

| Item | Resultado |
|---|---|
| Propagação (ISS 2025 e um objeto de 2026, 1 h) | ITRS, ENU e distância a < 2 cm; ângulos a < 10⁻⁶ grau |
| Busca de passagens (100 objetos LEO, 1 dia) | as mesmas 93 passagens; H0 idêntico; número de pontos ±1; distâncias a < 0,1 m |
| Resumo | H0, H0_H e RCS idênticos; MIN_RANGE_H e END_H idênticos salvo a amostra da borda |
| `.trn`, `.trj`, CSV de dados a 1 Hz | idênticos byte a byte para os mesmos números |
| Comparação de órbitas | mesmos pares, D_ERR_MEAN e D_ERR_MAX a < 5 cm, mesmo TRACK |
| RCS mínimo | 10⁻¹² relativo |

**Diferenças documentadas:**

- Passagens cortadas pelo início ou pelo fim da janela: o app antigo as descartava sem aviso; aqui são descartadas por padrão e podem ser incluídas (`include_partial`), marcadas como parciais.
- Erros do SGP4: o app antigo os ignorava e usava as posições inválidas; aqui as amostras são descartadas e a passagem é marcada (`SGP4_ERROR`).
- Filtro por perigeu: o app antigo só filtrava quando havia a coluna `PERIAPSIS` (Space-Track); aqui o perigeu é calculado dos elementos quando falta.
- Se o objeto sair e voltar à região no mesmo trecho fino, só o primeiro trecho contínuo vira passagem (o antigo juntava os dois, com um salto no tempo).
- A distância mínima continua sendo a da amostra mais próxima, como no app antigo. Refinar entre amostras mudaria o valor em até ~12 m a 500 km com amostras de 1 s; não compensa.
- `.trn` na taxa do radar: o app antigo gerava `END_PT / taxa` pontos e não incluía o instante final; aqui vai de H0 a HF inclusive (um ponto a mais). O cabeçalho (`END_PT`) é o mesmo.

Colunas novas no resumo: `DURATION`, `MAX_EL`, `MAX_EL_H`, `AZ_H0`, `AZ_END`, `MAX_AZ_RATE`, `MAX_EL_RATE` (taxas em graus/s; destacam passagens perto do zênite), `EPOCH_AGE` (dias entre a época dos elementos e H0), `PARTIAL`, `SGP4_ERROR`, `RCS_USED`, `RCS_SOURCE` e, com radar, `MAX_MARGIN_DB`, `DETECTABLE_S`, `DET_START_PT`, `DET_END_PT`.

## 9. Radar (`radar.py`)

`RCS_MIN(R)` pela equação do radar, com a mesma fórmula e as mesmas constantes do app antigo. A margem de detecção `10·log10(RCS / RCS_MIN(R))` é calculada ao longo de toda a passagem, o que dá a margem máxima, o tempo detectável e o primeiro e o último ponto detectável.

O RCS vem da tabela que acompanha o pacote (`orbit_tools/data/rcs.csv`, a mesma do app antigo); sem ela, de um valor representativo da classe `RCS_SIZE` (LARGE 1 m², MEDIUM 0,1 m², SMALL 0,01 m²).

## 10. Comparação de órbitas (`compare.py`)

Para cada par de conjuntos sucessivos do mesmo objeto, propaga os dois a partir de 0,5 dia antes da época do anterior (80 amostras a cada 5 min) e mede a diferença de posição. É feita em TEME, sem local e sem EOP: a norma do erro é a mesma em qualquer referencial. As componentes são radial, ao longo e através da órbita (RIC, no referencial do conjunto mais novo), no lugar do X/Y/Z do ENU do sensor usado pelo app antigo. `TRACK = 1` quando o erro médio é menor que 3 km.

## 11. Arquivos (`formats.py`)

Formatos, cabeçalhos, casas decimais e nomes idênticos aos do app antigo, com H0 no nome (os sistemas de rastreio do CLBI e do CLA dependem disso). Linhas terminadas em `\n`, como no servidor Linux onde o app antigo roda.
