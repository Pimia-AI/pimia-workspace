//! El proxy autenticado contra `/api/v1` del tenant.
//!
//! Aquí está la parte donde más se equivoca una integración escrita a mano, y
//! por eso vive en un solo sitio:
//!
//! - **El refresh rota.** Cada refresco invalida el anterior y **reusar uno ya
//!   rotado se lee como robo: revoca el grant ENTERO**. Por eso el refresco se
//!   serializa con un candado de proceso y el conjunto nuevo se persiste en el
//!   llavero *antes* de reintentar la petición.
//! - **Un 401 no siempre es «vuelve a autorizar»**: puede ser el access token
//!   caducado. Se refresca una vez y se reintenta; si el refresco también
//!   falla, entonces sí hay que volver a pedir autorización.
//! - **429**: se respeta `Retry-After`.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use crate::pimia::{
    oauth,
    vault::{self, TenantConnection, TokenSet},
};

/// Serializa los refrescos del proceso. Dos peticiones caducadas a la vez
/// canjearían el mismo refresh token, y para el servidor eso es un reuse.
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// El cliente HTTP del ERP, uno por proceso (como `REFRESH_LOCK`: estado del
/// módulo, no de `AppState` — el pool agrupa por host y vale para todos los
/// tenants a la vez).
///
/// No sirve el `http_client` global de la app: está afinado para el relay en
/// localhost (`pool_max_idle_per_host(1)`, idle 10 s), y contra el tenant
/// remoto eso obligaba a pagar el handshake TCP+TLS (~200 ms medidos, RTT
/// ~85 ms) en casi cada navegación. Este pool retiene la conexión y la
/// mantiene viva con pings h2 mientras la app está abierta, de modo que la
/// ráfaga de queries de cada pantalla viaja multiplexada por una conexión ya
/// caliente.
pub(crate) fn http_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            // Como en el cliente global: un tenant de desarrollo va por
            // `http://localhost` y tiene que resolver al loopback IPv4.
            .resolve("localhost", std::net::SocketAddr::from(([127, 0, 0, 1], 0)))
            .pool_idle_timeout(std::time::Duration::from_secs(300))
            .pool_max_idle_per_host(4)
            .http2_keep_alive_interval(std::time::Duration::from_secs(30))
            .http2_keep_alive_while_idle(true)
            .http2_keep_alive_timeout(std::time::Duration::from_secs(10))
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(60);
const MAX_RATE_LIMIT_RETRIES: u32 = 2;
const MAX_RETRY_DELAY_MS: u64 = 30_000;

/// Error de la API en la forma que el frontend puede ramificar sin parsear
/// cadenas. `kind` es lo único de lo que depende la UI.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PimiaApiError {
    /// `unauthorized` | `forbidden` | `notFound` | `rateLimited` |
    /// `validation` | `conflict` | `server` | `network` | `notConnected`
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<u16>,
    pub message: String,
    /// El scope exacto que falta, cuando el tenant lo dice.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing_scope: Option<String>,
}

impl PimiaApiError {
    pub(crate) fn new(kind: &str, message: impl Into<String>) -> Self {
        PimiaApiError {
            kind: kind.to_string(),
            status: None,
            message: message.into(),
            missing_scope: None,
        }
    }
}

impl From<String> for PimiaApiError {
    fn from(message: String) -> Self {
        PimiaApiError::new("network", message)
    }
}

#[derive(Debug, Deserialize, Default)]
pub(crate) struct PimiaRequest {
    #[serde(default)]
    pub method: Option<String>,
    pub path: String,
    #[serde(default)]
    pub query: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub body: Option<serde_json::Value>,
}

/// Devuelve un access token vivo para `tenant_id`, refrescando si hace falta.
///
/// Todo el ciclo leer-refrescar-guardar ocurre bajo el candado: es lo que evita
/// que dos peticiones concurrentes canjeen el mismo refresh token.
async fn ensure_access_token(
    client: &reqwest::Client,
    tenant_id: &str,
) -> Result<(TenantConnection, String), PimiaApiError> {
    let _guard = REFRESH_LOCK.lock().await;

    let mut store = vault::load_vault()?;
    let tenant = store
        .find(tenant_id)
        .cloned()
        .ok_or_else(|| PimiaApiError::new("notConnected", "no hay conexión con ese tenant"))?;

    if !tenant.tokens.is_expired(vault::now_ms()) {
        let access_token = tenant.tokens.access_token.clone();
        return Ok((tenant, access_token));
    }

    let refreshed = refresh_locked(client, &tenant).await?;
    let mut updated = tenant.clone();
    updated.tokens = refreshed;
    store.upsert(updated.clone());
    vault::save_vault(&store)?;

    let access_token = updated.tokens.access_token.clone();
    Ok((updated, access_token))
}

/// Refresca asumiendo que quien llama ya tiene el candado.
async fn refresh_locked(
    client: &reqwest::Client,
    tenant: &TenantConnection,
) -> Result<TokenSet, PimiaApiError> {
    let refresh_token = tenant.tokens.refresh_token.as_deref().ok_or_else(|| {
        PimiaApiError::new(
            "unauthorized",
            "el acceso caducó y no hay refresh token: vuelve a conectar el tenant",
        )
    })?;

    let metadata = oauth::fetch_metadata(client, &tenant.base_url).await?;
    oauth::refresh_tokens(client, &metadata, &tenant.client_id, refresh_token)
        .await
        .map_err(|error| {
            // Un refresco fallido significa siempre lo mismo para quien llama:
            // este grant ya no vale (el usuario revocó la app, el refresh
            // caducó, o se reusó uno rotado). Se traduce a `unauthorized` para
            // que la UI ofrezca reconectar en vez de enseñar un error de red.
            PimiaApiError::new(
                "unauthorized",
                format!("no se pudo refrescar el acceso: {error}"),
            )
        })
}

/// Fuerza un refresco y lo persiste. Se usa tras un 401.
async fn refresh_and_persist(
    client: &reqwest::Client,
    tenant_id: &str,
) -> Result<String, PimiaApiError> {
    let _guard = REFRESH_LOCK.lock().await;

    let mut store = vault::load_vault()?;
    let tenant = store
        .find(tenant_id)
        .cloned()
        .ok_or_else(|| PimiaApiError::new("notConnected", "no hay conexión con ese tenant"))?;

    let refreshed = refresh_locked(client, &tenant).await?;
    let access_token = refreshed.access_token.clone();
    let mut updated = tenant;
    updated.tokens = refreshed;
    store.upsert(updated);
    vault::save_vault(&store)?;

    Ok(access_token)
}

pub(crate) async fn request(
    client: &reqwest::Client,
    tenant_id: &str,
    input: PimiaRequest,
) -> Result<serde_json::Value, PimiaApiError> {
    let token_started = std::time::Instant::now();
    let (tenant, mut access_token) = ensure_access_token(client, tenant_id).await?;
    let token_elapsed = token_started.elapsed();
    let url = build_url(&tenant.base_url, &input.path, input.query.as_ref())?;
    let method = parse_method(input.method.as_deref())?;

    let mut refreshed_on_401 = false;
    let mut rate_limit_attempts = 0;

    loop {
        let mut builder = client
            .request(method.clone(), url.clone())
            .header(reqwest::header::ACCEPT, "application/json")
            .bearer_auth(&access_token)
            .timeout(REQUEST_TIMEOUT);
        if let Some(body) = input.body.as_ref() {
            builder = builder.json(body);
        }

        let http_started = std::time::Instant::now();
        let response = builder.send().await.map_err(|error| {
            PimiaApiError::new("network", format!("Pimia no respondió: {error}"))
        })?;
        log_timing(
            &method,
            &url,
            &response,
            token_elapsed,
            http_started.elapsed(),
        );

        let status = response.status();
        if status.is_success() {
            return parse_success_body(response).await;
        }

        let retry_after = retry_after_seconds(&response);
        let body = response.text().await.unwrap_or_default();

        if status == reqwest::StatusCode::UNAUTHORIZED && !refreshed_on_401 {
            refreshed_on_401 = true;
            access_token = refresh_and_persist(client, tenant_id).await?;
            continue;
        }

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS
            && rate_limit_attempts < MAX_RATE_LIMIT_RETRIES
        {
            rate_limit_attempts += 1;
            tokio::time::sleep(std::time::Duration::from_millis(retry_delay_ms(
                retry_after,
                rate_limit_attempts,
            )))
            .await;
            continue;
        }

        return Err(classify_error(status, &body));
    }
}

/// Tiempos por petición, opt-in con `PIMIA_TIMING=1` en el entorno (stderr).
///
/// `token` es lo que costó materializar el access token (llavero + candado, y
/// el refresco entero si tocaba); `http` es solo el viaje de esta petición.
/// La versión dice si el tenant negoció h2. Se imprime el path sin la query:
/// la query puede llevar términos de búsqueda del usuario.
fn log_timing(
    method: &reqwest::Method,
    url: &url::Url,
    response: &reqwest::Response,
    token_elapsed: std::time::Duration,
    http_elapsed: std::time::Duration,
) {
    if std::env::var_os("PIMIA_TIMING").is_none() {
        return;
    }
    eprintln!(
        "pimia-timing: {method} {path} -> {status} {version:?} token={token_ms}ms http={http_ms}ms",
        path = url.path(),
        status = response.status().as_u16(),
        version = response.version(),
        token_ms = token_elapsed.as_millis(),
        http_ms = http_elapsed.as_millis(),
    );
}

async fn parse_success_body(
    response: reqwest::Response,
) -> Result<serde_json::Value, PimiaApiError> {
    if response.status() == reqwest::StatusCode::NO_CONTENT {
        return Ok(serde_json::Value::Null);
    }

    let text = response
        .text()
        .await
        .map_err(|error| PimiaApiError::new("network", format!("respuesta ilegible: {error}")))?;
    if text.is_empty() {
        return Ok(serde_json::Value::Null);
    }

    serde_json::from_str(&text)
        .map_err(|error| PimiaApiError::new("server", format!("respuesta no era JSON: {error}")))
}

fn parse_method(method: Option<&str>) -> Result<reqwest::Method, PimiaApiError> {
    match method.unwrap_or("GET").to_ascii_uppercase().as_str() {
        "GET" => Ok(reqwest::Method::GET),
        "POST" => Ok(reqwest::Method::POST),
        "PUT" => Ok(reqwest::Method::PUT),
        "PATCH" => Ok(reqwest::Method::PATCH),
        "DELETE" => Ok(reqwest::Method::DELETE),
        other => Err(PimiaApiError::new(
            "validation",
            format!("método HTTP no admitido: {other}"),
        )),
    }
}

/// `/customers` y `/api/v1/customers` son lo mismo, igual que en el SDK.
pub(crate) fn build_url(
    base_url: &str,
    path: &str,
    query: Option<&HashMap<String, serde_json::Value>>,
) -> Result<url::Url, PimiaApiError> {
    let clean = path
        .trim_start_matches('/')
        .trim_start_matches("api/v1")
        .trim_start_matches('/');
    let mut url = url::Url::parse(&format!("{base_url}/api/v1/{clean}"))
        .map_err(|error| PimiaApiError::new("validation", format!("ruta inválida: {error}")))?;

    if let Some(query) = query {
        let mut pairs = url.query_pairs_mut();
        // Orden estable: los `HashMap` de serde no lo tienen, y una URL que
        // cambia de forma entre llamadas rompe cachés y hace ilegible un log.
        let mut keys: Vec<&String> = query.keys().collect();
        keys.sort();
        for key in keys {
            match &query[key] {
                serde_json::Value::Null => {}
                serde_json::Value::Array(items) => {
                    for item in items {
                        if let Some(rendered) = render_scalar(item) {
                            pairs.append_pair(&format!("{key}[]"), &rendered);
                        }
                    }
                }
                value => {
                    if let Some(rendered) = render_scalar(value) {
                        pairs.append_pair(key, &rendered);
                    }
                }
            }
        }
    }

    Ok(url)
}

fn render_scalar(value: &serde_json::Value) -> Option<String> {
    match value {
        serde_json::Value::Null => None,
        serde_json::Value::String(text) => Some(text.clone()),
        serde_json::Value::Bool(flag) => Some(flag.to_string()),
        serde_json::Value::Number(number) => Some(number.to_string()),
        other => Some(other.to_string()),
    }
}

fn retry_after_seconds(response: &reqwest::Response) -> Option<u64> {
    response
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?
        .parse()
        .ok()
}

fn retry_delay_ms(retry_after: Option<u64>, attempt: u32) -> u64 {
    let base = match retry_after {
        Some(seconds) => seconds.saturating_mul(1_000),
        None => 500u64.saturating_mul(1 << attempt.min(6)),
    };
    base.min(MAX_RETRY_DELAY_MS)
}

/// El scope que falta, sacado del mensaje cuando no viene en un campo propio.
///
/// ⚠️ **El guard de la API no manda `missing_scope`.** Deniega con el cuerpo
/// `{"message": "Token lacks the invoices:write scope"}` y nada más
/// (así lo emite el guard de scopes del núcleo; comprobado: no hay un solo
/// `missing_scope` en toda su base de código). Sin este rescate, `missingScope` llegaba
/// siempre vacío al frontend y `PimiaErrorState` nunca llegaba a ofrecer
/// «Volver a autorizar», que es justo la única salida de un scope que falta.
///
/// Se reconoce esa forma exacta y nada más: inventar un scope a partir de
/// cualquier mensaje sería peor que no tenerlo.
fn scope_from_message(message: &str) -> Option<String> {
    let scope = message
        .strip_prefix("Token lacks the ")?
        .strip_suffix(" scope")?
        .trim();

    // Un scope es `dominio:acción`, sin espacios. Cualquier otra cosa es un
    // mensaje que solo se le parece.
    if scope.is_empty() || scope.contains(char::is_whitespace) || !scope.contains(':') {
        return None;
    }

    Some(scope.to_string())
}

/// Traduce el error del tenant a algo que la UI pueda ramificar.
pub(crate) fn classify_error(status: reqwest::StatusCode, body: &str) -> PimiaApiError {
    let parsed = serde_json::from_str::<serde_json::Value>(body).ok();
    let message = parsed
        .as_ref()
        .and_then(|value| {
            value
                .get("message")
                .or_else(|| value.get("error_description"))
                .or_else(|| value.get("error"))
        })
        .and_then(serde_json::Value::as_str)
        .unwrap_or("Pimia devolvió un error")
        .to_string();
    let missing_scope = parsed
        .as_ref()
        .and_then(|value| value.get("missing_scope").or_else(|| value.get("scope")))
        .and_then(serde_json::Value::as_str)
        .map(str::to_string)
        .or_else(|| scope_from_message(&message));

    let kind = match status.as_u16() {
        401 => "unauthorized",
        403 => "forbidden",
        404 => "notFound",
        409 => "conflict",
        422 => "validation",
        429 => "rateLimited",
        status if status >= 500 => "server",
        _ => "validation",
    };

    PimiaApiError {
        kind: kind.to_string(),
        status: Some(status.as_u16()),
        message,
        missing_scope,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn query(pairs: &[(&str, serde_json::Value)]) -> HashMap<String, serde_json::Value> {
        pairs
            .iter()
            .map(|(key, value)| ((*key).to_string(), value.clone()))
            .collect()
    }

    #[test]
    fn path_prefix_is_optional_and_never_doubled() {
        let base = "https://demo.example.com";
        for path in [
            "/customers",
            "customers",
            "/api/v1/customers",
            "api/v1/customers",
        ] {
            assert_eq!(
                build_url(base, path, None).unwrap().as_str(),
                "https://demo.example.com/api/v1/customers",
                "ruta {path}"
            );
        }
    }

    #[test]
    fn query_drops_nulls_repeats_arrays_and_is_ordered() {
        let url = build_url(
            "https://demo.example.com",
            "/customers",
            Some(&query(&[
                ("page", serde_json::json!(2)),
                ("search", serde_json::json!("acme s.l.")),
                ("ignorado", serde_json::Value::Null),
                ("status", serde_json::json!(["DRAFT", "SENT"])),
            ])),
        )
        .unwrap();

        assert_eq!(
            url.query().unwrap(),
            "page=2&search=acme+s.l.&status%5B%5D=DRAFT&status%5B%5D=SENT"
        );
    }

    #[test]
    fn only_known_methods_pass() {
        assert_eq!(parse_method(None).unwrap(), reqwest::Method::GET);
        assert_eq!(parse_method(Some("post")).unwrap(), reqwest::Method::POST);
        assert!(parse_method(Some("TRACE")).is_err());
    }

    #[test]
    fn statuses_map_to_kinds_the_ui_can_branch_on() {
        assert_eq!(
            classify_error(reqwest::StatusCode::UNAUTHORIZED, "{}").kind,
            "unauthorized"
        );
        assert_eq!(
            classify_error(reqwest::StatusCode::UNPROCESSABLE_ENTITY, "{}").kind,
            "validation"
        );
        assert_eq!(
            classify_error(reqwest::StatusCode::INTERNAL_SERVER_ERROR, "{}").kind,
            "server"
        );
        assert_eq!(
            classify_error(reqwest::StatusCode::TOO_MANY_REQUESTS, "{}").kind,
            "rateLimited"
        );
    }

    #[test]
    fn missing_scope_is_surfaced_verbatim() {
        let error = classify_error(
            reqwest::StatusCode::FORBIDDEN,
            r#"{"message":"falta permiso","missing_scope":"estimates:write"}"#,
        );
        assert_eq!(error.kind, "forbidden");
        assert_eq!(error.message, "falta permiso");
        assert_eq!(error.missing_scope.as_deref(), Some("estimates:write"));
    }

    #[test]
    fn the_scope_is_rescued_from_the_message_the_guard_actually_sends() {
        // La forma real de una denegación de scope: solo `message`.
        let error = classify_error(
            reqwest::StatusCode::FORBIDDEN,
            r#"{"message":"Token lacks the invoices:write scope"}"#,
        );
        assert_eq!(error.kind, "forbidden");
        assert_eq!(error.missing_scope.as_deref(), Some("invoices:write"));
    }

    #[test]
    fn a_403_that_is_not_about_scopes_invents_none() {
        for body in [
            r#"{"message":"This action is unauthorized."}"#,
            r#"{"message":"Token lacks the  scope"}"#,
            r#"{"message":"Token lacks the permission to do that scope"}"#,
            r#"{"message":"Token lacks the invoices scope"}"#,
        ] {
            assert_eq!(
                classify_error(reqwest::StatusCode::FORBIDDEN, body).missing_scope,
                None,
                "cuerpo {body}"
            );
        }
    }

    #[test]
    fn a_non_json_error_body_never_leaks_into_the_message() {
        let error = classify_error(
            reqwest::StatusCode::INTERNAL_SERVER_ERROR,
            "<html>stack trace con datos</html>",
        );
        assert_eq!(error.message, "Pimia devolvió un error");
    }

    #[test]
    fn retry_after_is_respected_and_capped() {
        assert_eq!(retry_delay_ms(Some(3), 1), 3_000);
        assert_eq!(retry_delay_ms(Some(600), 1), MAX_RETRY_DELAY_MS);
        assert_eq!(retry_delay_ms(None, 1), 1_000);
        assert_eq!(retry_delay_ms(None, 2), 2_000);
    }
}
