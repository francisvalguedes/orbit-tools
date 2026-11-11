# Locais e radares da instalação

Os locais (rampas, sensores) e radares que **todos os usuários** do servidor veem ficam em `config/local/`, pasta que está no `.gitignore`: coordenadas e parâmetros reais nunca vão para o repositório público.

| Arquivo | Formato (mesmo dos apps antigos) |
|---|---|
| `config/local/locais.csv` | `confLocalWGS84.csv`: `name,lat,lon,height` (outras colunas, como `color`, são ignoradas) |
| `config/local/radares.csv` | `confRadar.csv`: `name,pt,gt,gr,lt,lr,fhz,sr,snr` e, opcional, `spt` (amostragem em s, padrão 0,01) |

Para começar, copie os modelos fictícios desta pasta e edite:

```bash
mkdir -p config/local
cp config/locais.exemplo.csv config/local/locais.csv
cp config/radares.exemplo.csv config/local/radares.csv
```

- Coordenadas em **WGS84** (o app usa só esse elipsoide): latitude e longitude em graus decimais (sul e oeste negativos); altura acima do elipsoide, em metros.
- Separador vírgula, ponto e vírgula ou tabulação; com ponto e vírgula, a vírgula decimal também vale. Nomes únicos.
- O servidor lê os arquivos ao iniciar: **depois de editar, reinicie** (`sudo systemctl restart orbit-tools` no servidor).
- Arquivo ausente: o app mostra os exemplos fictícios. Arquivo com erro: o app também usa os exemplos e mostra o erro (linha e motivo) num aviso na interface e no log.
- Para usar arquivos em outro lugar: variáveis `ORBIT_SITES_CSV` e `ORBIT_RADARS_CSV`.

Os locais e radares que cada usuário cadastra na interface ficam só no navegador dele.
