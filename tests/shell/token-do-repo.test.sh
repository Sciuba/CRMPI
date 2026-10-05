#!/usr/bin/env bash
# Prova do acesso ao código numa instalação com repositório PRIVADO
# (`gravar_token_do_repo` e `repo_alcancavel`, em `_common.sh`).
#
#   bash tests/shell/token-do-repo.test.sh
#
# ── O que está em jogo ──────────────────────────────────────────────────────
#
# Quem instala digita o token UMA vez, no `git clone`. As atualizações rodam
# depois, pelo cron do agente, sem teclado. Se o token não ficar guardado onde o
# git desta pasta o acha, a instalação sobe verde e a primeira atualização falha
# calada meses depois. E se ficar guardado no lugar errado (`.env`, URL do
# origin), ele vaza para dentro dos contêineres ou para o `git remote -v`.
#
# A classificação rede × acesso decide a frase que o dono lê: "seu token venceu"
# para quem só está sem internet manda a pessoa pedir token novo à toa.
#
# Nada aqui toca a rede: o repositório é local e o `ls-remote` contra o GitHub é
# um dublê que devolve as mensagens reais do git.
set -uo pipefail

KIT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../setup-kit" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILS=0
check() {  # check <descrição> <comando...>
  if "${@:2}"; then printf '  ✓ %s\n' "$1"; else printf '  ✗ %s\n' "$1"; FAILS=$((FAILS + 1)); fi
}

REAL_GIT="$(command -v git)"
TOKEN_A="github_pat_TESTE_aaaaaaaaaaaaaaaa"
TOKEN_B="github_pat_TESTE_bbbbbbbbbbbbbbbb"

# Uma "instalação": clone cujo origin aponta para o GitHub (só a URL — nenhum
# comando aqui fala com ele).
git init --quiet "$WORK/inst"
git -C "$WORK/inst" remote add origin https://github.com/Sciuba/CRMPI.git

# Roda uma função do kit dentro da instalação, numa subshell (o `_common.sh`
# liga `set -e`, e um `exit` dele não pode derrubar este arquivo).
kit() {  # kit <comando...>
  ( cd "$WORK/inst" && HOME="$WORK/home" bash -c '. "$0"/_common.sh >/dev/null 2>&1; "$@"' "$KIT_DIR" "$@" )
}
mkdir -p "$WORK/home"

# O que o git desta pasta responde quando precisa de credencial do GitHub.
senha_que_o_git_usa() {
  ( cd "$WORK/inst" && printf 'protocol=https\nhost=github.com\n\n' \
      | HOME="$WORK/home" GIT_TERMINAL_PROMPT=0 git credential fill 2>/dev/null \
      | sed -n 's/^password=//p' )
}

printf '\n▶ o token fica onde o git desta pasta o acha\n'

kit gravar_token_do_repo "$TOKEN_A"
check "o git, sem ninguém digitar, entrega o token gravado" \
  test "$(senha_que_o_git_usa)" = "$TOKEN_A"

kit gravar_token_do_repo "$TOKEN_B"
check "trocar o token substitui o anterior (trocar-token.sh)" \
  test "$(senha_que_o_git_usa)" = "$TOKEN_B"

# Um helper GLOBAL da máquina (de outra conta) não pode responder antes do nosso.
mkdir -p "$WORK/home"
HOME="$WORK/home" git config --global credential.helper \
  '!f() { echo username=outra-conta; echo password=TOKEN_DE_OUTRA_CONTA; }; f'
check "um helper global da máquina não passa na frente do token da instalação" \
  test "$(senha_que_o_git_usa)" = "$TOKEN_B"
rm -f "$WORK/home/.gitconfig"

printf '\n▶ e NÃO fica onde vaza\n'

check "a URL do origin não carrega o token" \
  bash -c '! git -C "$1" remote -v | grep -q github_pat_' _ "$WORK/inst"
check "o .git/config não carrega o token (só o caminho do arquivo)" \
  bash -c '! grep -q github_pat_ "$1/.git/config"' _ "$WORK/inst"
check "o install.sh não escreve REPO_TOKEN no .env (que vai inteiro para os contêineres)" \
  bash -c '! grep -qE "envq REPO_TOKEN|set_env_var [^ ]+ REPO_TOKEN" "$1/install.sh"' _ "$KIT_DIR"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) printf '  – permissão 600 não se mede no Windows (sem modo POSIX); vale no CI\n' ;;
  *)
    check "o arquivo do token tem permissão 600" \
      test "$(stat -c %a "$WORK/inst/.git/deskcomm-credencial" 2>/dev/null || stat -f %Lp "$WORK/inst/.git/deskcomm-credencial")" = "600"
    ;;
esac

printf '\n▶ pasta que não é clone (kit copiado à mão) não quebra\n'

mkdir -p "$WORK/solto"
check "gravar fora de um repositório devolve 0 e não cria nada" \
  bash -c 'cd "$1" && bash -c ". \"\$0\"/_common.sh >/dev/null 2>&1; gravar_token_do_repo x" "$2" && [ ! -e .git ]' _ "$WORK/solto" "$KIT_DIR"

printf '\n▶ rede × acesso (a frase que o dono lê depende disto)\n'

# Dublê: intercepta só o `ls-remote` e devolve no stderr a mensagem que o git
# real dá em cada caso. Todo o resto vai para o git de verdade.
mkdir -p "$WORK/bin"
cat > "$WORK/bin/git" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do
  if [ "\$a" = "ls-remote" ]; then
    [ -z "\${ERRO_DO_GIT:-}" ] && exit 0
    printf '%s\n' "\$ERRO_DO_GIT" >&2; exit 128
  fi
done
exec "$REAL_GIT" "\$@"
STUB
chmod +x "$WORK/bin/git"

rc_de() {  # rc_de <stderr que o git devolve>  → código de repo_alcancavel
  ( cd "$WORK/inst" && PATH="$WORK/bin:$PATH" ERRO_DO_GIT="$1" \
      bash -c '. "$0"/_common.sh >/dev/null 2>&1; rc=0; repo_alcancavel || rc=$?; echo $rc' "$KIT_DIR" 2>/dev/null ) | tail -1
}

check "origin respondeu → 0" \
  test "$(rc_de '')" = 0
check "sem credencial ('could not read Username') → 2 (acesso)" \
  test "$(rc_de "fatal: could not read Username for 'https://github.com': terminal prompts disabled")" = 2
check "token recusado ('Authentication failed') → 2 (acesso)" \
  test "$(rc_de "remote: Invalid username or token. Password authentication is not supported for Git operations.
fatal: Authentication failed for 'https://github.com/Sciuba/CRMPI.git/'")" = 2
check "token sem acesso a ESTE repo ('Repository not found') → 2 (acesso)" \
  test "$(rc_de "remote: Repository not found.
fatal: repository 'https://github.com/Sciuba/CRMPI.git/' not found")" = 2
check "sem internet ('Could not resolve host') → 1 (rede, não token)" \
  test "$(rc_de "fatal: unable to access 'https://github.com/Sciuba/CRMPI.git/': Could not resolve host: github.com")" = 1

git init --quiet "$WORK/local"
git -C "$WORK/local" remote add origin "$WORK/qualquer.git"
check "origin que não é GitHub por HTTPS (testes, SSH) → 0, não é assunto daqui" \
  test "$(cd "$WORK/local" && PATH="$WORK/bin:$PATH" ERRO_DO_GIT="Repository not found" \
            bash -c '. "$0"/_common.sh >/dev/null 2>&1; rc=0; repo_alcancavel || rc=$?; echo $rc' "$KIT_DIR" 2>/dev/null | tail -1)" = 0

printf '\n▶ os call sites (o update.sh e o agente distinguem os dois casos)\n'

check "update.sh avisa do token só quando o motivo é acesso" \
  grep -qF '[ "$acesso_rc" = 2 ]; then avisar_token_invalido' "$KIT_DIR/update.sh"
check "agent.sh registra o comando de troca no log quando o motivo é acesso" \
  grep -q 'trocar-token.sh' "$KIT_DIR/agent.sh"

printf '\n'
[ "$FAILS" -eq 0 ] && { printf '✓ token-do-repo: tudo verde\n'; exit 0; }
printf '✗ token-do-repo: %d falha(s)\n' "$FAILS"; exit 1
