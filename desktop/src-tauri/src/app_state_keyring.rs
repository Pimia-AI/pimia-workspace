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
        .unwrap_or_else(|| "pimia-workspace-desktop-dev".to_string())
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

#[cfg(test)]
mod tests {
    use super::{dev_keyring_service, migration_marker_name};

    #[test]
    fn standalone_scope_must_remain_under_dev_service() {
        assert_eq!(
            dev_keyring_service(Some("pimia-workspace-desktop-dev.example".to_string())),
            "pimia-workspace-desktop-dev.example"
        );
        assert_eq!(
            dev_keyring_service(Some("pimia-workspace-desktop".to_string())),
            "pimia-workspace-desktop-dev"
        );
    }

    /// A Buzz-lineage service name must never be honoured: it would point the
    /// fork at the keychain entry of a Buzz install on the same machine.
    #[test]
    fn buzz_lineage_service_names_are_rejected() {
        assert_eq!(
            dev_keyring_service(Some("buzz-desktop-dev.example".to_string())),
            "pimia-workspace-desktop-dev"
        );
        assert_eq!(
            dev_keyring_service(Some("buzz-desktop".to_string())),
            "pimia-workspace-desktop-dev"
        );
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
