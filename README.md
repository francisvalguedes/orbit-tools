# orbit-tools

> **English.** orbit-tools is an open source web application for satellite orbit propagation (SGP4), sensor pass prediction, generation of tracking trajectories for radars, and coordinate conversions (geodetic, ECEF, ENU, azimuth/elevation/range). It fetches orbital elements from Celestrak or Space-Track, finds passes over a user-defined sensor, helps select which objects to track, and exports trajectory files at the sensor's sampling rate. Backend in Python (FastAPI, numpy, sgp4), frontend in React. The interface and documentation are in Portuguese. MIT license.

Aplicação web de propagação de órbita, passagens sobre sensores, geração de trajetórias para rastreio e conversão de coordenadas. Unifica e substitui os apps [TrajectoryOrbitPropag](https://github.com/francisvalguedes/TrajectoryOrbitPropag) e [trajectory-coordinate-converter](https://github.com/francisvalguedes/trajectory-coordinate-converter).

**Estado:** os quatro módulos funcionam; falta a distribuição (Docker) e o uso em paralelo com os apps antigos. Ver o [planejamento](docs/planejamento.md) e o [cálculo](docs/calculo.md).

## Módulos

| Módulo | Função |
|---|---|
| Elementos | Elementos orbitais do Celestrak, do Space-Track ou de arquivo (OMM, TLE); comparação entre conjuntos sucessivos |
| Passagens | Busca de passagens sobre um sensor, seleção dos objetos e geração de trajetórias (`.trn`, `.trj`, CSV) na taxa do sensor |
| Órbita | Efemérides de um objeto em qualquer intervalo, órbita 3D e traço no solo |
| Conversões | Geodésicas, ECEF, ENU, azimute/elevação/distância, graus/minutos/segundos, velocidade e aceleração |

## Desenvolvimento

Requer [uv](https://docs.astral.sh/uv/) e Node.js 22 ou mais novo.

```bash
# backend (na pasta backend/)
uv sync
uv run orbit-tools        # http://127.0.0.1:8000, documentação da API em /docs

# frontend (na pasta frontend/), em outro terminal
npm ci
npm run dev               # http://localhost:5173
```

## Uso como biblioteca

O núcleo de cálculo (`orbit_tools.core`) depende só de `numpy` e `sgp4` e pode ser usado em scripts sem a parte web. Exemplo: passagens de um dia sobre um sensor.

```python
import numpy as np
from orbit_tools.core import elements, passes
from orbit_tools.core.eop import EOP
from orbit_tools.core.geodesy import GeodeticPoint

recs = elements.parse(open("elementos.csv", "rb").read(), "elementos.csv")  # OMM (CSV, JSON, XML) ou TLE
sensor = GeodeticPoint(lat=-10.0, lon=-40.0, height=0.0)
params = passes.SearchParams(
    start=np.datetime64("2026-11-11T00:00:00"),
    end=np.datetime64("2026-11-12T00:00:00"),
    d_max_m=1100e3,
    d_min_m=1000e3,
)
for p in passes.search(recs, sensor, params, EOP.zero()):
    print(p.norad, p.h0, f"{p.min_range_m / 1000:.1f} km", f"{p.max_el_deg:.1f}°")
```

`EOP.zero()` dispensa o arquivo de orientação da Terra (erro de 20 a 40 m num LEO); com `eop.parse_finals2000a(texto)` sobre o `finals2000A.all` do IERS, o resultado coincide com o astropy a 2 cm. Modelos, validação e diferenças em relação aos apps antigos: [docs/calculo.md](docs/calculo.md).

## Licença

[MIT](LICENSE).
