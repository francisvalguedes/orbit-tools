#!/usr/bin/env bash
# Instala uma versão no servidor (ver docs/frontend.md): código da tag, ambiente Python e o frontend compilado
# baixado do GitHub Release da mesma tag. Não compila nada, então serve para servidores sem Node ou sem AVX.
#
# Rodar como o dono do repositório no servidor e depois reiniciar o serviço:
#   sudo -H -u <usuário> /caminho/do/repositorio/scripts/install-release.sh v0.2.0
#   sudo systemctl restart orbit-tools
#
# Com o arquivo já baixado (servidor sem acesso ao GitHub), passe o caminho do dist.tar.gz em segundo argumento.

# Tudo dentro de main: o git checkout troca este arquivo enquanto ele roda, e o bash lê scripts aos poucos.
main() {
  set -euo pipefail
  local tag=${1:?uso: $0 vX.Y.Z [dist.tar.gz]}
  local local_dist=${2:-}
  [ -z "$local_dist" ] || local_dist=$(realpath "$local_dist")

  local root
  root=$(cd "$(dirname "$0")/.." && pwd)
  cd "$root"

  git fetch --tags origin
  git rev-parse -q --verify "refs/tags/$tag" >/dev/null || { echo "tag $tag não encontrada no GitHub" >&2; exit 1; }

  # Baixa e confere o frontend antes de mexer no código: com erro, a versão em uso continua intacta
  cd frontend
  if [ -n "$local_dist" ]; then
    cp "$local_dist" dist.tar.gz.new
  else
    local repo
    repo=$(git remote get-url origin | sed -e 's/\.git$//' -e 's|^git@github.com:|https://github.com/|')
    curl -fL -o dist.tar.gz.new "$repo/releases/download/$tag/dist.tar.gz"
  fi
  rm -rf dist.new && mkdir dist.new
  tar -xzf dist.tar.gz.new -C dist.new --no-same-owner
  test -f dist.new/index.html || { echo "dist.tar.gz sem index.html na raiz" >&2; exit 1; }
  cd ..

  git -c advice.detachedHead=false checkout --detach "$tag"
  (cd backend && uv sync --frozen --no-dev --extra server)

  cd frontend
  rm -rf dist && mv dist.new dist
  mv dist.tar.gz.new dist.tar.gz

  echo "instalado $(git describe --tags). Reinicie o serviço: sudo systemctl restart orbit-tools"
}

main "$@"
exit
