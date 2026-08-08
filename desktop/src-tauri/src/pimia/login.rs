//! El retorno del navegador: cómo vuelve el `code` a la aplicación.
//!
//! La autorización se hace **en el navegador del sistema**, nunca en un webview
//! embebido: el usuario ve la barra de direcciones del tenant y su gestor de
//! contraseñas funciona. Eso obliga a tener un camino de vuelta, y hay dos
//! válidos (RFC 8252 §7):
//!
//! - **Loopback** `http://127.0.0.1:<puerto>/oauth/callback` (§7.3). Es el
//!   camino por defecto porque **funciona también en `tauri dev`**: no depende
//!   de que el SO tenga registrada la app.
//! - **Esquema propio** `pimia-workspace://oauth/callback` (§7.1), el que fijó
//!   el plan. macOS solo enruta esquemas de un `.app` empaquetado, así que en
//!   desarrollo no llega; queda como camino de respaldo y para builds firmados.
//!
//! Las dos URIs se registran a la vez en el tenant (ver [`redirect_uris`]), así
//! que cambiar de transporte no obliga a volver a registrar la app.
//!
//! El `state` es lo que ata el retorno a la petición: un callback con un
//! `state` que no es el que se mandó se descarta sin tocar nada.

use std::{collections::HashMap, sync::Mutex, time::Duration};

use axum::{
    extract::{Query, State as AxumState},
    response::{Html, IntoResponse, Response},
    routing::get,
    Router,
};
use tokio::{net::TcpListener, sync::oneshot};

/// Puertos de loopback que la app se registra e intenta ocupar, en orden.
/// Son fijos a propósito: el `redirect_uri` tiene que coincidir exactamente con
/// uno de los registrados en el tenant, y un puerto efímero obligaría a volver
/// a registrar la app en cada arranque.
const CALLBACK_PORTS: [u16; 3] = [53682, 53683, 53684];

/// URI de retorno por esquema propio. Registrada desde la Fase 0 en
/// `tauri.conf.json`.
pub(crate) const DEEP_LINK_REDIRECT_URI: &str = "pimia-workspace://oauth/callback";

/// Cuánto se espera al usuario antes de dar la autorización por abandonada.
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);

const CALLBACK_HTML: &str = r#"<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pimia Workspace</title>
<style>
  :root { color-scheme: light dark; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  body { min-height: 100dvh; margin: 0; display: grid; place-items: center; padding: 24px; background: Canvas; color: CanvasText; }
  main { width: min(100%, 420px); text-align: center; }
  h1 { margin: 0 0 12px; font-size: 22px; font-weight: 600; letter-spacing: -0.01em; }
  p { margin: 0; font-size: 15px; line-height: 1.5; opacity: 0.7; }
</style>
</head>
<body>
  <main>
    <h1>Listo</h1>
    <p>Ya puedes cerrar esta pestaña y volver a Pimia Workspace.</p>
  </main>
</body>
</html>"#;

/// Todas las URIs de retorno que la app se registra en el tenant.
pub(crate) fn redirect_uris() -> Vec<String> {
    let mut uris = vec![DEEP_LINK_REDIRECT_URI.to_string()];
    uris.extend(
        CALLBACK_PORTS
            .iter()
            .map(|port| loopback_redirect_uri(*port)),
    );
    uris
}

pub(crate) fn loopback_redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/oauth/callback")
}

pub(crate) const CANCELLED: &str = "autorización cancelada";

/// En qué punto está la autorización, para que el frontend pueda distinguir
/// «sigue en marcha» de «se quedó huérfana».
///
/// Hace falta porque la promesa de `invoke` no es fuente de verdad fiable: si el
/// webview se recarga a media invocación (una recarga de Vite, un reinicio), el
/// callback del comando se pierde —Tauri avisa con «Couldn't find callback id»—
/// y la UI se queda con un spinner que no termina nunca. Preguntando la fase se
/// puede decir «esto ya no está en marcha, vuelve a intentarlo».
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LoginPhase {
    /// No hay nada en marcha.
    #[default]
    Idle,
    /// Se abrió el navegador y se espera al usuario.
    AwaitingBrowser,
    /// Volvió el código y se está canjeando por tokens.
    Exchanging,
}

struct PendingLogin {
    oauth_state: String,
    sender: oneshot::Sender<Result<String, String>>,
}

/// La autorización en vuelo, si la hay. Solo puede haber una: empezar otra
/// cancela la anterior, que es lo que espera quien pulsa «Conectar» dos veces.
#[derive(Default)]
pub(crate) struct PimiaLoginState {
    pending: Mutex<Option<PendingLogin>>,
    phase: Mutex<LoginPhase>,
}

/// El único extremo del que cuelga el flujo.
///
/// Un solo canal a propósito. La primera versión tenía dos —código y
/// cancelación— y los tests destaparon la carrera: al entregar el código se
/// suelta el emisor de cancelación, y en un `select!` un receptor cuyo emisor
/// se ha soltado también se despierta, así que la cancelación ganaba a veces a
/// un resultado ya entregado (y al revés). Con un canal no hay nada que
/// desempatar: cancelar es entregar un error.
pub(crate) struct LoginChannel(oneshot::Receiver<Result<String, String>>);

impl PimiaLoginState {
    pub(crate) fn phase(&self) -> LoginPhase {
        *self.phase.lock().unwrap_or_else(|error| error.into_inner())
    }

    fn set_phase(&self, phase: LoginPhase) {
        *self.phase.lock().unwrap_or_else(|error| error.into_inner()) = phase;
    }

    pub(crate) fn begin(&self, oauth_state: &str) -> LoginChannel {
        let (sender, receiver) = oneshot::channel();

        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if let Some(previous) = pending.take() {
            let _ = previous
                .sender
                .send(Err("se empezó otra autorización".to_string()));
        }
        *pending = Some(PendingLogin {
            oauth_state: oauth_state.to_string(),
            sender,
        });
        drop(pending);
        self.set_phase(LoginPhase::AwaitingBrowser);

        LoginChannel(receiver)
    }

    /// Entrega el resultado del callback. Devuelve `false` cuando no había nada
    /// esperando o cuando el `state` no casa — y en ese caso no se toca nada:
    /// un callback ajeno no puede interrumpir una autorización en curso.
    pub(crate) fn deliver(&self, oauth_state: &str, result: Result<String, String>) -> bool {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if pending
            .as_ref()
            .is_none_or(|login| login.oauth_state != oauth_state)
        {
            return false;
        }

        match pending.take() {
            Some(login) => {
                let delivered_code = result.is_ok();
                let _ = login.sender.send(result);
                drop(pending);
                if delivered_code {
                    // El código ya volvió; lo que queda es el canje.
                    self.set_phase(LoginPhase::Exchanging);
                } else {
                    self.set_phase(LoginPhase::Idle);
                }
                true
            }
            None => false,
        }
    }

    pub(crate) fn cancel(&self) -> bool {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        let cancelled = match pending.take() {
            Some(login) => {
                let _ = login.sender.send(Err(CANCELLED.to_string()));
                true
            }
            None => false,
        };
        drop(pending);
        self.set_phase(LoginPhase::Idle);
        cancelled
    }

    /// Cierra el flujo: descarta la autorización en vuelo sin avisar a nadie y
    /// deja la fase en reposo. Se llama al salir (con éxito o con error) para no
    /// dejar vivo un `state` que un callback tardío pudiera reactivar, ni una
    /// fase que haga creer al frontend que sigue pasando algo.
    pub(crate) fn settle(&self, oauth_state: &str) {
        let mut pending = self
            .pending
            .lock()
            .unwrap_or_else(|error| error.into_inner());
        if pending
            .as_ref()
            .is_some_and(|login| login.oauth_state == oauth_state)
        {
            *pending = None;
        }
        drop(pending);
        self.set_phase(LoginPhase::Idle);
    }
}

/// El servidor de loopback levantado para una autorización. Se apaga solo al
/// soltarse (`Drop`), incluso si el flujo sale por un `?`.
pub(crate) struct LoopbackCallback {
    pub redirect_uri: String,
    handle: tokio::task::JoinHandle<()>,
}

impl Drop for LoopbackCallback {
    fn drop(&mut self) {
        self.handle.abort();
    }
}

/// Intenta levantar el servidor de callback en el primer puerto libre.
///
/// Devuelve `None` cuando ninguno de los puertos registrados está disponible;
/// el flujo cae entonces al esquema propio.
pub(crate) async fn start_loopback_callback(app: tauri::AppHandle) -> Option<LoopbackCallback> {
    for port in CALLBACK_PORTS {
        let Ok(listener) = TcpListener::bind(("127.0.0.1", port)).await else {
            continue;
        };

        let router = Router::new()
            .route("/oauth/callback", get(handle_loopback_callback))
            .with_state(app.clone());
        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, router).await;
        });

        return Some(LoopbackCallback {
            redirect_uri: loopback_redirect_uri(port),
            handle,
        });
    }

    None
}

async fn handle_loopback_callback(
    Query(query): Query<HashMap<String, String>>,
    AxumState(app): AxumState<tauri::AppHandle>,
) -> Response {
    let oauth_state = query.get("state").cloned().unwrap_or_default();
    deliver_from_query(&app, &oauth_state, &query);
    Html(CALLBACK_HTML).into_response()
}

/// Entrada del camino de esquema propio: la llama `deep_link.rs` cuando el SO
/// abre `pimia-workspace://oauth/callback?...`.
pub(crate) fn deliver_oauth_deep_link(app: &tauri::AppHandle, url: &url::Url) -> bool {
    let query: HashMap<String, String> = url.query_pairs().into_owned().collect();
    let oauth_state = query.get("state").cloned().unwrap_or_default();
    deliver_from_query(app, &oauth_state, &query)
}

fn deliver_from_query(
    app: &tauri::AppHandle,
    oauth_state: &str,
    query: &HashMap<String, String>,
) -> bool {
    use tauri::Manager as _;

    let result = match query.get("code").filter(|code| !code.is_empty()) {
        Some(code) => Ok(code.clone()),
        None => Err(query
            .get("error_description")
            .or_else(|| query.get("error"))
            .cloned()
            .unwrap_or_else(|| "el tenant no devolvió ningún código".to_string())),
    };

    app.state::<PimiaLoginState>().deliver(oauth_state, result)
}

/// Espera al callback, respetando la cancelación del usuario y el plazo máximo.
pub(crate) async fn await_authorization_code(channel: LoginChannel) -> Result<String, String> {
    match tokio::time::timeout(LOGIN_TIMEOUT, channel.0).await {
        Ok(Ok(result)) => result,
        Ok(Err(_)) => Err("el canal de retorno se cerró antes de tiempo".to_string()),
        Err(_) => Err("la autorización caducó; vuelve a intentarlo".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registers_the_deep_link_and_every_loopback_port() {
        let uris = redirect_uris();
        assert!(uris.contains(&DEEP_LINK_REDIRECT_URI.to_string()));
        for port in CALLBACK_PORTS {
            assert!(
                uris.contains(&format!("http://127.0.0.1:{port}/oauth/callback")),
                "falta el puerto {port} en las URIs registradas"
            );
        }
    }

    #[tokio::test]
    async fn delivers_only_when_the_state_matches() {
        let login = PimiaLoginState::default();
        let channels = login.begin("estado-bueno");

        assert!(
            !login.deliver("estado-ajeno", Ok("robado".to_string())),
            "un callback con otro state no puede entregar nada"
        );
        assert!(login.deliver("estado-bueno", Ok("codigo".to_string())));

        assert_eq!(
            await_authorization_code(channels).await,
            Ok("codigo".to_string())
        );
    }

    #[tokio::test]
    async fn a_second_login_cancels_the_first() {
        let login = PimiaLoginState::default();
        let first = login.begin("primero");
        let _second = login.begin("segundo");

        let result = await_authorization_code(first).await;
        assert!(result.is_err(), "la primera autorización debe morir");
        assert!(
            !login.deliver("primero", Ok("tarde".to_string())),
            "el state viejo ya no vale"
        );
    }

    #[tokio::test]
    async fn cancel_wins_over_a_pending_callback() {
        let login = PimiaLoginState::default();
        let channels = login.begin("estado");
        assert!(login.cancel());

        assert_eq!(
            await_authorization_code(channels).await,
            Err(CANCELLED.to_string())
        );
        assert!(!login.cancel(), "cancelar dos veces no encuentra nada");
    }

    #[tokio::test]
    async fn an_error_callback_surfaces_the_tenant_description() {
        let login = PimiaLoginState::default();
        let channels = login.begin("estado");
        login.deliver("estado", Err("acceso denegado".to_string()));

        assert_eq!(
            await_authorization_code(channels).await,
            Err("acceso denegado".to_string())
        );
    }

    /// La fase es lo que salva a la UI de un spinner eterno cuando el webview se
    /// recarga a media autorización: tiene que contar la verdad en cada paso, y
    /// volver a reposo por todos los caminos de salida.
    #[tokio::test]
    async fn the_phase_tracks_the_flow_and_always_returns_to_idle() {
        let login = PimiaLoginState::default();
        assert_eq!(login.phase(), LoginPhase::Idle);

        let channels = login.begin("estado");
        assert_eq!(login.phase(), LoginPhase::AwaitingBrowser);

        // Con el código en la mano, lo que queda es el canje.
        login.deliver("estado", Ok("codigo".to_string()));
        assert_eq!(login.phase(), LoginPhase::Exchanging);
        assert_eq!(
            await_authorization_code(channels).await,
            Ok("codigo".to_string())
        );

        // Y quien cierra el flujo la devuelve a reposo.
        login.settle("estado");
        assert_eq!(login.phase(), LoginPhase::Idle);
    }

    #[tokio::test]
    async fn a_failed_callback_or_a_cancel_leave_the_phase_idle() {
        let login = PimiaLoginState::default();

        let _channels = login.begin("estado");
        login.deliver("estado", Err("acceso denegado".to_string()));
        assert_eq!(
            login.phase(),
            LoginPhase::Idle,
            "un callback con error no deja el flujo en canje"
        );

        let _channels = login.begin("otro");
        assert_eq!(login.phase(), LoginPhase::AwaitingBrowser);
        login.cancel();
        assert_eq!(login.phase(), LoginPhase::Idle);
    }

    #[tokio::test]
    async fn settle_drops_the_pending_login() {
        let login = PimiaLoginState::default();
        let _channels = login.begin("estado");
        login.settle("otro");
        assert!(
            login.deliver("estado", Ok("codigo".to_string())),
            "finish con otro state no debe tocar la autorización viva"
        );

        let _channels = login.begin("estado");
        login.settle("estado");
        assert!(!login.deliver("estado", Ok("codigo".to_string())));
    }
}
