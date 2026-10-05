#!/usr/bin/env bash
# Troca o token de acesso ao código desta instalação (o repositório é privado).
# Use quando o token venceu ou foi revogado — o update.sh e o log do agente
# avisam com este mesmo comando.
#
#   bash setup-kit/trocar-token.sh
#   REPO_TOKEN=github_pat_... bash setup-kit/trocar-token.sh   (sem perguntar)
source "$(dirname "$0")/_common.sh"
enter_project

TOKEN="${REPO_TOKEN:-}"
if [ -z "$TOKEN" ]; then
  c_dim "Cole o token novo (começa com github_pat_). Ele não aparece enquanto você cola."
  read -r -s -p "Token de acesso: " TOKEN || die "A entrada terminou antes de eu receber o token."
  echo
fi
[ -n "$TOKEN" ] || die "Nenhum token informado."

step "Conferindo o token com o GitHub"
gravar_token_do_repo "$TOKEN"
rc=0; repo_alcancavel || rc=$?
case "$rc" in
  0) c_grn "✓ Token aceito. As atualizações voltam a funcionar (pela tela ou com bash setup-kit/update.sh)." ;;
  2) die "O GitHub recusou esse token. Confira se ele tem leitura (Contents: read) no repositório e se não venceu." ;;
  *) die "Não consegui falar com o GitHub agora. O token ficou gravado — rode este comando de novo com internet para conferir." ;;
esac
