# Implantação com Docker

Alternativa ao [serviço systemd](implantacao_systemd.md): o servidor baixa uma imagem pronta e a roda com o Docker. Não precisa de Node, uv, Python nem do código-fonte, e funciona em processadores sem AVX: a imagem é construída pelo GitHub Actions.

O contêiner roda um processo uvicorn, que serve a API e o frontend, e escuta em `127.0.0.1:8010`; um proxy reverso (nginx) publica o app na rede.

Valores padrão deste guia e do [deploy/compose.yaml](../deploy/compose.yaml):

| Item | Padrão |
|---|---|
| Imagem | `ghcr.io/francisvalguedes/orbit-tools:main` |
| Pasta da instalação | `/srv/orbit-tools` (só o `compose.yaml` e, opcionais, `.env` e `config/`) |
| Dados | Volume do Docker `orbit-tools_dados` |
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

Instale o Docker Engine com o plugin Compose pelo [guia oficial para Debian](https://docs.docker.com/engine/install/debian/) e confira com `docker compose version`. Com proxy, configure também o Docker (seção [Proxy](#proxy)) antes de baixar a imagem.

```bash
sudo mkdir -p /srv/orbit-tools && cd /srv/orbit-tools
sudo curl -fsSLo compose.yaml https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/deploy/compose.yaml
sudo docker compose up -d
sudo docker compose ps                          # STATUS: healthy depois de alguns segundos
curl -s http://127.0.0.1:8010/api/meta          # JSON com a versão
```

Os dados ficam no volume `orbit-tools_dados`, criado na primeira subida e mantido nas atualizações. Com `restart: unless-stopped`, o contêiner volta sozinho depois de reiniciar o servidor.

Depois, o nginx: o mesmo bloco do guia do systemd, apontando para `127.0.0.1:8010` (ver [nginx](implantacao_systemd.md#nginx)).

### Sem o compose.yaml (um comando)

O mesmo resultado, sem arquivo nenhum no servidor:

```bash
sudo docker run -d --name orbit-tools --restart unless-stopped \
  -p 127.0.0.1:8010:8000 -v orbit-tools_dados:/data \
  ghcr.io/francisvalguedes/orbit-tools:main
```

Com configuração, acrescente `--env-file /srv/orbit-tools/.env` e, para locais e radares, `-v /srv/orbit-tools/config:/config:ro`. Para atualizar, baixe a imagem e recrie o contêiner (o volume continua):

```bash
sudo docker pull ghcr.io/francisvalguedes/orbit-tools:main
sudo docker rm -f orbit-tools
sudo docker run -d ...                          # o mesmo comando da instalação
```

O resto deste guia usa o Compose, que guarda essas opções no `compose.yaml`. Os dois jeitos usam o mesmo volume: dá para trocar de um para o outro sem perder os dados.

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

`ORBIT_DATA_DIR`, `ORBIT_SITES_CSV` e `ORBIT_RADARS_CSV` são fixados pela imagem: não defina no `.env`.

### Locais e radares

Sem configuração, o app mostra locais e um radar fictícios, e cada usuário pode cadastrar os seus no navegador. Para oferecer os da instalação a todos, crie a pasta `config/` com os arquivos no formato de [config/README.md](../config/README.md):

| Arquivo no servidor | Modelo |
|---|---|
| `/srv/orbit-tools/config/locais.csv` | [config/locais.exemplo.csv](../config/locais.exemplo.csv) |
| `/srv/orbit-tools/config/radares.csv` | [config/radares.exemplo.csv](../config/radares.exemplo.csv) |

```bash
cd /srv/orbit-tools
sudo mkdir -p config
sudo curl -fsSLo config/locais.csv https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/config/locais.exemplo.csv
sudo nano config/locais.csv
```

No `compose.yaml`, descomente a linha `- ./config:/config:ro` e recrie o contêiner com `sudo docker compose up -d`. O app lê os arquivos ao iniciar: depois de editá-los, `sudo docker compose restart`.

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

A atualização mantém o volume de dados, o `.env` e o `config/`. Se `deploy/compose.yaml` mudar no repositório, baixe de novo com o mesmo `curl` da instalação (e descomente o `config/` de novo, se usar).

### Fixar ou voltar uma versão

No `.env`, `IMAGE_TAG=v0.2.0` (versão marcada) ou `IMAGE_TAG=sha-<commit completo>` (ver as tags em [Packages](https://github.com/francisvalguedes/orbit-tools/pkgs/container/orbit-tools)). Depois, `pull` e `up -d` como acima. Para voltar a seguir a `main`, `IMAGE_TAG=main`.

## Dados

O volume guarda só o que o app refaz sozinho: caches do Celestrak e do SATCAT, o arquivo de orientação da Terra (EOP), conjuntos de elementos (o navegador reenvia quando faltam) e os ZIPs gerados. Apagar o volume não perde nada do usuário; o app só baixa de novo o que precisa.

```bash
sudo docker compose exec orbit-tools ls -R /data   # ver o conteúdo (com o contêiner rodando)
sudo docker compose down -v                         # remove o contêiner e apaga o volume
```

- Nada específico de uma instalação vai para o repositório nem para a imagem: locais reais em `config/`, o resto no `.env`.
- Space-Track: a senha não é gravada; os conjuntos ficam no volume por até 7 dias, acessíveis só a quem tem o identificador do conjunto.

## Problemas comuns

Log: `sudo docker compose logs -f` (na pasta da instalação) ou `sudo docker logs -f orbit-tools` (sem Compose).

| Sintoma | Causa provável |
|---|---|
| `pull`: `denied` ou `unauthorized` | Pacote ainda privado no GitHub (ver [Publicação](#publicação-da-imagem-mantenedor)) |
| `pull`: tempo esgotado ou erro de certificado | Proxy não configurado no Docker (`daemon.json`) |
| "Celestrak indisponível" ou "Space-Track indisponível" | Proxy fora do `.env`, ou proxy em `localhost` |
| `port is already allocated` | Porta 8010 em uso (por exemplo, o serviço systemd): troque em `compose.yaml` |
| `STATUS: unhealthy` | App sem responder: veja o log |
| Locais fictícios em vez dos da instalação | Linha do `config/` comentada no `compose.yaml`, arquivos com outro nome, ou falta reiniciar |
| Erro 500, `PermissionError: ... '/data'` no log | `/data` montado de uma pasta do servidor (e não do volume) com outro dono: `sudo chown -R 10001:10001 <pasta>` |
| Selo da versão vermelho, erros 413, 504 ou progresso parado | nginx: mesmas causas do [guia do systemd](implantacao_systemd.md#problemas-comuns) |

## Publicação da imagem (mantenedor)

- Na primeira publicação, o pacote nasce **privado**. Uma vez: GitHub → perfil → **Packages** → `orbit-tools` → **Package settings** → **Change visibility** → **Public**. Sem isso, os servidores não conseguem baixar sem login.
- Versão marcada: crie e envie a tag (`git tag v0.2.0 && git push origin v0.2.0`); o workflow publica a imagem `v0.2.0`.
- Construir localmente, numa máquina com AVX: `docker build -t ghcr.io/francisvalguedes/orbit-tools:local .` na raiz do repositório, e `IMAGE_TAG=local` no `.env`.
