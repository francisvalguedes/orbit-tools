# Implantação (Debian, systemd)

Em produção roda um único processo (uvicorn), como serviço systemd, que serve a API e o frontend compilado. O uvicorn escuta só na própria máquina (`127.0.0.1`) e um proxy reverso (nginx) publica o app na rede; dá para dispensar o nginx e escutar direto na rede (seção [Sem nginx](#sem-nginx)).

Os nomes e caminhos abaixo são os **padrões** deste guia e do arquivo do serviço; numa instalação com outros, troque-os em todos os comandos e no serviço:

| Item | Padrão |
|---|---|
| Código | `/opt/apps/orbit-tools` |
| Usuário de sistema | `trajetoria` (home `/var/lib/trajetoria`: Python instalado pelo uv e caches do npm) |
| Pasta de dados | `/opt/apps/orbit-tools/dados` (caches, conjuntos de elementos, ZIPs gerados; fora do git) |
| Configuração da instalação | `/etc/orbit-tools/orbit-tools.env` (opcional) |
| Serviço | `orbit-tools` |
| Porta interna | `127.0.0.1:8010` |

O usuário `trajetoria` pode ser o mesmo de outros apps do servidor; se já existir, pule a criação dele.

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

# usuário de sistema (pule se já existir) e código
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

Usuários de sistema com shell `nologin`: para rodar comandos como eles, use `sudo -u trajetoria -H bash -c '...'` (ou `sudo -u trajetoria -H bash` para uma sessão), não `sudo -iu trajetoria`.

### Teste

Antes de criar o serviço, suba o app à mão (Ctrl+C para parar). Se o serviço já existir, pare-o antes (`sudo systemctl stop orbit-tools`), porque os dois usam a mesma porta:

```bash
sudo -u trajetoria -H bash -c 'cd /opt/apps/orbit-tools/backend && .venv/bin/uvicorn orbit_tools.api.main:app --host 127.0.0.1 --port 8010'
# em outro terminal, no servidor:
curl -s http://127.0.0.1:8010/api/meta
```

A resposta é um JSON com a versão. Nos primeiros segundos o servidor baixa o SATCAT (~7 MB) e o arquivo EOP (~3 MB, pode levar 30 s ou mais) para a pasta de dados. Para abrir no navegador de outra máquina antes do nginx, use `--host 0.0.0.0` só neste teste e acesse `http://<servidor>:8010`.

### Serviço systemd

O arquivo do serviço está no repositório ([deploy/orbit-tools.service](../deploy/orbit-tools.service)), com os valores padrão deste guia. Com outros nomes, troque-os ao copiar:

```bash
# valores padrão: copie direto
sudo cp /opt/apps/orbit-tools/deploy/orbit-tools.service /etc/systemd/system/

# outro usuário ou outra pasta: troque ao copiar (ex.: usuário apps, pasta /srv/orbit-tools)
sed -e 's/trajetoria/apps/g' -e 's#/opt/apps/orbit-tools#/srv/orbit-tools#g' /srv/orbit-tools/deploy/orbit-tools.service \
  | sudo tee /etc/systemd/system/orbit-tools.service > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now orbit-tools
systemctl status orbit-tools          # estado
journalctl -u orbit-tools -f          # logs
```

Pontos do serviço:

- **Um processo só** (sem `--workers`): a manutenção em segundo plano (renovar EOP e SATCAT, apagar caches vencidos) e o limite de consultas ao Space-Track ficam na memória do processo. Com vários processos, cada um baixaria os mesmos arquivos e o limite deixaria de valer. As requisições já rodam em paralelo nas threads do uvicorn.
- **`ProtectSystem=strict`** deixa o sistema de arquivos somente leitura para o serviço; o **`ReadWritePaths`** libera só a pasta de dados. Sem ele, a busca de elementos (Celestrak ou Space-Track) falha com *500 Internal Server Error* e o log mostra `Read-only file system` ao gravar em `dados/cache` ou `dados/sets`. Se mudar `ORBIT_DATA_DIR`, use o mesmo caminho nos dois lugares, e a pasta deve existir antes de o serviço iniciar.
- **Outra porta:** `sudo systemctl edit --full orbit-tools`, troque `--port 8010` no `ExecStart` e reinicie. Escolha uma porta que nenhum outro app do servidor use.

### nginx

O app usa caminhos a partir da raiz (`/api`, `/assets`, `/cesium`), então precisa de um `server` (uma porta) só dele no nginx, não de um subcaminho como `/orbit-tools/`. Exemplo, publicando na porta 8081:

```nginx
server {
    listen 8081;
    server_name _;

    # Arquivos de elementos enviados (OMM, TLE): até 30 MB no app
    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:8010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Busca de passagens, comparação e geração de ZIP respondem em fluxo (NDJSON) com o progresso:
        # sem buffering, para o progresso chegar ao navegador na hora
        proxy_buffering off;
        # Buscas e exportações grandes passam de 1 min (limites ORBIT_MAX_OBJECT_DAYS e ORBIT_MAX_EXPORT_POINTS)
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 8081/tcp               # se o ufw estiver ativo
```

Acesse `http://<servidor>:8081`. O selo de versão no canto superior direito fica verde quando a interface fala com o backend.

### Sem nginx

Para servir direto na rede, troque `--host 127.0.0.1` por `--host 0.0.0.0` no `ExecStart` (`sudo systemctl edit --full orbit-tools`), libere a porta do app no firewall e acesse `http://<servidor>:8010`. O uvicorn não tem os limites de tamanho e de tempo do nginx: os do próprio app continuam valendo.

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
| `ORBIT_DATA_DIR` | Pasta de dados (padrão: `dados/` na raiz do repositório) |
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

Há dois jeitos de atualizar. Use sempre o mesmo numa instalação, porque eles deixam o repositório em estados diferentes.

**Com o frontend compilado pelo GitHub (sem Node no servidor).** O [scripts/install-release.sh](../scripts/install-release.sh) baixa o código e o `dist.tar.gz` compilado pelo GitHub Actions, confere se os dois são do mesmo commit, troca o código e roda o `uv sync`:

```bash
cd /opt/apps/orbit-tools
sudo -H -u trajetoria ./scripts/install-release.sh build-main   # último commit da main
sudo -H -u trajetoria ./scripts/install-release.sh v0.2.0       # ou uma versão publicada
sudo systemctl restart orbit-tools
```

O script deixa o repositório fora de qualquer branch (*detached HEAD*, `git status` mostra `HEAD detached at ...`). Por isso, nessa instalação, o `git pull` falha com "You are not currently on a branch": atualize sempre rodando o script de novo. Se ele avisar que o frontend é de outro commit, o build do GitHub Actions ainda está rodando; tente de novo em alguns minutos.

Se o servidor estiver num commit que ainda não tem o script, ou para voltar a atualizar com `git pull`, volte para a branch antes:

```bash
sudo -u trajetoria git -C /opt/apps/orbit-tools switch main
sudo -u trajetoria git -C /opt/apps/orbit-tools pull
```

**Compilando no servidor (com Node).**

```bash
sudo -u trajetoria -H bash -c '
  cd /opt/apps/orbit-tools && git pull &&
  cd frontend && npm ci && npm run build &&
  cd ../backend && uv sync --frozen --no-dev --extra server'
sudo systemctl restart orbit-tools
```

Nenhum dos dois mexe na pasta `dados/` nem em `config/local/` (fora do git). O backend envia o `index.html` com `Cache-Control: no-cache`, então o navegador carrega a versão nova sozinho; se a interface parecer não ter mudado, recarregue com **Ctrl+Shift+R**.

A atualização não muda o serviço instalado em `/etc/systemd/system/`. Se o arquivo do serviço mudar no repositório (confira com `git log -- deploy/` ou `diff /etc/systemd/system/orbit-tools.service deploy/orbit-tools.service`), copie de novo como na instalação (com o mesmo `sed`, se usou outros nomes) e recarregue com `sudo systemctl daemon-reload && sudo systemctl restart orbit-tools`.

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
| Selo da versão vermelho ("Backend indisponível") | Serviço parado, nginx sem o bloco do app ou porta bloqueada no firewall |
| Barra de progresso parada e o resultado chega todo de uma vez | nginx sem `proxy_buffering off` |
| Busca ou geração de ZIP grande termina com erro 504 | `proxy_read_timeout` do nginx menor que o tempo do cálculo |
| Envio de arquivo de elementos com erro 413 | `client_max_body_size` do nginx menor que o arquivo |
| Busca de elementos (Celestrak ou Space-Track) com erro 500, `Read-only file system` no log | Pasta de dados fora do `ReadWritePaths` do serviço; o serviço instalado pode ser de uma versão antiga: compare com `deploy/orbit-tools.service` e copie de novo |
| Busca de elementos com erro 500, `PermissionError` no log | Pasta de dados ou subpasta de outro dono: `sudo chown -R trajetoria: /opt/apps/orbit-tools/dados` |
| `git pull` falha com "You are not currently on a branch" | Instalação feita com o `install-release.sh`, que deixa o repositório fora de branch; atualize rodando o script (seção Atualização) |
| Proxy configurado no shell, mas o serviço não acessa a internet | O systemd não lê o `/etc/environment` nem o `.bashrc`; ponha `HTTPS_PROXY` em `/etc/orbit-tools/orbit-tools.env` |
| `journalctl -u orbit-tools` sem nenhuma linha | Falta `sudo`: só os grupos `adm` e `systemd-journal` veem o log do serviço |
| "Celestrak indisponível" ou "Space-Track indisponível" | Servidor sem internet ou proxy não configurado |
| EOP "nenhum (UT1 = UTC…)" no módulo Passagens | Download do EOP ainda não terminou ou falhou (`journalctl -u orbit-tools`); o cálculo segue, com erro de dezenas de metros |
| Globo cinza, sem mapa | O navegador do usuário não acessa os servidores de tiles |
| Busca de passagens grande demais (erro 413 do app) | Limite `ORBIT_MAX_OBJECT_DAYS`; reduza a janela ou o número de objetos, ou aumente o limite |

## Cuidados na operação

- **Dados restritos:** nada específico de uma instalação vai para o repositório. As coordenadas reais ficam em `config/local/` (no `.gitignore`); os detalhes de cada servidor (usuários, pastas, portas, proxy) ficam fora deste repositório público.
- **Space-Track:** a senha do usuário vai só na consulta e não é gravada. Os conjuntos obtidos ficam em `dados/sets` por até 7 dias, acessíveis só a quem tem o conjunto, porque o acordo de uso do Space-Track proíbe redistribuir os dados.
- **Transição:** com os apps antigos ainda no ar, compare os resultados e os arquivos `.trn` gerados antes de desligá-los.

## Comandos úteis

Envia a develop direto para a main do GitHub
´´´
git push origin develop:main

´´´
