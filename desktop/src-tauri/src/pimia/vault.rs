//! El vault de conexiones a tenants de Pimia: qué se guarda y dónde.
//!
//! Todo vive en **una sola entrada del llavero del SO** (`pimia.tenants`)
//! dentro del blob que ya usa el resto de la app. Es el mismo `SecretStore` de
//! la identidad Nostr, con el nombre de servicio propio del fork
//! (`pimia-workspace-desktop[-dev]`), así que no hay una segunda entrada ni un
//! segundo aviso del llavero.
//!
//! Lo que NO se guarda: nada en `localStorage` ni en disco en claro. El
//! `TokenSet` es una credencial portadora; si sale del llavero, sale robada.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// Clave del blob dentro del `SecretStore`.
const VAULT_KEY: &str = "pimia.tenants";

/// Margen con el que se considera caducado un access token, en segundos.
/// Refrescar un poco antes evita el 401 de carrera cuando la petición sale
/// justo en el filo.
pub(crate) const EXPIRY_SKEW_SECONDS: i64 = 60;

/// Un juego de tokens tal y como lo devuelve el token endpoint.
///
/// `refresh_token` es opcional porque el operador del tenant puede desactivar
/// los refrescos (`OAUTH_ACCESS_TOKEN_TTL=0`).
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct TokenSet {
    pub access_token: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refresh_token: Option<String>,
    /// Epoch en milisegundos. Ausente = el servidor no dio expiración.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<i64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub token_type: Option<String>,
}

impl TokenSet {
    /// ¿Caduca dentro del margen? Sin `expires_at` se asume que sigue vivo.
    pub(crate) fn is_expired(&self, now_ms: i64) -> bool {
        match self.expires_at {
            None => false,
            Some(expires_at) => expires_at - EXPIRY_SKEW_SECONDS * 1_000 <= now_ms,
        }
    }
}

/// Una conexión viva a un tenant. `client_id` viene del registro dinámico
/// (RFC 7591): cada tenant emite el suyo, y es un client **público** — sin
/// secreto, porque una app de escritorio no puede guardar ninguno.
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
pub(crate) struct TenantConnection {
    pub id: String,
    pub base_url: String,
    pub label: String,
    pub client_id: String,
    pub tokens: TokenSet,
    /// Epoch en milisegundos.
    pub connected_at: i64,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub(crate) struct PimiaVault {
    #[serde(default)]
    pub tenants: Vec<TenantConnection>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_tenant_id: Option<String>,
}

impl PimiaVault {
    pub(crate) fn find(&self, tenant_id: &str) -> Option<&TenantConnection> {
        self.tenants.iter().find(|tenant| tenant.id == tenant_id)
    }

    /// El tenant activo, o el primero si el puntero apunta a uno que ya no
    /// está (p. ej. tras desconectarlo desde otra ventana).
    pub(crate) fn active(&self) -> Option<&TenantConnection> {
        self.active_tenant_id
            .as_deref()
            .and_then(|id| self.find(id))
            .or_else(|| self.tenants.first())
    }

    pub(crate) fn upsert(&mut self, tenant: TenantConnection) {
        match self
            .tenants
            .iter_mut()
            .find(|existing| existing.id == tenant.id)
        {
            Some(existing) => *existing = tenant,
            None => self.tenants.push(tenant),
        }
    }

    pub(crate) fn remove(&mut self, tenant_id: &str) -> Option<TenantConnection> {
        let index = self
            .tenants
            .iter()
            .position(|tenant| tenant.id == tenant_id)?;
        let removed = self.tenants.remove(index);
        if self.active_tenant_id.as_deref() == Some(tenant_id) {
            self.active_tenant_id = self.tenants.first().map(|tenant| tenant.id.clone());
        }
        Some(removed)
    }
}

fn secret_store() -> &'static crate::secret_store::SecretStore {
    crate::secret_store::SecretStore::shared(crate::app_state::keyring_service())
}

/// Lee el vault del llavero.
///
/// Usa `load_all_readonly` a propósito en vez de `load(key)`: `load` dispara la
/// migración de entradas heredadas de upstream para claves que no existen, y
/// aquí eso solo añadiría accesos al llavero sin poder encontrar nada.
pub(crate) fn load_vault() -> Result<PimiaVault, String> {
    let blob: Option<HashMap<String, String>> = secret_store().load_all_readonly()?;
    let Some(raw) = blob.as_ref().and_then(|map| map.get(VAULT_KEY)) else {
        return Ok(PimiaVault::default());
    };

    serde_json::from_str(raw).map_err(|error| format!("vault de Pimia corrupto: {error}"))
}

pub(crate) fn save_vault(vault: &PimiaVault) -> Result<(), String> {
    let raw = serde_json::to_string(vault)
        .map_err(|error| format!("no se pudo serializar el vault de Pimia: {error}"))?;
    secret_store().store(VAULT_KEY, &raw)
}

/// Normaliza la base del tenant: exige `https` (o `http` en localhost, para
/// desarrollo) y quita la barra final.
///
/// Un tenant en claro fuera de localhost sería mandar el bearer por la red sin
/// cifrar; se rechaza aquí y no más abajo, donde ya sería tarde.
pub(crate) fn normalize_base_url(input: &str) -> Result<String, String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("indica la dirección del tenant".to_string());
    }

    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };

    let url = url::Url::parse(&candidate)
        .map_err(|error| format!("dirección de tenant inválida: {error}"))?;
    let host = url
        .host_str()
        .ok_or_else(|| "la dirección del tenant no tiene host".to_string())?;
    let is_loopback = host == "localhost" || host == "127.0.0.1" || host == "::1";
    if url.scheme() != "https" && !(url.scheme() == "http" && is_loopback) {
        return Err("el tenant debe ir por https".to_string());
    }

    Ok(url.as_str().trim_end_matches('/').to_string())
}

/// Identificador estable de un tenant, derivado de su base. Sirve de clave en
/// el vault y de valor de `activeTenantId` en el frontend.
pub(crate) fn tenant_id_for(base_url: &str) -> String {
    uuid::Uuid::new_v5(&uuid::Uuid::NAMESPACE_URL, base_url.as_bytes()).to_string()
}

/// Etiqueta legible: el host del tenant (`demo.example.com`).
pub(crate) fn tenant_label_for(base_url: &str) -> String {
    url::Url::parse(base_url)
        .ok()
        .and_then(|url| url.host_str().map(str::to_string))
        .unwrap_or_else(|| base_url.to_string())
}

pub(crate) fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_and_requires_https() {
        assert_eq!(
            normalize_base_url("  demo.example.com/ "),
            Ok("https://demo.example.com".to_string())
        );
        assert_eq!(
            normalize_base_url("https://demo.example.com/"),
            Ok("https://demo.example.com".to_string())
        );
        assert!(normalize_base_url("http://demo.example.com").is_err());
        // http sigue valiendo en loopback: es el caso de un tenant local.
        assert!(normalize_base_url("http://localhost:8000").is_ok());
        assert!(normalize_base_url("   ").is_err());
    }

    #[test]
    fn tenant_id_is_stable_and_distinct() {
        let a = tenant_id_for("https://demo.example.com");
        assert_eq!(a, tenant_id_for("https://demo.example.com"));
        assert_ne!(a, tenant_id_for("https://otro.example.com"));
    }

    #[test]
    fn label_is_the_host() {
        assert_eq!(
            tenant_label_for("https://demo.example.com"),
            "demo.example.com"
        );
    }

    #[test]
    fn expiry_honours_the_skew_and_missing_expiry() {
        let now = 1_000_000;
        let never = TokenSet::default();
        assert!(!never.is_expired(now), "sin expires_at se asume vivo");

        let soon = TokenSet {
            expires_at: Some(now + 30 * 1_000),
            ..TokenSet::default()
        };
        assert!(
            soon.is_expired(now),
            "dentro del margen cuenta como caducado"
        );

        let later = TokenSet {
            expires_at: Some(now + 10 * 60 * 1_000),
            ..TokenSet::default()
        };
        assert!(!later.is_expired(now));
    }

    fn tenant(id: &str) -> TenantConnection {
        TenantConnection {
            id: id.to_string(),
            base_url: format!("https://{id}.example.com"),
            label: format!("{id}.example.com"),
            client_id: "mcp_test".to_string(),
            tokens: TokenSet::default(),
            connected_at: 0,
        }
    }

    #[test]
    fn upsert_replaces_and_remove_repoints_the_active_tenant() {
        let mut vault = PimiaVault::default();
        vault.upsert(tenant("uno"));
        vault.upsert(tenant("dos"));
        vault.active_tenant_id = Some("uno".to_string());
        assert_eq!(vault.tenants.len(), 2);

        let mut updated = tenant("uno");
        updated.client_id = "mcp_rotado".to_string();
        vault.upsert(updated);
        assert_eq!(vault.tenants.len(), 2, "upsert no duplica");
        assert_eq!(vault.find("uno").unwrap().client_id, "mcp_rotado");

        vault.remove("uno");
        assert_eq!(
            vault.active_tenant_id.as_deref(),
            Some("dos"),
            "al desconectar el activo, el puntero se mueve al que queda"
        );
        assert_eq!(vault.active().map(|t| t.id.as_str()), Some("dos"));
    }

    /// El `TokenSet` tiene que sobrevivir al cierre de la app. Esta prueba lo
    /// demuestra contra el llavero **de verdad**: escribe, relee y comprueba que
    /// el refresh rotado sustituye al anterior en vez de acumularse.
    ///
    /// Sigue la convención de `secret_store.rs`: los tests que tocan el llavero
    /// van `#[ignore]` porque en CI el binario no está firmado. En local:
    ///   cargo test --manifest-path desktop/src-tauri/Cargo.toml --lib \
    ///     -- --ignored pimia::vault
    #[ignore = "requiere el llavero real del SO (se corre en local)"]
    #[test]
    fn the_token_set_survives_a_restart_and_the_rotated_refresh_replaces_it() {
        let tenant_id = tenant_id_for("https://vault-test.example.com");
        let mut vault = PimiaVault::default();
        vault.upsert(TenantConnection {
            id: tenant_id.clone(),
            base_url: "https://vault-test.example.com".to_string(),
            label: "vault-test.example.com".to_string(),
            client_id: "mcp_vault_test".to_string(),
            tokens: TokenSet {
                access_token: "access-1".to_string(),
                refresh_token: Some("refresh-1".to_string()),
                expires_at: Some(now_ms() + 600_000),
                scope: Some("customers:read estimates:read".to_string()),
                token_type: Some("bearer".to_string()),
            },
            connected_at: now_ms(),
        });
        vault.active_tenant_id = Some(tenant_id.clone());
        save_vault(&vault).expect("guardar en el llavero");

        // Releer va al llavero, que es lo que hace un arranque nuevo.
        let reloaded = load_vault().expect("releer del llavero");
        let tenant = reloaded
            .find(&tenant_id)
            .expect("el tenant sobrevive al reinicio");
        assert_eq!(tenant.tokens.access_token, "access-1");
        assert_eq!(tenant.tokens.refresh_token.as_deref(), Some("refresh-1"));
        assert_eq!(
            reloaded.active_tenant_id.as_deref(),
            Some(tenant_id.as_str())
        );

        // Un refresco rota el refresh token: el viejo tiene que desaparecer, no
        // quedarse al lado. Reusarlo revocaría el grant entero.
        let mut rotated = reloaded.clone();
        let mut updated = tenant.clone();
        updated.tokens.access_token = "access-2".to_string();
        updated.tokens.refresh_token = Some("refresh-2".to_string());
        rotated.upsert(updated);
        save_vault(&rotated).expect("persistir el conjunto rotado");

        let after = load_vault().expect("releer tras el refresco");
        let tenant = after.find(&tenant_id).expect("sigue ahí");
        assert_eq!(tenant.tokens.access_token, "access-2");
        assert_eq!(tenant.tokens.refresh_token.as_deref(), Some("refresh-2"));
        assert_eq!(after.tenants.len(), 1, "el upsert no duplica la conexión");

        // Limpieza: desconectar deja el vault vacío.
        let mut cleanup = after;
        cleanup.remove(&tenant_id);
        save_vault(&cleanup).expect("limpiar");
        assert!(load_vault()
            .expect("releer limpio")
            .find(&tenant_id)
            .is_none());
    }

    #[test]
    fn active_falls_back_when_the_pointer_is_stale() {
        let mut vault = PimiaVault::default();
        vault.upsert(tenant("uno"));
        vault.active_tenant_id = Some("fantasma".to_string());
        assert_eq!(vault.active().map(|t| t.id.as_str()), Some("uno"));
    }
}
