#!/usr/bin/env bash
# El identificador de bundle y el servicio de llavero tienen que describir
# SIEMPRE la misma instancia. Cuando no lo hacían, la app leía la ficha de
# agentes de una instancia y el llavero de otra, y arrancar un agente fallaba con
# «has no private key available — the OS keyring may be unreachable», que además
# manda a diagnosticar en la dirección contraria: el llavero estaba perfecto.
#
# Se comprueba el invariante (mismo ámbito en los dos) y, además, el valor
# concreto que le toca al checkout principal y a un worktree. Funciona igual
# ejecutado desde uno o desde otro.
#
# Uso: scripts/test-instance-env-keyring-scope.sh
set -euo pipefail

HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
MAIN_CHECKOUT=$(cd "$HERE" && dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
failures=0

# Sourcea instance-env.sh en un subshell desde $1, con el entorno hostil que
# venga en $2.. , y devuelve "<identificador> <servicio de llavero>".
scope_from() {
    local cwd="$1"
    shift
    (
        cd "$cwd"
        for assignment in "$@"; do export "${assignment?}"; done
        # shellcheck disable=SC1091
        source "$HERE/scripts/instance-env.sh" >/dev/null 2>&1
        printf '%s %s\n' \
            "$(node -e "console.log(JSON.parse(process.env.BUZZ_TAURI_CONFIG).identifier)")" \
            "$BUZZ_DEV_KEYRING_SERVICE"
    )
}

fail() {
    printf 'FAIL %s\n     %s\n' "$1" "$2"
    failures=$((failures + 1))
}

# El invariante: el servicio de llavero es exactamente el ámbito que declara el
# identificador (sin sufijo ⇒ `.main`).
check_paired() {
    local what="$1"
    shift
    local scope identifier service expected
    scope=$(scope_from "$@")
    identifier="${scope%% *}"
    service="${scope##* }"
    expected="${identifier#es.pimia.workspace.dev}"
    expected="pimia-workspace-desktop-dev.${expected#.}"
    [[ "$expected" == "pimia-workspace-desktop-dev." ]] && expected+="main"
    if [[ "$service" == "$expected" ]]; then
        printf 'ok   %s (%s → %s)\n' "$what" "$identifier" "$service"
    else
        fail "$what" "identificador $identifier con llavero $service (esperaba $expected)"
    fi
}

# Y el valor concreto, para que el invariante no se cumpla «por casualidad»
# apuntando los dos al sitio equivocado.
check_exact() {
    local what="$1" got="$2" want="$3"
    if [[ "$got" == "$want" ]]; then
        printf 'ok   %s\n' "$what"
    else
        fail "$what" "got: $got | want: $want"
    fi
}

# --- Checkout principal. El caso que se rompía se sourcea desde `desktop/`. ---
check_exact "checkout principal desde desktop/" \
    "$(scope_from "$MAIN_CHECKOUT/desktop")" \
    "es.pimia.workspace.dev pimia-workspace-desktop-dev.main"
check_exact "checkout principal desde la raíz" \
    "$(scope_from "$MAIN_CHECKOUT")" \
    "es.pimia.workspace.dev pimia-workspace-desktop-dev.main"

# --- Un ámbito heredado de otro lanzamiento no puede sobrevivir. ---
check_exact "un servicio heredado se pisa" \
    "$(scope_from "$MAIN_CHECKOUT/desktop" \
        BUZZ_DEV_KEYRING_SERVICE=pimia-workspace-desktop-dev.otro-worktree)" \
    "es.pimia.workspace.dev pimia-workspace-desktop-dev.main"
check_exact "un slug heredado se pisa" \
    "$(scope_from "$MAIN_CHECKOUT/desktop" BUZZ_INSTANCE_SLUG=otro-worktree)" \
    "es.pimia.workspace.dev pimia-workspace-desktop-dev.main"

# --- Worktree: identificador y llavero comparten el slug de la rama. ---
if [[ "$HERE" != "$MAIN_CHECKOUT" ]]; then
    slug=$(cd "$HERE" && git rev-parse --abbrev-ref HEAD \
        | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g; s/--*/-/g; s/^-//; s/-$//')
    check_exact "worktree: los dos llevan el slug de la rama" \
        "$(scope_from "$HERE/desktop")" \
        "es.pimia.workspace.dev.${slug} pimia-workspace-desktop-dev.${slug}"
    check_paired "worktree con un servicio heredado" "$HERE/desktop" \
        BUZZ_DEV_KEYRING_SERVICE=pimia-workspace-desktop-dev.main
else
    printf 'skip worktree: ejecuta este script desde un worktree para cubrir ese caso\n'
fi

check_paired "invariante en el checkout principal" "$MAIN_CHECKOUT/desktop"

if ((failures > 0)); then
    printf '\n%d comprobación(es) fallida(s)\n' "$failures" >&2
    exit 1
fi
printf '\nTodo en orden: identificador y llavero describen la misma instancia\n'
