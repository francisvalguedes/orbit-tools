#!/usr/bin/env bash
# Instala uma versão no servidor: código, ambiente Python e o frontend compilado baixado do GitHub Release.
# Não compila nada, então serve para servidores sem Node ou sem AVX.
#
#   vX.Y.Z      código da tag e o dist.tar.gz do release da tag
#   build-main  código do último commit da main e o dist.tar.gz que o GitHub Actions compila a cada push
#               (.github/workflows/frontend-build.yml); a tag build-main não acompanha a main
#
# Rodar como o dono do repositório no servidor e depois reiniciar o serviço:
#   sudo -H -u <usuário> /caminho/do/repositorio/scripts/install-release.sh v0.2.0
#   sudo systemctl restart orbit-tools
#
# Com o arquivo já baixado (servidor sem acesso ao GitHub), passe o caminho do dist.tar.gz em segundo argumento.

# Tudo dentro de main: o git checkout troca este arquivo enquanto ele roda, e o bash lê scripts aos poucos.
main() {
  set -euo pipefail
  local tag=${1:?uso: $0 vX.Y.Z|build-main [dist.tar.gz]}
  local local_dist=${2:-}
  [ -z "$local_dist" ] || local_dist=$(realpath "$local_dist")

  local root
  root=$(cd "$(dirname "$0")/.." && pwd)
  cd "$root"

  git fetch --tags origin
  local ref commit
  if [ "$tag" = build-main ]; then
    ref=origin/main
  else
    ref=refs/tags/$tag
    git rev-parse -q --verify "$ref" >/dev/null || { echo "tag $tag não encontrada no GitHub" >&2; exit 1; }
  fi
  commit=$(git rev-parse "$ref^{commit}")

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
  # O GitHub Actions grava o commit compilado em COMMIT; os releases feitos à mão não têm o arquivo
  if [ -f dist.new/COMMIT ] || [ "$tag" = build-main ]; then
    local built
    built=$(cat dist.new/COMMIT 2>/dev/null || echo "?")
    if [ "$built" != "$commit" ]; then
      echo "o frontend é do commit ${built:0:7} e o código do ${commit:0:7}: o build pode estar rodando" \
        "(aba Actions do GitHub); tente de novo em alguns minutos" >&2
      exit 1
    fi
  fi
  cd ..

  git -c advice.detachedHead=false checkout --detach "$commit"
  (cd backend && uv sync --frozen --no-dev --extra server)

  cd frontend
  rm -rf dist && mv dist.new dist
  mv dist.tar.gz.new dist.tar.gz

  echo "instalado $tag ($(git log -1 --format='%h %s')). Reinicie o serviço: sudo systemctl restart orbit-tools"
}

main "$@"
exit
