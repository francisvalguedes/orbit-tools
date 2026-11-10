# orbit-tools

> **English.** orbit-tools is an open source web application for satellite orbit propagation (SGP4), sensor pass prediction, generation of tracking trajectories for radars, and coordinate conversions (geodetic, ECEF, ENU, azimuth/elevation/range). It fetches orbital elements from Celestrak or Space-Track, finds passes over a user-defined sensor, helps select which objects to track, and exports trajectory files at the sensor's sampling rate. Backend in Python (FastAPI, numpy, sgp4), frontend in React. The interface and documentation are in Portuguese. MIT license.

Aplicação web de propagação de órbita, passagens sobre sensores, geração de trajetórias para rastreio e conversão de coordenadas. Unifica e substitui os apps [TrajectoryOrbitPropag](https://github.com/francisvalguedes/TrajectoryOrbitPropag) e [trajectory-coordinate-converter](https://github.com/francisvalguedes/trajectory-coordinate-converter).

**Estado:** em desenvolvimento. Ver o [planejamento](docs/planejamento.md).

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

O núcleo de cálculo (`orbit_tools.core`) depende só de `numpy` e `sgp4` e pode ser usado em scripts sem a parte web.

## Licença

[MIT](LICENSE).
