# Implantação com systemd (Debian)

Um processo uvicorn roda como serviço systemd e serve a API e o frontend compilado. Ele escuta em `127.0.0.1`; um proxy reverso (nginx) publica o app na rede.

Valores padrão deste guia e do [deploy/orbit-tools.service](../deploy/orbit-tools.service). Se usar outros, troque em todos os comandos:

| Item | Padrão |
|---|---|
| Código | `/opt/orbit-tools` |
| Usuário de sistema | `mirante` |
| Pasta de dados | `/opt/orbit-tools/dados` |
| Configuração | `/etc/orbit-tools/orbit-tools.env` (opcional) |
| Serviço | `orbit-tools`, porta `127.0.0.1:8010` |

## Requisitos de rede

- **Servidor:** acessa `celestrak.org`, `www.space-track.org`, `datacenter.iers.org` e `maia.usno.navy.mil`; para instalar e atualizar, também `github.com`.
- **Navegadores:** acessam os mapas do globo (Esri e OpenStreetMap). Em rede isolada, troque as URLs em `frontend/src/globe/common.ts`.

## Instalação

### Código

```bash
sudo apt update && sudo apt install -y git curl
curl -LsSf https://astral.sh/uv/install.sh | sudo env UV_INSTALL_DIR=/usr/local/bin sh

sudo useradd --system --create-home --home-dir /var/lib/mirante --shell /usr/sbin/nologin mirante
sudo mkdir -p /opt/orbit-tools && sudo chown mirante: /opt/orbit-tools
sudo -u mirante git clone https://github.com/francisvalguedes/orbit-tools.git /opt/orbit-tools
sudo -u mirante mkdir -p /opt/orbit-tools/dados
```

A home fora de `/home` é necessária: o serviço usa `ProtectHome=true` e o Python instalado pelo uv fica nela.

### Frontend e Python

Escolha um jeito e use o mesmo nas atualizações.

**A. Frontend compilado pelo GitHub (recomendado).** A cada push na `main`, o GitHub Actions publica o frontend compilado no release `build-main`. O [scripts/install-release.sh](../scripts/install-release.sh) baixa esse frontend, confere o commit, atualiza o código e o ambiente Python. Não precisa de Node.

```bash
cd /opt/orbit-tools
sudo -H -u mirante ./scripts/install-release.sh build-main
```

Com proxy, preserve as variáveis no `sudo`:

```bash
sudo --preserve-env=HTTPS_PROXY,https_proxy,HTTP_PROXY,http_proxy,NO_PROXY,no_proxy \
  -H -u mirante ./scripts/install-release.sh build-main
```

**B. Compilar no servidor.** Precisa de Node 24 e de processador com AVX.

```bash
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt install -y nodejs
sudo -u mirante -H bash -c 'cd /opt/orbit-tools/frontend && npm ci && npm run build'
sudo -u mirante -H bash -c 'cd /opt/orbit-tools/backend && uv sync --frozen --no-dev --extra server'
```

### Serviço

```bash
sudo cp /opt/orbit-tools/deploy/orbit-tools.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now orbit-tools
curl -s http://127.0.0.1:8010/api/meta      # JSON com a versão
```

Com outro usuário ou pasta, troque ao copiar:

```bash
sed -e 's/mirante/<usuário>/g' -e 's#/opt/orbit-tools#<pasta>#g' deploy/orbit-tools.service \
  | sudo tee /etc/systemd/system/orbit-tools.service > /dev/null
```

- **Um processo só**, sem `--workers`: a manutenção e o limite do Space-Track ficam na memória do processo.
- **`ReadWritePaths`** é a única pasta gravável; deve ser a mesma do `ORBIT_DATA_DIR`.
- **Outra porta:** `sudo systemctl edit --full orbit-tools`.

### nginx

O app precisa de um `server` (uma porta) só dele, não de um subcaminho.

```nginx
server {
    listen 8081;
    server_name _;
    client_max_body_size 30m;               # arquivos de elementos enviados

    location / {
        proxy_pass http://127.0.0.1:8010;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;                # progresso em fluxo (NDJSON)
        proxy_read_timeout 300s;            # buscas e exportações longas
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

Sem nginx: use `--host 0.0.0.0` no `ExecStart` e acesse a porta 8010.

## Configuração

Variáveis em `/etc/orbit-tools/orbit-tools.env` (modelo em [deploy/orbit-tools.env.example](../deploy/orbit-tools.env.example)):

```bash
sudo install -d -m 755 /etc/orbit-tools
sudo install -m 600 /opt/orbit-tools/deploy/orbit-tools.env.example /etc/orbit-tools/orbit-tools.env
sudo nano /etc/orbit-tools/orbit-tools.env
sudo systemctl restart orbit-tools
```

| Variável | Uso |
|---|---|
| `HTTPS_PROXY`, `NO_PROXY` | Proxy. O serviço não lê o proxy do shell nem do `/etc/environment` |
| `ORBIT_DATA_DIR` | Pasta de dados (padrão: `dados/` no repositório) |
| `ORBIT_SITES_CSV`, `ORBIT_RADARS_CSV` | Locais e radares fora de `config/local/` |
| `ORBIT_MAX_*` | Limites de busca, exportação e consultas (ver o modelo) |

Comentários só em linhas próprias: no fim da linha, viram parte do valor.

### Locais e radares

Por padrão, o app mostra locais e um radar fictícios. Os da instalação ficam em `config/local/`, fora do git ([config/README.md](../config/README.md)):

```bash
cd /opt/orbit-tools
sudo -u mirante mkdir -p config/local
sudo -u mirante cp config/locais.exemplo.csv config/local/locais.csv
sudo -u mirante cp config/radares.exemplo.csv config/local/radares.csv
sudo -u mirante nano config/local/locais.csv
sudo systemctl restart orbit-tools
```

## Atualização

**A. Frontend do GitHub:**

```bash
cd /opt/orbit-tools
sudo -H -u mirante ./scripts/install-release.sh build-main     # com proxy: --preserve-env=... como na instalação
sudo systemctl restart orbit-tools
```

O script deixa o repositório fora de branch: não use `git pull`. Se ele disser que o frontend é de outro commit, aguarde o GitHub Actions terminar.

**B. Compilando no servidor:**

```bash
sudo -u mirante -H bash -c '
  cd /opt/orbit-tools && git pull &&
  cd frontend && npm ci && npm run build &&
  cd ../backend && uv sync --frozen --no-dev --extra server'
sudo systemctl restart orbit-tools
```

A atualização não mexe em `dados/`, `config/local/` nem no serviço instalado. Se `git log -- deploy/` mostrar mudança no serviço, copie de novo e rode `sudo systemctl daemon-reload`.

## Problemas comuns

Log: `sudo journalctl -u orbit-tools` (sem `sudo`, aparece vazio).

| Sintoma | Causa provável |
|---|---|
| `ModuleNotFoundError: fastapi` | `uv sync` sem `--extra server` |
| `vite build` com `Illegal instruction` | Processador sem AVX: use o jeito A |
| Script falha ao baixar do GitHub | Proxy sem `--preserve-env` no `sudo` |
| `git pull`: "You are not currently on a branch" | Instalação pelo script: atualize com o script |
| Erro 500, `Read-only file system` no log | Serviço instalado desatualizado ou `dados/` fora do `ReadWritePaths` |
| Erro 500, `PermissionError` no log | `dados/` de outro dono: `sudo chown -R mirante: /opt/orbit-tools/dados` |
| "Celestrak indisponível" ou "Space-Track indisponível" | Sem internet ou proxy fora do `orbit-tools.env` |
| Selo da versão vermelho | Serviço parado ou nginx sem o bloco do app |
| Progresso parado, resultado chega de uma vez | nginx sem `proxy_buffering off` |
| Erro 504 | `proxy_read_timeout` do nginx curto |
| Erro 413 do nginx | `client_max_body_size` menor que o arquivo |
| EOP "nenhum" em Passagens | Download do EOP com falha (ver log); erro de dezenas de metros |
| Globo cinza | Navegador sem acesso aos servidores de mapas |

## Dados

- Nada específico de uma instalação vai para o repositório: locais reais em `config/local/`, o resto em `/etc/orbit-tools/`.
- Space-Track: a senha não é gravada; os conjuntos ficam em `dados/sets` por até 7 dias, acessíveis só a quem tem o identificador do conjunto.
