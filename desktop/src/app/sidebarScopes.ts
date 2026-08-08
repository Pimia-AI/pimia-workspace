/**
 * Las dos barras del workspace y las claves con las que persiste cada una.
 *
 * Divergencia Pimia (Fase 1). Upstream monta una sola barra; aquí conviven la
 * navegación del ERP a la izquierda y la de Buzz —canales, DM, agentes— a la
 * derecha. Sin claves separadas compartirían cookie, anchura y atajo, y se
 * abrirían y redimensionarían juntas. Ver `shared/ui/sidebar-provider.tsx` y
 * `docs/UPSTREAM.md`.
 */

import type { SidebarScope } from "@/shared/ui/sidebar-provider";

/**
 * La barra de Buzz. Conserva **las claves de upstream a propósito**: quien ya
 * usaba la app mantiene su anchura y su estado de apertura tras el cambio de
 * lado, y un cherry-pick de upstream que toque estas constantes sigue casando.
 */
export const BUZZ_SIDEBAR_SCOPE: SidebarScope = {
  id: "buzz",
  cookieName: "sidebar_state",
  widthStorageKey: "buzz-sidebar-width",
  keyboardShortcut: { key: "s", shiftKey: false },
  defaultWidth: 300,
  minWidth: 220,
  maxWidth: 420,
};

/**
 * La barra del ERP. Es la navegación primaria del workspace, así que colapsa a
 * iconos (`collapsible="icon"`) en vez de irse fuera de pantalla: nunca se
 * queda sin una superficie desde la que volver a abrirla.
 */
/**
 * Por debajo de esta anchura de ventana, la barra del ERP se pliega sola a
 * iconos.
 *
 * Con dos barras permanentes el contenido paga 548 px de cromo (248 + 300), y
 * en una ventana estrecha eso deja al hilo de mensajes o a la hoja de gestión
 * de canal sin sitio. Plegar la nav primaria a 48 px devuelve 200 px justo
 * cuando hacen falta, y el usuario puede volver a abrirla a mano: el efecto
 * solo actúa al cruzar el umbral, no lo bloquea.
 */
export const PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX = 1100;

export const PIMIA_SIDEBAR_SCOPE: SidebarScope = {
  id: "pimia",
  cookieName: "pimia_sidebar_state",
  widthStorageKey: "pimia-workspace-sidebar-width",
  keyboardShortcut: { key: "s", shiftKey: true },
  defaultWidth: 248,
  minWidth: 200,
  maxWidth: 360,
};
