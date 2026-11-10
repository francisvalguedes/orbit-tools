# Dados de teste

Só dados públicos e locais fictícios.

| Arquivo | Origem |
|---|---|
| `elements_leo100.csv` | Celestrak, grupo `active` (10/11/2026): os 100 primeiros objetos com `MEAN_MOTION > 11.25` |
| `iss_2025-03-17.csv` | Celestrak (17/03/2025), copiado do app TrajectoryOrbitPropag |
| `iss_supgp_history.csv` | Celestrak, GP suplementar da ISS (10/11/2026): 6 dos 60 segmentos, para a comparação de órbitas |
| `finals2000A_2025-2026.all` | IERS, `finals2000A.all` (10/11/2026), recortado de 01/01/2025 a 31/12/2026 (medições até 05/11/2026, depois previsão) |
| `legacy/` | Referências geradas pelo código do app TrajectoryOrbitPropag com os arquivos acima; ver `tests/legacy/gen_orbit_refs.py` |

O local usado nas referências é fictício: latitude −10°, longitude −40°, altura 0 m.
