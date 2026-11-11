#!/usr/bin/env bash
# Publica o frontend compilado num GitHub Release (ver docs/frontend.md), na máquina de desenvolvimento.
#
# Cria a tag vX.Y.Z (versão do backend/pyproject.toml) no commit atual de origin/main, compila o frontend a
# partir da tag num clone limpo e anexa frontend/dist.tar.gz ao release. Requer git, Node 22+ e gh autenticado.
#
# Uso: scripts/release-frontend.sh             cria a tag e o release
#      scripts/release-frontend.sh --clobber   troca o anexo de um release já publicado
set -euo pipefail

CLOBBER=false
[ "${1:-}" = --clobber ] && CLOBBER=true

for cmd in git npm gh tar; do
  command -v "$cmd" >/dev/null || { echo "falta o comando $cmd" >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "gh não autenticado: rode gh auth login" >&2; exit 1; }

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

git fetch --tags origin main
COMMIT=$(git rev-parse origin/main)
VERSION=$(git show origin/main:backend/pyproject.toml | sed -n 's/^version = "\(.*\)"$/\1/p' | head -1)
PKG_VERSION=$(git show origin/main:frontend/package.json | sed -n 's/^  "version": "\(.*\)",$/\1/p' | head -1)
if [ -z "$VERSION" ] || [ "$VERSION" != "$PKG_VERSION" ]; then
  echo "versões diferentes na main: pyproject.toml '$VERSION', package.json '$PKG_VERSION'" >&2
  exit 1
fi
TAG=v$VERSION
echo "release $TAG no commit $(git log -1 --format='%h %s' "$COMMIT")"

# Uma tag que já existe em outro commit indica versão não atualizada antes do release
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  if [ "$(git rev-parse "$TAG^{commit}")" != "$COMMIT" ]; then
    echo "a tag $TAG já existe em outro commit: atualize a versão em pyproject.toml e package.json" >&2
    exit 1
  fi
else
  git tag "$TAG" "$COMMIT"
fi
git push origin "$TAG"

if gh release view "$TAG" >/dev/null 2>&1 && [ "$CLOBBER" = false ]; then
  echo "o release $TAG já existe; para trocar o anexo: $0 --clobber" >&2
  exit 1
fi

# Build a partir da tag, sem arquivos locais fora do git, com as dependências do package-lock.json
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
git -c advice.detachedHead=false clone -q --branch "$TAG" "$ROOT" "$WORK/src"
(cd "$WORK/src/frontend" && npm ci && npm run build)

OUT=$ROOT/frontend/dist.tar.gz
tar -czf "$OUT" -C "$WORK/src/frontend/dist" .
# grep sem -q: com pipefail, o -q fecharia o pipe antes do fim e o tar falharia com SIGPIPE
tar -tzf "$OUT" | grep -x './index.html' >/dev/null || { echo "dist.tar.gz sem ./index.html" >&2; exit 1; }

if [ "$CLOBBER" = true ] && gh release view "$TAG" >/dev/null 2>&1; then
  gh release upload "$TAG" "$OUT" --clobber
else
  gh release create "$TAG" "$OUT" --title "$TAG" --generate-notes
fi

echo "publicado: $(gh repo view --json url -q .url)/releases/download/$TAG/dist.tar.gz"
