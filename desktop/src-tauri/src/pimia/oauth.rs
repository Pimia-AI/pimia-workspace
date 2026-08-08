//! La ceremonia OAuth 2.0 contra el Authorization Server de un tenant.
//!
//! Un tenant = un AS (`https://<tenant>/oauth/*`) y **un token vale solo para
//! ese tenant**. La app es un **client público**: no hay secreto que guardar en
//! un binario que el usuario tiene en su disco, así que PKCE S256 es
//! obligatorio (RFC 7636) y el `token_endpoint_auth_method` es `none`.
//!
//! El `client_id` no viene cableado: se pide al vuelo con el registro dinámico
//! de RFC 7591 (`registration_endpoint` sale en la metadata del AS). Eso evita
//! tener que dar de alta a mano un client por tenant, y es lo que permite que
//! el `redirect_uri` sea exactamente el que la app va a usar.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::pimia::vault::TokenSet;

/// Los permisos que pide el workspace. Mínimo indispensable para el corte
/// vertical de la Fase 1 (clientes → detalle → presupuestos); cada módulo
/// nuevo añade el suyo aquí y el usuario lo ve en la pantalla de consentimiento.
pub(crate) const REQUESTED_SCOPES: &[&str] = &[
    "customers:read",
    "estimates:read",
    "estimates:write",
    "items:read",
];

const REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);

/// Metadata del AS (RFC 8414).
#[derive(Clone, Debug, Deserialize)]
pub(crate) struct AuthorizationServerMetadata {
    pub authorization_endpoint: String,
    pub token_endpoint: String,
    #[serde(default)]
    pub registration_endpoint: Option<String>,
    #[serde(default)]
    pub revocation_endpoint: Option<String>,
    #[serde(default)]
    pub scopes_supported: Option<Vec<String>>,
}

#[derive(Clone, Debug)]
pub(crate) struct PkceChallenge {
    pub verifier: String,
    pub challenge: String,
}

/// PKCE S256. Liga el código de autorización a quien lo pidió: sin el verifier,
/// un código interceptado (por ejemplo por otra app registrada en el mismo
/// esquema) no se puede canjear.
pub(crate) fn create_pkce_challenge() -> PkceChallenge {
    let verifier = URL_SAFE_NO_PAD.encode(random_bytes::<32>());
    let challenge = URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));

    PkceChallenge {
        verifier,
        challenge,
    }
}

/// `state` anti-CSRF. Se compara al volver del callback.
pub(crate) fn create_state() -> String {
    URL_SAFE_NO_PAD.encode(random_bytes::<16>())
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    getrandom::getrandom(&mut bytes).expect("la fuente de entropía del SO falló");
    bytes
}

pub(crate) async fn fetch_metadata(
    client: &reqwest::Client,
    base_url: &str,
) -> Result<AuthorizationServerMetadata, String> {
    let url = format!("{base_url}/.well-known/oauth-authorization-server");
    let response = client
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/json")
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("no se pudo contactar con el tenant: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "el tenant no expone metadata OAuth (HTTP {}). ¿Es la dirección correcta?",
            response.status()
        ));
    }

    response
        .json()
        .await
        .map_err(|error| format!("metadata OAuth del tenant ilegible: {error}"))
}

#[derive(Debug, Serialize)]
struct RegistrationRequest<'a> {
    client_name: &'a str,
    redirect_uris: &'a [String],
    grant_types: [&'a str; 2],
    response_types: [&'a str; 1],
    token_endpoint_auth_method: &'a str,
    scope: String,
}

#[derive(Debug, Deserialize)]
struct RegistrationResponse {
    client_id: String,
}

/// Da de alta la app en el tenant como client público (RFC 7591).
///
/// Se registran **todas** las URIs de retorno posibles de una vez —el esquema
/// propio y los puertos de loopback— para no tener que volver a registrar
/// cuando cambia el transporte del callback.
pub(crate) async fn register_client(
    client: &reqwest::Client,
    metadata: &AuthorizationServerMetadata,
    redirect_uris: &[String],
    scopes: &[&str],
) -> Result<String, String> {
    let endpoint = metadata.registration_endpoint.as_deref().ok_or_else(|| {
        "el tenant no admite registro dinámico de clients; hay que dar de alta la app a mano"
            .to_string()
    })?;

    let response = client
        .post(endpoint)
        .header(reqwest::header::ACCEPT, "application/json")
        .json(&RegistrationRequest {
            client_name: "Pimia Workspace",
            redirect_uris,
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            token_endpoint_auth_method: "none",
            scope: scopes.join(" "),
        })
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("no se pudo registrar la app en el tenant: {error}"))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "el tenant rechazó el registro de la app (HTTP {status}): {}",
            describe_oauth_error(&body)
        ));
    }

    serde_json::from_str::<RegistrationResponse>(&body)
        .map(|registration| registration.client_id)
        .map_err(|error| format!("respuesta de registro ilegible: {error}"))
}

/// Los scopes que se van a pedir: la intersección con lo que el AS declara
/// soportar, para que un tenant sin un módulo no tumbe la autorización entera.
pub(crate) fn negotiate_scopes(metadata: &AuthorizationServerMetadata) -> Vec<&'static str> {
    let Some(supported) = metadata.scopes_supported.as_ref() else {
        return REQUESTED_SCOPES.to_vec();
    };

    let negotiated: Vec<&'static str> = REQUESTED_SCOPES
        .iter()
        .copied()
        .filter(|scope| supported.iter().any(|entry| entry == scope))
        .collect();

    if negotiated.is_empty() {
        REQUESTED_SCOPES.to_vec()
    } else {
        negotiated
    }
}

pub(crate) fn build_authorize_url(
    metadata: &AuthorizationServerMetadata,
    client_id: &str,
    redirect_uri: &str,
    scopes: &[&str],
    state: &str,
    pkce: &PkceChallenge,
) -> Result<String, String> {
    let mut url = url::Url::parse(&metadata.authorization_endpoint)
        .map_err(|error| format!("authorization_endpoint inválido: {error}"))?;
    url.query_pairs_mut()
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("response_type", "code")
        .append_pair("scope", &scopes.join(" "))
        .append_pair("state", state)
        .append_pair("code_challenge", &pkce.challenge)
        .append_pair("code_challenge_method", "S256");

    Ok(url.to_string())
}

pub(crate) async fn exchange_code(
    client: &reqwest::Client,
    metadata: &AuthorizationServerMetadata,
    client_id: &str,
    redirect_uri: &str,
    code: &str,
    verifier: &str,
) -> Result<TokenSet, String> {
    token_request(
        client,
        &metadata.token_endpoint,
        &[
            ("grant_type", "authorization_code"),
            ("client_id", client_id),
            ("redirect_uri", redirect_uri),
            ("code", code),
            ("code_verifier", verifier),
        ],
    )
    .await
}

/// Refresco **con rotación**: el refresh que se manda queda invalidado y el
/// `TokenSet` devuelto trae uno nuevo. Hay que persistirlo antes de volver a
/// llamar a la API — reusar el viejo revoca el grant entero.
pub(crate) async fn refresh_tokens(
    client: &reqwest::Client,
    metadata: &AuthorizationServerMetadata,
    client_id: &str,
    refresh_token: &str,
) -> Result<TokenSet, String> {
    token_request(
        client,
        &metadata.token_endpoint,
        &[
            ("grant_type", "refresh_token"),
            ("client_id", client_id),
            ("refresh_token", refresh_token),
        ],
    )
    .await
}

/// Revocación RFC 7009. Con un refresh token cae el grant ENTERO, que es
/// justo lo que se quiere al desconectar un tenant.
pub(crate) async fn revoke_token(
    client: &reqwest::Client,
    metadata: &AuthorizationServerMetadata,
    client_id: &str,
    token: &str,
) -> Result<(), String> {
    let Some(endpoint) = metadata.revocation_endpoint.as_deref() else {
        return Ok(());
    };

    let response = client
        .post(endpoint)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .header(reqwest::header::ACCEPT, "application/json")
        .body(form_body(&[("client_id", client_id), ("token", token)]))
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("no se pudo revocar el token: {error}"))?;

    if response.status().is_success() {
        Ok(())
    } else {
        Err(format!(
            "el tenant rechazó la revocación (HTTP {})",
            response.status()
        ))
    }
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_in: Option<i64>,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    token_type: Option<String>,
}

async fn token_request(
    client: &reqwest::Client,
    token_endpoint: &str,
    params: &[(&str, &str)],
) -> Result<TokenSet, String> {
    let response = client
        .post(token_endpoint)
        .header(
            reqwest::header::CONTENT_TYPE,
            "application/x-www-form-urlencoded",
        )
        .header(reqwest::header::ACCEPT, "application/json")
        .body(form_body(params))
        .timeout(REQUEST_TIMEOUT)
        .send()
        .await
        .map_err(|error| format!("el token endpoint del tenant no respondió: {error}"))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "el tenant rechazó la petición de token (HTTP {status}): {}",
            describe_oauth_error(&body)
        ));
    }

    let parsed: TokenResponse = serde_json::from_str(&body)
        .map_err(|error| format!("respuesta del token endpoint ilegible: {error}"))?;

    Ok(TokenSet {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_at: parsed
            .expires_in
            .map(|seconds| crate::pimia::vault::now_ms() + seconds * 1_000),
        scope: parsed.scope,
        token_type: parsed.token_type.or_else(|| Some("bearer".to_string())),
    })
}

fn form_body(params: &[(&str, &str)]) -> String {
    let mut serializer = url::form_urlencoded::Serializer::new(String::new());
    for (key, value) in params {
        serializer.append_pair(key, value);
    }
    serializer.finish()
}

/// Saca el `error_description`/`error` de una respuesta OAuth para que el
/// mensaje que ve el usuario diga algo. Nunca devuelve el cuerpo entero: puede
/// traer material sensible.
fn describe_oauth_error(body: &str) -> String {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(body) else {
        return "el tenant no dio detalle".to_string();
    };

    value
        .get("error_description")
        .or_else(|| value.get("error"))
        .and_then(serde_json::Value::as_str)
        .unwrap_or("el tenant no dio detalle")
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn metadata(scopes: Option<Vec<&str>>) -> AuthorizationServerMetadata {
        AuthorizationServerMetadata {
            authorization_endpoint: "https://sdkdemo.taskai.work/oauth/authorize".to_string(),
            token_endpoint: "https://sdkdemo.taskai.work/oauth/token".to_string(),
            registration_endpoint: Some("https://sdkdemo.taskai.work/oauth/register".to_string()),
            revocation_endpoint: Some("https://sdkdemo.taskai.work/oauth/revoke".to_string()),
            scopes_supported: scopes
                .map(|list| list.into_iter().map(str::to_string).collect::<Vec<_>>()),
        }
    }

    #[test]
    fn pkce_challenge_is_the_url_safe_sha256_of_the_verifier() {
        let pkce = create_pkce_challenge();
        let expected = URL_SAFE_NO_PAD.encode(Sha256::digest(pkce.verifier.as_bytes()));
        assert_eq!(pkce.challenge, expected);
        // 32 bytes en base64url sin relleno.
        assert_eq!(pkce.verifier.len(), 43);
        assert!(!pkce.verifier.contains('+') && !pkce.verifier.contains('/'));
    }

    #[test]
    fn two_challenges_never_repeat() {
        assert_ne!(
            create_pkce_challenge().verifier,
            create_pkce_challenge().verifier
        );
        assert_ne!(create_state(), create_state());
    }

    #[test]
    fn authorize_url_carries_pkce_and_state() {
        let pkce = create_pkce_challenge();
        let url = build_authorize_url(
            &metadata(None),
            "mcp_demo",
            "pimia-workspace://oauth/callback",
            &["customers:read", "estimates:read"],
            "abc123",
            &pkce,
        )
        .expect("authorize url");
        let parsed = url::Url::parse(&url).expect("url válida");
        let query: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();

        assert_eq!(query.get("client_id").map(String::as_str), Some("mcp_demo"));
        assert_eq!(query.get("response_type").map(String::as_str), Some("code"));
        assert_eq!(
            query.get("code_challenge_method").map(String::as_str),
            Some("S256")
        );
        assert_eq!(
            query.get("code_challenge").map(String::as_str),
            Some(pkce.challenge.as_str())
        );
        assert_eq!(query.get("state").map(String::as_str), Some("abc123"));
        assert_eq!(
            query.get("scope").map(String::as_str),
            Some("customers:read estimates:read")
        );
        assert_eq!(
            query.get("redirect_uri").map(String::as_str),
            Some("pimia-workspace://oauth/callback")
        );
    }

    #[test]
    fn scopes_are_negotiated_against_what_the_tenant_supports() {
        let supported = metadata(Some(vec!["customers:read", "estimates:read", "mcp"]));
        assert_eq!(
            negotiate_scopes(&supported),
            vec!["customers:read", "estimates:read"]
        );

        // Sin `scopes_supported` se piden todos: no hay con qué filtrar.
        assert_eq!(negotiate_scopes(&metadata(None)), REQUESTED_SCOPES.to_vec());

        // Si no hay intersección, mejor pedirlos todos y que el AS explique el
        // rechazo, que mandar una autorización con `scope` vacío.
        assert_eq!(
            negotiate_scopes(&metadata(Some(vec!["wabai:read"]))),
            REQUESTED_SCOPES.to_vec()
        );
    }

    #[test]
    fn oauth_errors_are_summarised_not_dumped() {
        assert_eq!(
            describe_oauth_error(r#"{"error":"invalid_grant","error_description":"código usado"}"#),
            "código usado"
        );
        assert_eq!(
            describe_oauth_error(r#"{"error":"invalid_client"}"#),
            "invalid_client"
        );
        assert_eq!(
            describe_oauth_error("<html>500</html>"),
            "el tenant no dio detalle"
        );
    }

    #[test]
    fn form_body_percent_encodes() {
        assert_eq!(
            form_body(&[("grant_type", "authorization_code"), ("code", "a b/c")]),
            "grant_type=authorization_code&code=a+b%2Fc"
        );
    }
}
