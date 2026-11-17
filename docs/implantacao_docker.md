# Implantação com Docker

Alternativa ao [serviço systemd](implantacao_systemd.md): o servidor baixa uma imagem pronta e a roda com o Docker Compose. Não precisa de Node, uv, Python nem do código-fonte, e funciona em processadores sem AVX: a imagem é construída pelo GitHub Actions.

O contêiner roda um processo uvicorn, que serve a API e o frontend, e escuta em `127.0.0.1:8010`; um proxy reverso (nginx) publica o app na rede.

Valores padrão deste guia e do [deploy/compose.yaml](../deploy/compose.yaml). Se usar outros, troque em todos os comandos:

| Item | Padrão |
|---|---|
| Imagem | `ghcr.io/francisvalguedes/orbit-tools:main` |
| Pasta da instalação | `/srv/orbit-tools` |
| Pasta de dados | `/srv/orbit-tools/dados`, do usuário UID `10001` (o do contêiner) |
| Locais e radares | `/srv/orbit-tools/config/` (opcional) |
| Configuração | `/srv/orbit-tools/.env` (opcional) |
| Porta | `127.0.0.1:8010` |

## Imagens publicadas

O workflow [docker.yml](../.github/workflows/docker.yml) publica uma imagem a cada push na `main` e a cada tag de versão:

| Tag | Conteúdo |
|---|---|
| `main` | Último commit da `main` (muda a cada push) |
| `vX.Y.Z` | Versão marcada (não muda) |
| `sha-<commit>` | Um commit específico, para fixar ou voltar |

## Requisitos de rede

- **Servidor:** acessa `ghcr.io` e `pkg-containers.githubusercontent.com` (imagem), e também `celestrak.org`, `www.space-track.org`, `datacenter.iers.org` e `maia.usno.navy.mil` (dados do app).
- **Navegadores:** acessam os mapas do globo (Esri e OpenStreetMap). Em rede isolada, troque as URLs em `frontend/src/globe/common.ts` e construa a imagem de novo.

## Instalação

### Docker

Instale o Docker Engine com o plugin Compose pelo [guia oficial para Debian](https://docs.docker.com/engine/install/debian/) e confira:

```bash
docker compose version
```

Com proxy, configure também o Docker (seção [Proxy](#proxy)) antes de baixar a imagem.

### Pasta da instalação

```bash
sudo mkdir -p /srv/orbit-tools/dados /srv/orbit-tools/config
sudo chown 10001:10001 /srv/orbit-tools/dados
cd /srv/orbit-tools
sudo curl -fsSLo compose.yaml https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/deploy/compose.yaml
```

A pasta `dados/` precisa pertencer ao UID 10001, o usuário fixo do contêiner. Não há usuário com esse nome no servidor, e não é preciso criar.

### Subir

```bash
cd /srv/orbit-tools
sudo docker compose up -d
sudo docker compose ps                          # STATUS: healthy depois de alguns segundos
curl -s http://127.0.0.1:8010/api/meta          # JSON com a versão
```

Com `restart: unless-stopped`, o contêiner volta sozinho depois de reiniciar o servidor.

### nginx

O mesmo bloco do guia do systemd, apontando para `127.0.0.1:8010`: ver [nginx](implantacao_systemd.md#nginx).

## Configuração

Variáveis no arquivo `.env` da pasta da instalação (modelo em [deploy/orbit-tools.env.example](../deploy/orbit-tools.env.example)):

```bash
cd /srv/orbit-tools
sudo curl -fsSLo .env https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/deploy/orbit-tools.env.example
sudo chmod 600 .env
sudo nano .env
sudo docker compose up -d                       # recria o contêiner com a configuração nova
```

| Variável | Uso |
|---|---|
| `IMAGE_TAG` | Tag da imagem (padrão `main`) |
| `HTTPS_PROXY`, `NO_PROXY` | Proxy para o app acessar Celestrak, Space-Track e IERS |
| `ORBIT_MAX_*` | Limites de busca, exportação e consultas (ver o modelo) |

`ORBIT_DATA_DIR`, `ORBIT_SITES_CSV` e `ORBIT_RADARS_CSV` são fixados pela imagem (`/data` e `/config/`): não defina no `.env`.

### Locais e radares

Por padrão, o app mostra locais e um radar fictícios. Os da instalação ficam em `config/`, no mesmo formato descrito em [config/README.md](../config/README.md), mas com os arquivos direto na pasta:

| Arquivo no servidor | Modelo |
|---|---|
| `/srv/orbit-tools/config/locais.csv` | [config/locais.exemplo.csv](../config/locais.exemplo.csv) |
| `/srv/orbit-tools/config/radares.csv` | [config/radares.exemplo.csv](../config/radares.exemplo.csv) |

```bash
cd /srv/orbit-tools
sudo curl -fsSLo config/locais.csv https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/config/locais.exemplo.csv
sudo nano config/locais.csv
sudo docker compose restart
```

O contêiner lê `config/` sem poder alterar, e lê os arquivos ao iniciar: depois de editar, reinicie.

### Proxy

São dois lugares, e os dois são necessários:

1. **Docker**, para baixar a imagem. Em `/etc/docker/daemon.json`:

   ```json
   {
     "proxies": {
       "http-proxy": "http://proxy.exemplo:3128",
       "https-proxy": "http://proxy.exemplo:3128",
       "no-proxy": "localhost,127.0.0.1"
     }
   }
   ```

   ```bash
   sudo systemctl restart docker
   ```

2. **App**, para acessar Celestrak, Space-Track e IERS: `HTTPS_PROXY` e `NO_PROXY` no `.env`.

Um proxy em `localhost` do servidor não é alcançável de dentro do contêiner: use o IP ou o nome do servidor de proxy.

## Atualização

```bash
cd /srv/orbit-tools
sudo docker compose pull
sudo docker compose up -d
sudo docker image prune -f                      # apaga as imagens antigas
```

A atualização não mexe em `dados/`, `config/` nem no `.env`. Se `deploy/compose.yaml` mudar no repositório, baixe de novo com o mesmo `curl` da instalação.

### Fixar ou voltar uma versão

No `.env`, `IMAGE_TAG=v0.2.0` (versão marcada) ou `IMAGE_TAG=sha-<commit completo>` (ver as tags em [Packages](https://github.com/francisvalguedes/orbit-tools/pkgs/container/orbit-tools)). Depois, `pull` e `up -d` como acima. Para voltar a seguir a `main`, `IMAGE_TAG=main`.

## Problemas comuns

Log: `sudo docker compose logs -f` (na pasta da instalação).

| Sintoma | Causa provável |
|---|---|
| `pull`: `denied` ou `unauthorized` | Pacote ainda privado no GitHub (ver [Publicação](#publicação-da-imagem-mantenedor)) |
| `pull`: tempo esgotado ou erro de certificado | Proxy não configurado no Docker (`daemon.json`) |
| "Celestrak indisponível" ou "Space-Track indisponível" | Proxy fora do `.env`, ou proxy em `localhost` |
| Erro 500, `PermissionError: ... '/data/cache'` no log | `dados/` de outro dono: `sudo chown -R 10001:10001 /srv/orbit-tools/dados` |
| `port is already allocated` | Porta 8010 em uso (por exemplo, o serviço systemd): troque em `compose.yaml` |
| `STATUS: unhealthy` | App sem responder: veja o log |
| Locais fictícios em vez dos da instalação | Arquivos fora de `config/` ou com outro nome; ou falta reiniciar |
| Selo da versão vermelho, erros 413, 504 ou progresso parado | nginx: mesmas causas do [guia do systemd](implantacao_systemd.md#problemas-comuns) |

## Publicação da imagem (mantenedor)

- Na primeira publicação, o pacote nasce **privado**. Uma vez: GitHub → perfil → **Packages** → `orbit-tools` → **Package settings** → **Change visibility** → **Public**. Sem isso, os servidores não conseguem baixar sem login.
- Versão marcada: crie e envie a tag (`git tag v0.2.0 && git push origin v0.2.0`); o workflow publica a imagem `v0.2.0`.
- Construir localmente, numa máquina com AVX: `docker build -t ghcr.io/francisvalguedes/orbit-tools:local .` na raiz do repositório, e `IMAGE_TAG=local` no `.env`.

## Dados

- Nada específico de uma instalação vai para o repositório nem para a imagem: locais reais em `config/`, o resto no `.env`.
- Space-Track: a senha não é gravada; os conjuntos ficam em `dados/sets` por até 7 dias, acessíveis só a quem tem o identificador do conjunto.
