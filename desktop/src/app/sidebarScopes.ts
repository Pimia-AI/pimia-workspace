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
 * Por debajo de esta anchura de ventana, la barra del ERP se pliega sola a
 * iconos.
 *
 * De dónde sale el número, porque no es arbitrario. Con las dos barras abiertas
 * el contenido paga **548 px de cromo** (248 + 300) donde upstream pagaba 300.
 * Varias superficies de Buzz —la revisión de diffs, el dock de subida, la barra
 * de acciones de un mensaje— tienen sus propios umbrales responsive alrededor
 * de los 950 px de contenido, y por debajo de eso se degradan. 1400 es la
 * anchura de ventana a partir de la cual las dos barras abiertas dejan ese
 * margen: 1400 − 548 = 852 con la del ERP abierta, 1400 − 348 = 1052 plegada.
 *
 * Consecuencia práctica: en una pantalla de portátil (1512 lógicos) las dos
 * barras se ven abiertas; en una ventana más estrecha la nav del ERP se
 * convierte en una rejilla de iconos y devuelve 200 px al contenido. El efecto
 * solo actúa **al cruzar** el umbral: el usuario puede volver a abrirla a mano.
 */
export const PIMIA_SIDEBAR_COMPACT_BREAKPOINT_PX = 1400;

/**
 * La barra del ERP. Es la navegación primaria del workspace, así que colapsa a
 * iconos (`collapsible="icon"`) en vez de irse fuera de pantalla: nunca se
 * queda sin una superficie desde la que volver a abrirla.
 */
export const PIMIA_SIDEBAR_SCOPE: SidebarScope = {
  id: "pimia",
  cookieName: "pimia_sidebar_state",
  widthStorageKey: "pimia-workspace-sidebar-width",
  keyboardShortcut: { key: "s", shiftKey: true },
  defaultWidth: 248,
  minWidth: 200,
  maxWidth: 360,
};
