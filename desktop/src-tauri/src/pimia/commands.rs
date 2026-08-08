//! Los comandos que ve el webview.
//!
//! Todo lo que cruza esta frontera son **datos de negocio o estado de la
//! conexión**: el `TokenSet` no sale nunca del proceso Rust. Por eso
//! [`PimiaTenantSummary`] lleva scopes y caducidad pero ningún token.

use serde::{Deserialize, Serialize};
use tauri::{Emitter as _, Manager as _};
use tauri_plugin_opener::OpenerExt as _;

use crate::pimia::{
    api::{self, PimiaApiError, PimiaRequest},
    login::{self, LoginPhase, PimiaLoginState},
    oauth,
    vault::{self, TenantConnection},
};

/// Evento que se emite cada vez que cambia el estado de conexión, para que
/// cualquier ventana abierta se entere sin sondear.
const AUTH_CHANGED_EVENT: &str = "pimia-auth-changed";

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PimiaTenantSummary {
    pub id: String,
    pub base_url: String,
    pub label: String,
    pub scopes: Vec<String>,
    pub connected_at: i64,
    pub expires_at: Option<i64>,
    /// Sin refresh token, la sesión muere al caducar el access token y hay que
    /// volver a autorizar. La UI lo avisa.
    pub has_refresh_token: bool,
}

impl From<&TenantConnection> for PimiaTenantSummary {
    fn from(tenant: &TenantConnection) -> Self {
        PimiaTenantSummary {
            id: tenant.id.clone(),
            base_url: tenant.base_url.clone(),
            label: tenant.label.clone(),
            scopes: tenant
                .tokens
                .scope
                .as_deref()
                .unwrap_or_default()
                .split_whitespace()
                .map(str::to_string)
                .collect(),
            connected_at: tenant.connected_at,
            expires_at: tenant.tokens.expires_at,
            has_refresh_token: tenant.tokens.refresh_token.is_some(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PimiaAuthStatus {
    pub tenants: Vec<PimiaTenantSummary>,
    pub active_tenant_id: Option<String>,
}

fn status_from(store: &vault::PimiaVault) -> PimiaAuthStatus {
    PimiaAuthStatus {
        tenants: store.tenants.iter().map(PimiaTenantSummary::from).collect(),
        active_tenant_id: store.active().map(|tenant| tenant.id.clone()),
    }
}

fn read_status() -> Result<PimiaAuthStatus, String> {
    Ok(status_from(&vault::load_vault()?))
}

fn announce(app: &tauri::AppHandle, status: &PimiaAuthStatus) {
    let _ = app.emit(AUTH_CHANGED_EVENT, status);
}

#[tauri::command]
pub(crate) fn pimia_auth_status() -> Result<PimiaAuthStatus, String> {
    read_status()
}

#[tauri::command]
pub(crate) fn pimia_set_active_tenant(
    app: tauri::AppHandle,
    tenant_id: String,
) -> Result<PimiaAuthStatus, String> {
    let mut store = vault::load_vault()?;
    if store.find(&tenant_id).is_none() {
        return Err("ese tenant no está conectado".to_string());
    }

    store.active_tenant_id = Some(tenant_id);
    vault::save_vault(&store)?;

    let status = status_from(&store);
    announce(&app, &status);
    Ok(status)
}

/// Cancela la autorización en vuelo, si la hay.
#[tauri::command]
pub(crate) fn pimia_cancel_connect(login: tauri::State<'_, PimiaLoginState>) -> bool {
    login.cancel()
}

/// En qué punto está la autorización.
///
/// La UI no puede fiarse solo de su promesa de `invoke`: si el webview se
/// recarga a media invocación, el callback se pierde y el spinner no termina
/// nunca. Preguntando la fase puede decir «esto ya no está en marcha».
#[tauri::command]
pub(crate) fn pimia_connect_phase(login: tauri::State<'_, PimiaLoginState>) -> LoginPhase {
    login.phase()
}

/// Desconecta un tenant: **revoca primero, borra después**.
///
/// La revocación con el refresh token tumba el grant entero en el servidor. Si
/// falla (sin red, por ejemplo) se borra igual la copia local: dejar tokens en
/// el llavero de un tenant que el usuario ha dicho que quiere fuera es peor que
/// dejar un grant vivo que caducará solo.
#[tauri::command]
pub(crate) async fn pimia_disconnect_tenant(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, crate::app_state::AppState>,
    tenant_id: String,
) -> Result<PimiaAuthStatus, String> {
    let mut store = vault::load_vault()?;
    let Some(tenant) = store.remove(&tenant_id) else {
        return Ok(status_from(&store));
    };

    vault::save_vault(&store)?;
    let status = status_from(&store);
    announce(&app, &status);

    let client = app_state.http_client.clone();
    if let Some(refresh_token) = tenant.tokens.refresh_token.as_deref() {
        if let Ok(metadata) = oauth::fetch_metadata(&client, &tenant.base_url).await {
            if let Err(error) =
                oauth::revoke_token(&client, &metadata, &tenant.client_id, refresh_token).await
            {
                eprintln!("pimia: no se pudo revocar el grant al desconectar: {error}");
            }
        }
    }

    Ok(status)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectTenantInput {
    pub base_url: String,
}

/// La ceremonia completa: metadata → registro → navegador del sistema →
/// callback → canje → llavero.
#[tauri::command]
pub(crate) async fn pimia_connect_tenant(
    app: tauri::AppHandle,
    app_state: tauri::State<'_, crate::app_state::AppState>,
    login: tauri::State<'_, PimiaLoginState>,
    input: ConnectTenantInput,
) -> Result<PimiaAuthStatus, String> {
    let base_url = vault::normalize_base_url(&input.base_url)?;
    let client = app_state.http_client.clone();
    let metadata = oauth::fetch_metadata(&client, &base_url).await?;
    let scopes = oauth::negotiate_scopes(&metadata);

    let tenant_id = vault::tenant_id_for(&base_url);
    let store = vault::load_vault()?;
    // Reconectar un tenant conocido reutiliza su client: registrar otro dejaría
    // clients huérfanos acumulándose en el tenant a cada reconexión.
    let client_id = match store.find(&tenant_id) {
        Some(existing) => existing.client_id.clone(),
        None => {
            oauth::register_client(&client, &metadata, &login::redirect_uris(), &scopes).await?
        }
    };

    // El loopback es el camino por defecto porque funciona también en
    // desarrollo; el esquema propio queda de respaldo (ver `login.rs`).
    let loopback = login::start_loopback_callback(app.clone()).await;
    let redirect_uri = loopback
        .as_ref()
        .map(|callback| callback.redirect_uri.clone())
        .unwrap_or_else(|| login::DEEP_LINK_REDIRECT_URI.to_string());

    let pkce = oauth::create_pkce_challenge();
    let oauth_state = oauth::create_state();
    let channels = login.begin(&oauth_state);

    let authorize_url = oauth::build_authorize_url(
        &metadata,
        &client_id,
        &redirect_uri,
        &scopes,
        &oauth_state,
        &pkce,
    )?;

    if let Err(error) = app.opener().open_url(authorize_url.as_str(), None::<&str>) {
        login.settle(&oauth_state);
        return Err(format!("no se pudo abrir el navegador: {error}"));
    }

    // Desde aquí hay que dejar la fase en reposo **en toda salida**: si se queda
    // en `exchanging` y el webview se recargó, la UI seguiría creyendo que la
    // autorización sigue viva.
    let code = login::await_authorization_code(channels).await;
    drop(loopback);
    let code = match code {
        Ok(code) => code,
        Err(error) => {
            login.settle(&oauth_state);
            return Err(error);
        }
    };

    let tokens = match oauth::exchange_code(
        &client,
        &metadata,
        &client_id,
        &redirect_uri,
        &code,
        &pkce.verifier,
    )
    .await
    {
        Ok(tokens) => tokens,
        Err(error) => {
            login.settle(&oauth_state);
            return Err(error);
        }
    };

    // Se relee el vault en vez de reusar el de arriba: entre la apertura del
    // navegador y la vuelta del usuario pueden haber pasado minutos, y otra
    // ventana pudo tocar el llavero.
    //
    // Un fallo del llavero a partir de aquí es lo más caro del flujo: el grant
    // ya existe en el tenant pero no se puede guardar. El mensaje tiene que
    // decir qué hacer, porque la causa típica es un aviso del llavero denegado.
    let persist = (|| -> Result<vault::PimiaVault, String> {
        let mut store = vault::load_vault()?;
        store.upsert(TenantConnection {
            id: tenant_id.clone(),
            base_url: base_url.clone(),
            label: vault::tenant_label_for(&base_url),
            client_id,
            tokens,
            connected_at: vault::now_ms(),
        });
        store.active_tenant_id = Some(tenant_id);
        vault::save_vault(&store)?;
        Ok(store)
    })();

    login.settle(&oauth_state);

    let store = persist.map_err(|error| {
        format!(
            "se autorizó el acceso pero no se pudo guardar en el llavero \
             ({error}). Si el sistema pidió permiso, hay que concederlo \
             («Permitir siempre») y volver a conectar."
        )
    })?;

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
    }

    let status = status_from(&store);
    announce(&app, &status);
    Ok(status)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ApiRequestInput {
    /// Sin tenant explícito se usa el activo.
    #[serde(default)]
    pub tenant_id: Option<String>,
    #[serde(flatten)]
    pub request: PimiaRequest,
}

#[tauri::command]
pub(crate) async fn pimia_api_request(
    app_state: tauri::State<'_, crate::app_state::AppState>,
    input: ApiRequestInput,
) -> Result<serde_json::Value, PimiaApiError> {
    let tenant_id = match input.tenant_id {
        Some(tenant_id) => tenant_id,
        None => vault::load_vault()?
            .active()
            .map(|tenant| tenant.id.clone())
            .ok_or_else(|| {
                PimiaApiError::new("notConnected", "conecta un tenant de Pimia para empezar")
            })?,
    };

    let client = app_state.http_client.clone();
    api::request(&client, &tenant_id, input.request).await
}
