# Implantação (Debian, systemd)

Em produção roda um único processo (uvicorn), como serviço systemd, que serve a API e o frontend compilado. Mesmo modelo do trajetory-analysis, que pode rodar no mesmo servidor.

| Caminho ou nome | Valor |
|---|---|
| Código | `/opt/apps/orbit-tools` |
| Usuário de sistema | `trajetoria` (home `/var/lib/trajetoria`: Python instalado pelo uv e caches do npm) |
| Pasta de dados | `/opt/apps/orbit-tools/dados` (caches, conjuntos de elementos, ZIPs gerados; fora do git) |
| Configuração da instalação | `/etc/orbit-tools/orbit-tools.env` (opcional) |
| Serviço | `orbit-tools` |
| Porta | **8010** |

Portas dos outros apps no mesmo servidor: 8000 (trajetory-analysis), 8080 (TrajectoryOrbitPropag) e 8501 (trajectory-coordinate-converter). Os apps antigos podem continuar no ar durante a transição.

## Requisitos de rede

- **O servidor** acessa a internet para buscar elementos e dados auxiliares: `celestrak.org` (elementos, SATCAT, alternativa de EOP), `www.space-track.org` (quando o usuário usa a conta dele), `datacenter.iers.org` e `maia.usno.navy.mil` (EOP). Com proxy, configure `HTTPS_PROXY` (seção Configuração). Sem acesso, os módulos de Conversões, Passagens e Órbita continuam funcionando com elementos enviados por arquivo; sem EOP, a conversão TEME→ITRS fica com erro de 20 a 40 m (ver [calculo.md](calculo.md)).
- **Os navegadores** dos usuários acessam os mapas base do globo (Esri e OpenStreetMap). Em rede isolada, aponte as URLs em `frontend/src/globe/common.ts` para um servidor de tiles local.

## Instalação

```bash
# pacotes e uv (gerenciador Python; baixa e fixa o Python 3.12 do projeto)
sudo apt update && sudo apt install -y git curl
curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin sh

# Node 24, só para compilar o frontend (opcional: compile em outra máquina e copie frontend/dist, ver abaixo)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs

# usuário de sistema e código
# se ainda não existir (pode ser o mesmo usuário de outros apps do servidor)
sudo useradd --system --create-home --home-dir /var/lib/trajetoria --shell /usr/sbin/nologin trajetoria
sudo mkdir -p /opt/apps/orbit-tools
sudo chown trajetoria: /opt/apps/orbit-tools
sudo -u trajetoria git clone https://github.com/francisvalguedes/orbit-tools.git /opt/apps/orbit-tools

# build do frontend e ambiente Python de produção (com o extra "server" e sem as dependências de desenvolvimento)
sudo -u trajetoria -H bash -c 'cd /opt/apps/orbit-tools/frontend && npm ci && npm run build'
sudo -u trajetoria -H bash -c 'cd /opt/apps/orbit-tools/backend && uv sync --frozen --no-dev --extra server'

# pasta de dados; precisa existir antes de o serviço iniciar
sudo -u trajetoria mkdir -p /opt/apps/orbit-tools/dados
```

O `--extra server` é obrigatório: as dependências web (FastAPI, uvicorn, httpx2) ficam num extra para o núcleo de cálculo poder ser instalado sozinho como biblioteca. Sem ele, o serviço não inicia (`ModuleNotFoundError: fastapi`).

O usuário `trajetoria` tem shell `nologin`: para rodar comandos como ele, use `sudo -u trajetoria -H bash -c '...'` (ou `sudo -u trajetoria -H bash` para uma sessão), não `sudo -iu trajetoria`.

### Teste

Antes de criar o serviço, suba o app à mão e confira no navegador (Ctrl+C para parar). Se o serviço já existir, pare-o antes (`sudo systemctl stop orbit-tools`), porque os dois usam a porta 8010:

```bash
sudo -u trajetoria -H bash -c 'cd /opt/apps/orbit-tools/backend && .venv/bin/uvicorn orbit_tools.api.main:app --host 0.0.0.0 --port 8010'
```

Acesse `http://<servidor>:8010`. O selo de versão no canto superior direito fica verde quando a interface fala com o backend. Nos primeiros segundos o servidor baixa o SATCAT (~7 MB) e o arquivo EOP (~3 MB, pode levar 30 s ou mais) para a pasta de dados.

### Serviço systemd

O arquivo do serviço está no repositório ([deploy/orbit-tools.service](../deploy/orbit-tools.service)):

```bash
sudo cp /opt/apps/orbit-tools/deploy/orbit-tools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now orbit-tools
systemctl status orbit-tools          # estado
journalctl -u orbit-tools -f          # logs
sudo ufw allow 8010/tcp               # se o ufw estiver ativo
```

Pontos do serviço:

- **Um processo só** (sem `--workers`): a manutenção em segundo plano (renovar EOP e SATCAT, apagar caches vencidos) e o limite de consultas ao Space-Track ficam na memória do processo. Com vários processos, cada um baixaria os mesmos arquivos e o limite deixaria de valer. As requisições já rodam em paralelo nas threads do uvicorn.
- **`ProtectSystem=strict`** deixa o sistema de arquivos somente leitura para o serviço; o **`ReadWritePaths`** libera só a pasta de dados. Sem ele, a busca no Celestrak falha com *500 Internal Server Error* (o log mostra um erro ao gravar em `dados/cache`). Se mudar `ORBIT_DATA_DIR`, use o mesmo caminho nos dois lugares, e a pasta deve existir antes de o serviço iniciar.
- **Outra porta:** `sudo systemctl edit --full orbit-tools`, troque `--port 8010` no `ExecStart` e reinicie.

## Configuração

Variáveis de ambiente no arquivo `/etc/orbit-tools/orbit-tools.env`, lido pelo serviço (modelo comentado em [deploy/orbit-tools.env.example](../deploy/orbit-tools.env.example)). Fica fora do repositório e legível só pelo root, porque a URL do proxy pode ter senha:

```bash
sudo install -d -m 755 /etc/orbit-tools
sudo install -m 600 /opt/apps/orbit-tools/deploy/orbit-tools.env.example /etc/orbit-tools/orbit-tools.env
sudo nano /etc/orbit-tools/orbit-tools.env
sudo systemctl restart orbit-tools
```

No systemd, um comentário no fim de uma linha vira parte do valor: deixe os comentários em linhas próprias.

| Variável | Uso |
|---|---|
| `ORBIT_SITES_CSV`, `ORBIT_RADARS_CSV` | Só para guardar os locais e radares da instalação fora de `config/local/` (abaixo) |
| `HTTPS_PROXY`, `NO_PROXY` | Proxy para Celestrak, Space-Track e IERS |
| `ORBIT_DATA_DIR` | Pasta de dados (padrão `/opt/apps/orbit-tools/dados`) |
| `ORBIT_MAX_SEARCH_DAYS` | Janela máxima da busca de passagens, em dias (padrão 10) |
| `ORBIT_MAX_OBJECT_DAYS` | Custo máximo da busca, objetos × dias (padrão 60 000, ~1 min) |
| `ORBIT_MAX_EXPORT_POINTS` | Pontos por ZIP de trajetórias (padrão 30 milhões, ~1 min) |
| `ORBIT_MAX_ELEMENTS`, `ORBIT_MAX_SPACETRACK_IDS`, `ORBIT_MAX_CELESTRAK_IDS` | Tamanho das consultas de elementos |

### Locais e radares da instalação

Por padrão, todos os usuários veem dois locais e um radar fictícios. Os reais (rampas, sensores, radares) ficam em `config/local/locais.csv` e `config/local/radares.csv`, no formato do `confLocalWGS84.csv` e do `confRadar.csv` dos apps antigos. A pasta `config/local/` está no `.gitignore` e o `git pull` não mexe nela. Detalhes do formato em [config/README.md](../config/README.md).

```bash
cd /opt/apps/orbit-tools
sudo -u trajetoria mkdir -p config/local
sudo -u trajetoria cp config/locais.exemplo.csv config/local/locais.csv     # ou copie o seu confLocalWGS84.csv
sudo -u trajetoria cp config/radares.exemplo.csv config/local/radares.csv   # ou o seu confRadar.csv
sudo -u trajetoria nano config/local/locais.csv
sudo systemctl restart orbit-tools
```

O servidor lê os arquivos ao iniciar: reinicie depois de editar. Se um arquivo tiver erro, o app usa os exemplos e mostra o erro (linha e motivo) num aviso na interface e no log (`journalctl -u orbit-tools`). Os locais e radares que cada usuário cadastra na interface ficam só no navegador dele.

## Atualização

```bash
sudo -u trajetoria -H bash -c '
  cd /opt/apps/orbit-tools && git pull &&
  cd frontend && npm ci && npm run build &&
  cd ../backend && uv sync --frozen --no-dev --extra server'
sudo systemctl restart orbit-tools
```

O `git pull` não mexe na pasta `dados/` (fora do git). O backend envia o `index.html` com `Cache-Control: no-cache`, então o navegador carrega a versão nova sozinho; se a interface parecer não ter mudado, recarregue com **Ctrl+Shift+R**.

Se o arquivo do serviço mudar no repositório (confira com `git log -- deploy/`), copie de novo e recarregue:

```bash
sudo cp /opt/apps/orbit-tools/deploy/orbit-tools.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl restart orbit-tools
```

## Frontend compilado em outra máquina (sem Node no servidor)

O `frontend/dist` não depende do sistema operacional: pode ser compilado no Windows e instalado no Debian.

Na máquina de desenvolvimento:

```powershell
cd frontend
npm run build
tar -czf dist.tar.gz -C dist .
```

Copie o `dist.tar.gz` para `/opt/apps/orbit-tools/frontend/` no servidor (o `*.tar.gz` está no `.gitignore`) e, no servidor:

```bash
cd /opt/apps/orbit-tools
sudo -u trajetoria git pull
sudo -u trajetoria -H bash -c 'cd backend && uv sync --frozen --no-dev --extra server'

cd frontend
sudo rm -rf dist
sudo mkdir dist
sudo tar -xzf dist.tar.gz -C dist --no-same-owner
sudo chown -R trajetoria: dist
sudo systemctl restart orbit-tools
```

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Serviço não inicia, `ModuleNotFoundError: fastapi` no log | `uv sync` sem `--extra server` |
| Selo da versão vermelho ("Backend indisponível") | Serviço parado ou porta bloqueada no firewall |
| Busca no Celestrak com erro 500 | Pasta de dados ausente ou fora do `ReadWritePaths` |
| "Celestrak indisponível" ou "Space-Track indisponível" | Servidor sem internet ou proxy não configurado |
| EOP "nenhum (UT1 = UTC…)" no módulo Passagens | Download do EOP ainda não terminou ou falhou (`journalctl -u orbit-tools`); o cálculo segue, com erro de dezenas de metros |
| Globo cinza, sem mapa | O navegador do usuário não acessa os servidores de tiles |
| Busca de passagens grande demais (erro 413) | Limite `ORBIT_MAX_OBJECT_DAYS`; reduza a janela ou o número de objetos, ou aumente o limite |

## Uso no CLBI e no CLA

- **Dados restritos:** nada específico das instalações vai para o repositório. As coordenadas reais ficam em `config/local/` (no `.gitignore`).
- **Space-Track:** a senha do usuário vai só na consulta e não é gravada. Os conjuntos obtidos ficam em `dados/sets` por até 7 dias, acessíveis só a quem tem o conjunto, porque o acordo de uso do Space-Track proíbe redistribuir os dados.
- **Transição:** com os apps antigos nas portas 8080 e 8501, compare os resultados e os arquivos `.trn` gerados antes de desligá-los.
