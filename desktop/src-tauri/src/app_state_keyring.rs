/// Servicio de llavero de la instancia **principal** en dev: el checkout
/// principal y cualquier arranque que no declare ámbito comparten este cajón.
/// Los worktrees usan `pimia-workspace-desktop-dev.<slug>`, derivado del mismo
/// identificador de bundle (véase `scripts/instance-env.sh`).
///
/// Que el nombre lleve `.main` en vez de quedarse pelado no es cosmético: el
/// comando de arranque ya escribía aquí (`${BUZZ_INSTANCE_SLUG:-main}`), así
/// que es donde vive de verdad la identidad Nostr del checkout principal. Tener
/// dos candidatos —este y el pelado— según qué receta arrancara la app era el
/// origen de que un agente apareciera sin clave privada.
pub(crate) const MAIN_DEV_KEYRING_SERVICE: &str = "pimia-workspace-desktop-dev.main";

/// El servicio de dev sin ámbito que se usó antes de que `.main` fuese el
/// canónico. Solo lo lee la migración de un único sentido
/// ([`migrate_unscoped_dev_keyring`]); nada más debe volver a escribir aquí.
#[cfg(debug_assertions)]
const LEGACY_UNSCOPED_DEV_KEYRING_SERVICE: &str = "pimia-workspace-desktop-dev";

/// Service name for the desktop OS keyring. Debug builds default to a distinct
/// service, while standalone worktree launches may request a scoped dev service.
///
/// Pimia divergence: the whole service lineage is renamed away from
/// `buzz-desktop*`. The OS keyring is per-user, not per-app, so a fork keeping
/// the upstream service names would share one keychain entry — and therefore
/// one Nostr identity — with any Buzz install on the same machine. The bundle
/// identifier does not isolate this; only the service name does.
fn dev_keyring_service(configured: Option<String>) -> String {
    configured
        .filter(|service| service.starts_with("pimia-workspace-desktop-dev."))
        .unwrap_or_else(|| MAIN_DEV_KEYRING_SERVICE.to_string())
}

pub(crate) fn keyring_service() -> &'static str {
    if cfg!(debug_assertions) {
        static DEV_SERVICE: std::sync::OnceLock<String> = std::sync::OnceLock::new();
        DEV_SERVICE
            .get_or_init(|| dev_keyring_service(std::env::var("BUZZ_DEV_KEYRING_SERVICE").ok()))
            .as_str()
    } else {
        "pimia-workspace-desktop"
    }
}

pub(super) fn migration_marker_name(service: &str, default_name: &str) -> String {
    if service == "pimia-workspace-desktop" || service == "pimia-workspace-desktop-dev" {
        default_name.to_string()
    } else {
        format!("identity.{service}.migrated")
    }
}

/// Marca que se guarda **dentro** del blob canónico cuando la migración del
/// servicio sin ámbito ha terminado. Con ella presente, los arranques siguientes
/// no vuelven a abrir el cajón heredado (cero accesos, cero avisos del llavero).
#[cfg(debug_assertions)]
const UNSCOPED_DEV_MIGRATION_MARKER: &str = "_unscoped_dev_migration_v1";

/// Qué entradas del blob heredado hay que levantar al canónico.
///
/// Solo las que el canónico **no** tenga ya: nunca se pisa un valor vivo. Eso
/// importa sobre todo con `identity` y con `agent:<pubkey>`, donde sobreescribir
/// resucitaría una clave rotada. La propia marca no se copia.
#[cfg(debug_assertions)]
fn entries_to_lift(
    legacy: &std::collections::HashMap<String, String>,
    canonical: &std::collections::HashMap<String, String>,
) -> std::collections::HashMap<String, String> {
    legacy
        .iter()
        .filter(|(key, _)| key.as_str() != UNSCOPED_DEV_MIGRATION_MARKER)
        .filter(|(key, _)| !canonical.contains_key(key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect()
}

/// Levanta el contenido del servicio de dev sin ámbito
/// (`pimia-workspace-desktop-dev`) al canónico
/// (`pimia-workspace-desktop-dev.main`), una sola vez y sin destruir nada.
///
/// Hace falta porque el checkout principal escribía en uno o en otro según la
/// receta que lo arrancara: `just desktop-standalone` fijaba `.main` y
/// `just dev` se quedaba con el pelado. Al declarar `.main` canónico, lo que
/// quedó en el pelado —vault de tenants de Pimia, identidad, claves de
/// agentes— dejaría de verse; esto lo trae en lugar de pedir que se rehaga.
///
/// Solo en debug y solo para la instancia principal: el ámbito de un worktree
/// está aislado a propósito y no debe heredar nada.
///
/// El cajón heredado se deja intacto (se copia, no se mueve), así que un
/// arranque con un binario anterior sigue encontrando lo suyo.
#[cfg(debug_assertions)]
pub(crate) fn migrate_unscoped_dev_keyring() {
    if !cfg!(feature = "system-keyring") || keyring_service() != MAIN_DEV_KEYRING_SERVICE {
        return;
    }

    let canonical = crate::secret_store::SecretStore::shared(keyring_service());
    let canonical_map = match canonical.load_all_readonly() {
        Ok(Some(map)) if map.contains_key(UNSCOPED_DEV_MIGRATION_MARKER) => return,
        Ok(Some(map)) => map,
        Ok(None) => std::collections::HashMap::new(),
        Err(e) => {
            eprintln!("pimia-workspace: keyring-main-scope: no se puede leer {MAIN_DEV_KEYRING_SERVICE}: {e}");
            return;
        }
    };

    // Instancia propia (no `shared`): `shared` sirve un único `SecretStore` para
    // todo el proceso, y aquí hacen falta dos servicios a la vez.
    let legacy = crate::secret_store::SecretStore::keyring(LEGACY_UNSCOPED_DEV_KEYRING_SERVICE);
    let legacy_map = match legacy.load_all_readonly() {
        Ok(Some(map)) => map,
        Ok(None) => std::collections::HashMap::new(),
        // Fallo de backend: no se escribe la marca, así que el intento se repite
        // en el arranque siguiente en vez de dar por migrado lo que no se leyó.
        Err(e) => {
            eprintln!(
                "pimia-workspace: keyring-main-scope: no se puede leer {LEGACY_UNSCOPED_DEV_KEYRING_SERVICE}: {e}"
            );
            return;
        }
    };

    let mut to_write = entries_to_lift(&legacy_map, &canonical_map);
    let lifted = to_write.len();
    to_write.insert(
        UNSCOPED_DEV_MIGRATION_MARKER.to_string(),
        "done".to_string(),
    );

    if let Err(e) = canonical.store_all(&to_write) {
        eprintln!(
            "pimia-workspace: keyring-main-scope: no se puede escribir en {MAIN_DEV_KEYRING_SERVICE}: {e}"
        );
        return;
    }

    if lifted > 0 {
        eprintln!(
            "pimia-workspace: keyring-main-scope: {lifted} entrada(s) traída(s) de {LEGACY_UNSCOPED_DEV_KEYRING_SERVICE}"
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{dev_keyring_service, migration_marker_name, MAIN_DEV_KEYRING_SERVICE};

    #[test]
    fn standalone_scope_must_remain_under_dev_service() {
        assert_eq!(
            dev_keyring_service(Some("pimia-workspace-desktop-dev.example".to_string())),
            "pimia-workspace-desktop-dev.example"
        );
        assert_eq!(
            dev_keyring_service(Some("pimia-workspace-desktop".to_string())),
            MAIN_DEV_KEYRING_SERVICE
        );
    }

    /// Sin ámbito declarado se cae en el canónico `.main`, no en el pelado: si
    /// el arranque que no pasa por las recetas usara otro cajón, volvería el
    /// desajuste de leer la ficha de agentes de una instancia y el llavero de
    /// otra (agente sin clave privada).
    #[test]
    fn the_unscoped_default_is_the_main_scope() {
        assert_eq!(
            dev_keyring_service(None),
            "pimia-workspace-desktop-dev.main"
        );
        // Pedirlo explícitamente vale: lleva el prefijo con punto.
        assert_eq!(
            dev_keyring_service(Some(MAIN_DEV_KEYRING_SERVICE.to_string())),
            MAIN_DEV_KEYRING_SERVICE
        );
    }

    /// A Buzz-lineage service name must never be honoured: it would point the
    /// fork at the keychain entry of a Buzz install on the same machine.
    #[test]
    fn buzz_lineage_service_names_are_rejected() {
        assert_eq!(
            dev_keyring_service(Some("buzz-desktop-dev.example".to_string())),
            MAIN_DEV_KEYRING_SERVICE
        );
        assert_eq!(
            dev_keyring_service(Some("buzz-desktop".to_string())),
            MAIN_DEV_KEYRING_SERVICE
        );
    }

    #[cfg(debug_assertions)]
    mod lifting_the_unscoped_blob {
        use super::super::{entries_to_lift, UNSCOPED_DEV_MIGRATION_MARKER};
        use std::collections::HashMap;

        fn map(pairs: &[(&str, &str)]) -> HashMap<String, String> {
            pairs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect()
        }

        #[test]
        fn lifts_what_the_canonical_blob_does_not_have() {
            let lifted = entries_to_lift(
                &map(&[
                    ("pimia.tenants", "{\"tenants\":[]}"),
                    ("identity", "nsec1vieja"),
                ]),
                &map(&[("identity", "nsec1viva")]),
            );
            assert_eq!(
                lifted,
                map(&[("pimia.tenants", "{\"tenants\":[]}")]),
                "solo sube lo ausente"
            );
        }

        /// Pisar una `identity` o una `agent:<pubkey>` viva resucitaría una clave
        /// rotada: la del canónico manda siempre.
        #[test]
        fn never_overwrites_a_live_entry() {
            let lifted = entries_to_lift(
                &map(&[("identity", "nsec1vieja"), ("agent:ab", "nsec1vieja")]),
                &map(&[("identity", "nsec1viva"), ("agent:ab", "nsec1rotada")]),
            );
            assert!(lifted.is_empty());
        }

        #[test]
        fn the_marker_itself_is_not_copied() {
            let lifted = entries_to_lift(
                &map(&[
                    (UNSCOPED_DEV_MIGRATION_MARKER, "done"),
                    ("identity", "nsec1"),
                ]),
                &HashMap::new(),
            );
            assert_eq!(lifted, map(&[("identity", "nsec1")]));
        }
    }

    #[test]
    fn standalone_scope_uses_its_own_migration_marker() {
        assert_eq!(
            migration_marker_name("pimia-workspace-desktop", "identity.migrated"),
            "identity.migrated"
        );
        assert_eq!(
            migration_marker_name("pimia-workspace-desktop-dev", "identity.migrated"),
            "identity.migrated"
        );
        assert_eq!(
            migration_marker_name("pimia-workspace-desktop-dev.example", "identity.migrated"),
            "identity.pimia-workspace-desktop-dev.example.migrated"
        );
    }
}
