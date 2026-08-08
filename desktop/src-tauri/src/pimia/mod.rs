//! Integración con la API de Pimia (el ERP).
//!
//! **La frontera del plan, y es innegociable**: los datos del ERP —clientes,
//! importes, datos fiscales— no pasan JAMÁS por el relay. Los mensajes de canal
//! de Buzz se guardan en claro en el Postgres del relay, que administra Block y
//! no nosotros. El ERP viaja solo por aquí: HTTP contra la API del tenant, con
//! OAuth y scopes, como cualquier app de partner.
//!
//! Por qué esto vive en Rust y no en el webview:
//!
//! 1. **El `TokenSet` no entra nunca en JavaScript.** Vive en el llavero del SO
//!    y el `access_token` solo se materializa dentro de [`api`] para poner la
//!    cabecera `Authorization`. El webview solo ve datos de negocio.
//! 2. **El refresh token de Pimia ROTA**: reusar uno ya rotado se lee como robo
//!    y revoca el grant ENTERO. Eso exige serializar el refresco y persistir el
//!    conjunto nuevo antes de reintentar — ver [`api::ensure_access_token`].
//! 3. **CORS**: el webview es un origen `tauri://`; el tenant no lo conoce.
//!
//! Modelo multi-tenant desde el día 1: **un token = un tenant**. El vault
//! guarda una conexión por tenant y una de ellas es la activa.

pub(crate) mod api;
pub(crate) mod commands;
pub(crate) mod login;
pub(crate) mod oauth;
pub(crate) mod vault;

// Reexport global a propósito: `#[tauri::command]` genera junto a cada función
// unos items ocultos (`__cmd__…`) que `generate_handler!` necesita, y un
// reexport nominal no los arrastra.
pub(crate) use commands::*;
pub(crate) use login::{deliver_oauth_deep_link, PimiaLoginState};
