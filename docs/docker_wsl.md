## testar o docker no wsl / Windows

~~~
mkdir -p ~/orbit-tools-docker && cd ~/orbit-tools-docker
curl -fsSLo compose.yaml https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/deploy/compose.yaml
printf 'services:\n  orbit-tools:\n    restart: "no"\n' > compose.override.yaml   # não subir sozinho
docker compose up -d
~~~

Abra http://localhost:8010 no Windows


## caso desege configuraç~~oes fixas personalizadas

~~~
cd ~/orbit-tools-docker
mkdir -p config
curl -fsSLo config/locais.csv https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/config/locais.exemplo.csv
curl -fsSLo config/radares.csv https://raw.githubusercontent.com/francisvalguedes/orbit-tools/main/config/radares.exemplo.csv
~~~

## Ligar a pasta ao contêiner pelo override

~~~
cat > compose.override.yaml <<'EOF'
services:
  orbit-tools:
    restart: "no"
    volumes:
      - ./config:/config:ro
EOF
docker compose up -d      # recria o contêiner com a pasta
~~~

## Atualizar: Depois de um push na main, primeiro espere o GitHub terminar de construir a imagem

~~~
docker compose pull          # baixa a imagem nova da tag main
docker compose up -d         # recria o contêiner com ela
docker image prune -f        # opcional: apaga as imagens antigas
docker inspect --format '{{ index .Config.Labels "org.opencontainers.image.revision" }}' ghcr.io/francisvalguedes/orbit-tools:main
~~~

## Usar

~~~
cd ~/orbit-tools-docker
docker compose start     # sobe
docker compose stop      # para
~~~

ou docker desktop no windows