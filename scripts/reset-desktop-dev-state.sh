#!/usr/bin/env bash
# Remove desktop state owned by development bundle identifiers only.
# Production state (`es.pimia.workspace`, `~/.buzz`, and
# `pimia-workspace-desktop`) is deliberately outside every deletion pattern in
# this script — and so is every `xyz.block.*` identifier, which belongs to a
# Buzz install, not to us.
set -euo pipefail

log() { printf '[desktop-dev-reset] %s\n' "$*"; }

remove_path() {
  local path="$1"
  if [[ -e "$path" || -L "$path" ]]; then
    log "Removing $path"
    rm -rf -- "$path"
  fi
}

remove_bundle_state() {
  local base="$1"
  local suffix="${2:-}"
  local prefix path

  [[ -d "$base" ]] || return 0
  shopt -s nullglob
  for prefix in es.pimia.workspace.dev; do
    # Match the canonical dev identifier and dot-delimited worktree variants.
    # Do not use `${prefix}*`: that could match a non-dev prefix collision.
    remove_path "$base/${prefix}${suffix}"
    for path in "$base/${prefix}."*"${suffix}"; do
      remove_path "$path"
    done
  done
  shopt -u nullglob
}

case "$(uname -s)" in
  Darwin)
    remove_bundle_state "$HOME/Library/Application Support"
    remove_bundle_state "$HOME/Library/Caches"
    remove_bundle_state "$HOME/Library/WebKit"
    remove_bundle_state "$HOME/Library/HTTPStorages"
    remove_bundle_state "$HOME/Library/Saved Application State" ".savedState"
    remove_bundle_state "$HOME/Library/Preferences" ".plist"

    # SecretStore keeps all dev identity and agent keys in this dev-only item.
    # Delete every matching item in case an older build used multiple accounts.
    if command -v security >/dev/null 2>&1; then
      # Divergencia Pimia: solo se borran servicios de NUESTRO linaje. Borrar
      # `buzz-desktop-dev` aquí destruiría el llavero de una instalación de
      # Buzz que conviva en la misma máquina.
      #
      # Y se borra el linaje ENTERO, no solo el servicio sin ámbito: arriba se
      # barren los directorios de datos de todas las instancias de dev
      # (`es.pimia.workspace.dev` y sus variantes de worktree), así que dejar
      # vivos `…-dev.main` y `…-dev.<slug>` era un reset a medias — identidad y
      # claves de agentes sobrevivían al «borrado».
      dev_keyring_services=(pimia-workspace-desktop-dev)
      while IFS= read -r service; do
        [[ -n "$service" ]] && dev_keyring_services+=("$service")
      done < <(
        security dump-keychain 2>/dev/null \
          | sed -n 's/^ *"svce"<blob>="\(pimia-workspace-desktop-dev\.[^"]*\)"$/\1/p' \
          | sort -u
      )
      for service in "${dev_keyring_services[@]}"; do
        log "Removing keychain service $service"
        while security delete-generic-password -s "$service" >/dev/null 2>&1; do :; done
      done
    fi
    ;;
  Linux)
    remove_bundle_state "${XDG_DATA_HOME:-$HOME/.local/share}"
    remove_bundle_state "${XDG_CONFIG_HOME:-$HOME/.config}"
    remove_bundle_state "${XDG_CACHE_HOME:-$HOME/.cache}"
    ;;
  *)
    log "Desktop bundle cleanup is not implemented for $(uname -s); continuing"
    ;;
esac

remove_path "$HOME/.buzz-dev"
remove_path "$HOME/.sprout-dev"

# A fresh dev nest must not re-import the installed app's ~/.buzz contents on
# its next boot. The sentinel is the same one used by migrate_dev_nest().
mkdir -p "$HOME/.buzz-dev"
: > "$HOME/.buzz-dev/.dev-nest-migrated"

log "Development desktop state removed; production Buzz state was not touched"
